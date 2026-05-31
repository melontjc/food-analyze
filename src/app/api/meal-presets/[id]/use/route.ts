import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, unauthorized } from "@/lib/auth";
import { isDateKey, todayKey } from "@/lib/date";
import { normalizeMealText, recalculatePresetItems } from "@/lib/openai";
import { prisma } from "@/lib/prisma";

const useSchema = z.object({
  dateKey: z.string().optional(),
  saveAsDefault: z.boolean().default(false),
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        grams: z.number().positive().max(5000).nullable()
      })
    )
    .default([])
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return unauthorized();

  const parsed = useSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "食物克数不正确" }, { status: 400 });
  const dateKey = parsed.data.dateKey || todayKey();
  if (!isDateKey(dateKey)) return NextResponse.json({ error: "日期格式不正确" }, { status: 400 });

  const { id } = await context.params;
  const preset = await prisma.mealPreset.findUnique({
    where: { id },
    include: { items: { include: { nutritionSource: true } } }
  });
  if (!preset) return NextResponse.json({ error: "常用餐食不存在" }, { status: 404 });

  const requested = new Map(parsed.data.items.map((item) => [item.id, item.grams]));
  const gramsChanged = preset.items.some((item) => {
    if (!requested.has(item.id)) return false;
    return requested.get(item.id) !== item.defaultGrams;
  });

  if (!gramsChanged) {
    const [entry] = await prisma.$transaction([
      prisma.mealEntry.create({
        data: {
          dateKey,
          status: "confirmed",
          compressedImageUrl: preset.imageUrl,
          userDescription: `常用餐食：${preset.name}`,
          finalKcal: preset.baseKcal,
          notes: "从常用餐食快速计入。",
          items: {
            create: preset.items.map((item) => ({
              name: item.name,
              portion: item.portion,
              grams: item.defaultGrams,
              kcal: item.kcal,
              confidence: item.confidence,
              calculationSource: item.calculationSource || "preset_cache",
              nutritionSourceId: item.nutritionSourceId
            }))
          }
        },
        include: { items: true }
      }),
      prisma.mealPreset.update({
        where: { id },
        data: { usageCount: { increment: 1 }, lastUsedAt: new Date() }
      })
    ]);
    return NextResponse.json({ entry, confirmed: true }, { status: 201 });
  }

  const configuredItems = preset.items.map((item) => ({
    ...item,
    grams: requested.has(item.id) ? requested.get(item.id)! : item.defaultGrams
  }));
  if (configuredItems.some((item) => item.grams == null)) {
    return NextResponse.json({ error: "修改克数前，请先为模板内每种食物补充克数" }, { status: 400 });
  }

  let calculatedItems = configuredItems.map((item) => ({
    presetItemId: item.id,
    name: item.name,
    grams: item.grams!,
    kcal: item.nutritionSource
      ? Math.round((item.nutritionSource.kcalPer100g * item.grams!) / 100)
      : item.kcal,
    confidence: item.nutritionSource?.confidence ?? item.confidence,
    calculationSource: item.nutritionSource ? "nutrition_label" : "ai_estimate",
    nutritionSourceId: item.nutritionSourceId
  }));
  let confidence = averageConfidence(calculatedItems.map((item) => item.confidence));
  let notes = "已根据模板克数重新计算，确认后计入当天。";
  let uncertainty: string | null = null;

  if (configuredItems.some((item) => !item.nutritionSource)) {
    try {
      const recalculated = await recalculatePresetItems(
        configuredItems.map((item) => ({
          presetItemId: item.id,
          name: item.name,
          grams: item.grams!,
          portion: item.portion,
          kcalPer100g: item.nutritionSource?.kcalPer100g,
          cookingNotes: preset.description
        }))
      );
      const byId = new Map(recalculated.items.map((item) => [item.preset_item_id, item]));
      calculatedItems = calculatedItems.map((item) => {
        const aiItem = byId.get(item.presetItemId);
        if (!aiItem || item.calculationSource === "nutrition_label") return item;
        return { ...item, name: normalizeMealText(aiItem.name) || item.name, kcal: aiItem.kcal, confidence: aiItem.confidence ?? null };
      });
      confidence = recalculated.confidence ?? averageConfidence(calculatedItems.map((item) => item.confidence));
      notes = normalizeMealText(recalculated.notes) || notes;
      uncertainty = normalizeMealText(recalculated.uncertainty);
    } catch (error) {
      const message = error instanceof Error ? error.message : "OpenAI 复核失败";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const finalKcal = calculatedItems.reduce((total, item) => total + item.kcal, 0);
  const entry = await prisma.$transaction(async (transaction) => {
    if (parsed.data.saveAsDefault) {
      await Promise.all(
        configuredItems.map((item) =>
          transaction.mealPresetItem.update({
            where: { id: item.id },
            data: {
              defaultGrams: item.grams,
              kcal: calculatedItems.find((calculated) => calculated.presetItemId === item.id)!.kcal,
              calculationSource: calculatedItems.find((calculated) => calculated.presetItemId === item.id)!.calculationSource
            }
          })
        )
      );
      await transaction.mealPreset.update({ where: { id }, data: { baseKcal: finalKcal } });
    }
    const draftEntry = await transaction.mealEntry.create({
      data: {
        dateKey,
        status: "draft",
        compressedImageUrl: preset.imageUrl,
        userDescription: `常用餐食克数调整：${preset.name}`,
        finalKcal,
        modelKcal: finalKcal,
        confidence,
        notes,
        uncertainty,
        items: {
          create: calculatedItems.map((item) => ({
            name: item.name,
            portion: `${formatGrams(item.grams)}g`,
            grams: item.grams,
            kcal: item.kcal,
            confidence: item.confidence,
            calculationSource: item.calculationSource,
            nutritionSourceId: item.nutritionSourceId
          }))
        }
      },
      include: { items: true }
    });
    await transaction.mealPreset.update({
      where: { id },
      data: { usageCount: { increment: 1 }, lastUsedAt: new Date() }
    });
    return draftEntry;
  });

  return NextResponse.json({ entry, confirmed: false }, { status: 202 });
}

function formatGrams(grams: number) {
  return Number(grams.toFixed(1)).toString();
}

function averageConfidence(values: Array<number | null>) {
  const validValues = values.filter((value): value is number => value != null);
  if (!validValues.length) return null;
  return validValues.reduce((total, value) => total + value, 0) / validValues.length;
}
