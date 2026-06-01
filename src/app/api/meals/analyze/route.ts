import { NextRequest, NextResponse } from "next/server";
import { prepareMealImage, toDataUrl } from "@/lib/image";
import { uploadImage } from "@/lib/blob";
import { analyzeMealImage, analyzeMealText, normalizeMealText } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import { requireApiUser, unauthorized } from "@/lib/auth";
import { isDateKey, todayKey } from "@/lib/date";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const requestStartedAt = Date.now();
  const user = await requireApiUser();
  if (!user) return unauthorized();

  const form = await request.formData();
  const file = form.get("image");
  const date = String(form.get("dateKey") || todayKey());
  const userDescription = String(form.get("userDescription") || "").trim().slice(0, 1000);
  const clientCompressionMs = numberFromForm(form.get("clientCompressionMs"), 60_000);
  const clientOriginalBytes = numberFromForm(form.get("clientOriginalBytes"), 100 * 1024 * 1024);

  if (!isDateKey(date)) return NextResponse.json({ error: "日期格式不正确" }, { status: 400 });
  if (!(file instanceof File) && !userDescription) {
    return NextResponse.json({ error: "请上传餐食图片或填写餐食描述" }, { status: 400 });
  }

  try {
    const imageFile = file instanceof File ? file : null;
    const serverCompressionStartedAt = Date.now();
    const prepared = imageFile ? await prepareMealImage(imageFile) : null;
    const serverCompressionMs = Date.now() - serverCompressionStartedAt;
    const stamp = `${date}/${Date.now()}`;
    let blobUploadMs = 0;
    const uploadedImagesPromise = prepared
      ? (async () => {
          const blobUploadStartedAt = Date.now();
          try {
            return await Promise.all([
              uploadImage(`meals/original/${stamp}.jpg`, prepared.original, imageFile?.type || "image/jpeg"),
              uploadImage(`meals/model/${stamp}.jpg`, prepared.compressed, prepared.contentType)
            ]);
          } finally {
            blobUploadMs = Date.now() - blobUploadStartedAt;
          }
        })()
      : Promise.resolve<[null, null]>([null, null]);
    const nutritionSources = await prisma.nutritionSource.findMany({ orderBy: { updatedAt: "desc" } });
    const nutritionHints = nutritionSources.map(({ name, kcalPer100g }) => ({ name, kcalPer100g }));

    let analysis;
    let openAiMs = 0;
    let openAiStartedAt = 0;
    try {
      openAiStartedAt = Date.now();
      analysis = prepared
        ? await analyzeMealImage(toDataUrl(prepared.compressed, prepared.contentType), userDescription, nutritionHints)
        : await analyzeMealText(userDescription, nutritionHints);
      openAiMs = Date.now() - openAiStartedAt;
    } catch (error) {
      openAiMs ||= Date.now() - openAiStartedAt;
      const [imageUrl, compressedImageUrl] = await uploadedImagesPromise;
      const storedOriginalBytes = clientOriginalBytes || prepared?.originalBytes;
      const message = error instanceof Error ? error.message : "餐食分析失败";
      const databaseStartedAt = Date.now();
      const entry = await prisma.mealEntry.create({
        data: {
          dateKey: date,
          status: "draft",
          imageUrl,
          compressedImageUrl,
          userDescription: userDescription || null,
          originalBytes: storedOriginalBytes,
          compressedBytes: prepared?.compressedBytes,
          uncertainty: message,
          notes: "模型分析失败，可手动填写热量后确认。"
        },
        include: { items: true }
      });
      const databaseMs = Date.now() - databaseStartedAt;
      return NextResponse.json(
        {
          entry,
          warning: message,
          timings: createTimings({
            clientCompressionMs,
            serverCompressionMs,
            blobUploadMs,
            openAiMs,
            databaseMs,
            totalServerMs: Date.now() - requestStartedAt
          })
        },
        { status: 202 }
      );
    }
    const [imageUrl, compressedImageUrl] = await uploadedImagesPromise;
    const storedOriginalBytes = clientOriginalBytes || prepared?.originalBytes;

    const analyzedItems = analysis.items.map((item) => {
      const nutritionSource = findNutritionSource(item.name, nutritionSources);
      const grams = item.grams ?? null;
      return {
        name: normalizeMealText(item.name) || "餐食",
        portion: normalizeMealText(item.portion),
        grams,
        kcal: nutritionSource && grams != null ? Math.round((nutritionSource.kcalPer100g * grams) / 100) : item.kcal,
        confidence: nutritionSource?.confidence ?? item.confidence ?? null,
        calculationSource: nutritionSource && grams != null ? "nutrition_label" : "ai_estimate",
        nutritionSourceId: nutritionSource?.id ?? null
      };
    });
    const adjustedTotalKcal = analyzedItems.length
      ? analyzedItems.reduce((total, item) => total + item.kcal, 0)
      : analysis.total_kcal;

    const databaseStartedAt = Date.now();
    const entry = await prisma.mealEntry.create({
      data: {
        dateKey: date,
        status: "draft",
        imageUrl,
        compressedImageUrl,
        userDescription: userDescription || null,
        originalBytes: storedOriginalBytes,
        compressedBytes: prepared?.compressedBytes,
        modelKcal: adjustedTotalKcal,
        finalKcal: adjustedTotalKcal,
        confidence: analysis.confidence ?? null,
        uncertainty: normalizeMealText(analysis.uncertainty),
        notes: normalizeMealText(analysis.notes),
        items: {
          create: analyzedItems
        }
      },
      include: { items: { include: { nutritionSource: true } } }
    });
    const databaseMs = Date.now() - databaseStartedAt;
    const timings = createTimings({
      clientCompressionMs,
      serverCompressionMs,
      blobUploadMs,
      openAiMs,
      databaseMs,
      totalServerMs: Date.now() - requestStartedAt
    });
    console.info("[meal-analysis-timings]", timings);

    return NextResponse.json({
      entry,
      timings,
      compression: prepared
        ? {
            originalBytes: storedOriginalBytes || prepared.originalBytes,
            compressedBytes: prepared.compressedBytes,
            savedPercent: Math.max(0, Math.round((1 - prepared.compressedBytes / (storedOriginalBytes || prepared.originalBytes)) * 100))
          }
        : null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "上传失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function numberFromForm(value: FormDataEntryValue | null, max: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 && numberValue <= max ? Math.round(numberValue) : 0;
}

function createTimings(timings: {
  clientCompressionMs: number;
  serverCompressionMs: number;
  blobUploadMs: number;
  openAiMs: number;
  databaseMs: number;
  totalServerMs: number;
}) {
  return timings;
}

function findNutritionSource(
  itemName: string,
  sources: Array<{ id: string; name: string; kcalPer100g: number; confidence: number | null }>
) {
  const itemKey = foodNameKey(itemName);
  return sources.find((source) => foodNameKey(source.name) === itemKey) || null;
}

function foodNameKey(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[\s·,，、()（）\-_/]/g, "");
}
