import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, unauthorized } from "@/lib/auth";
import { isDateKey, todayKey } from "@/lib/date";
import { prisma } from "@/lib/prisma";

const useSchema = z.object({
  dateKey: z.string().optional(),
  multiplier: z.number().min(0.1).max(10).default(1)
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return unauthorized();

  const parsed = useSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "份数不正确" }, { status: 400 });

  const dateKey = parsed.data.dateKey || todayKey();
  if (!isDateKey(dateKey)) return NextResponse.json({ error: "日期格式不正确" }, { status: 400 });

  const { id } = await context.params;
  const preset = await prisma.mealPreset.findUnique({ where: { id }, include: { items: true } });
  if (!preset) return NextResponse.json({ error: "常用餐食不存在" }, { status: 404 });

  const multiplier = parsed.data.multiplier;
  const portionSuffix = multiplier === 1 ? "" : ` × ${formatMultiplier(multiplier)}`;
  const [entry] = await prisma.$transaction([
    prisma.mealEntry.create({
      data: {
        dateKey,
        status: "confirmed",
        compressedImageUrl: preset.imageUrl,
        userDescription: `常用餐食：${preset.name}${portionSuffix}`,
        finalKcal: Math.round(preset.baseKcal * multiplier),
        notes: "从常用餐食快速计入。",
        items: {
          create: preset.items.map((item) => ({
            name: item.name,
            portion: item.portion ? `${item.portion}${portionSuffix}` : portionSuffix.slice(3) || null,
            kcal: Math.round(item.kcal * multiplier),
            confidence: item.confidence
          }))
        }
      },
      include: { items: true }
    }),
    prisma.mealPreset.update({
      where: { id },
      data: {
        usageCount: { increment: 1 },
        lastUsedAt: new Date()
      }
    })
  ]);

  return NextResponse.json({ entry }, { status: 201 });
}

function formatMultiplier(multiplier: number) {
  return Number(multiplier.toFixed(2)).toString();
}
