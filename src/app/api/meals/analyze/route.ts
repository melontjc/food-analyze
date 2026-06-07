import { after, NextRequest, NextResponse } from "next/server";
import { prepareMealImage, toDataUrl } from "@/lib/image";
import { uploadImage } from "@/lib/blob";
import { analyzeMealImage, analyzeMealText, normalizeMealText } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import { requireApiUser, unauthorized } from "@/lib/auth";
import { isDateKey, todayKey } from "@/lib/date";

export const runtime = "nodejs";
const MEAL_SLOTS = new Set(["breakfast", "lunch", "dinner", "snack"]);
const NUTRITION_SOURCE_LIMIT = 80;
const NUTRITION_SOURCE_CACHE_MS = 30_000;

type AnalysisNutritionSource = {
  id: string;
  name: string;
  kcalPer100g: number;
  confidence: number | null;
};

let nutritionSourcesCache: { expiresAt: number; sources: AnalysisNutritionSource[] } | null = null;

export async function POST(request: NextRequest) {
  const requestStartedAt = Date.now();
  const user = await requireApiUser();
  if (!user) return unauthorized();

  const form = await request.formData();
  const file = form.get("image");
  const date = String(form.get("dateKey") || todayKey());
  const mealSlot = String(form.get("mealSlot") || "snack");
  const userDescription = String(form.get("userDescription") || "").trim().slice(0, 1000);
  const draftId = String(form.get("draftId") || "").trim();
  const clientCompressionMs = numberFromForm(form.get("clientCompressionMs"), 60_000);
  const clientOriginalBytes = numberFromForm(form.get("clientOriginalBytes"), 100 * 1024 * 1024);

  if (!isDateKey(date)) return NextResponse.json({ error: "日期格式不正确" }, { status: 400 });
  if (!MEAL_SLOTS.has(mealSlot)) return NextResponse.json({ error: "餐别不正确" }, { status: 400 });
  if (!(file instanceof File) && !userDescription) {
    return NextResponse.json({ error: "请上传餐食图片或填写餐食描述" }, { status: 400 });
  }

  try {
    const existingDraft = draftId
      ? await prisma.mealEntry.findFirst({ where: { id: draftId, status: "draft" } })
      : null;
    if (draftId && !existingDraft) {
      return NextResponse.json({ error: "当前草稿已失效，请重新分析" }, { status: 404 });
    }

    const imageFile = file instanceof File ? file : null;
    const nutritionSourcesPromise = getAnalysisNutritionSources();
    const serverCompressionStartedAt = Date.now();
    const prepared = imageFile ? await prepareMealImage(imageFile) : null;
    const serverCompressionMs = Date.now() - serverCompressionStartedAt;
    const stamp = `${date}/${Date.now()}`;
    let blobUploadMs = 0;
    const compressedImageUrlPromise = prepared
      ? (async () => {
          const blobUploadStartedAt = Date.now();
          try {
            return await uploadImage(`meals/model/${stamp}.jpg`, prepared.compressed, prepared.contentType);
          } finally {
            blobUploadMs = Date.now() - blobUploadStartedAt;
          }
        })()
      : Promise.resolve<string | null>(null);
    const nutritionSources = await nutritionSourcesPromise;
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
      const storedOriginalBytes = clientOriginalBytes || prepared?.originalBytes;
      const message = error instanceof Error ? error.message : "餐食分析失败";
      if (existingDraft) {
        compressedImageUrlPromise.catch(() => undefined);
        const entry = await prisma.mealEntry.findUnique({
          where: { id: existingDraft.id },
          include: { items: { include: { nutritionSource: true } } }
        });
        return NextResponse.json(
          {
            entry,
            warning: `${message}。已保留上一次草稿，请稍后重试。`,
            timings: createTimings({
              clientCompressionMs,
              serverCompressionMs,
              blobUploadMs,
              openAiMs,
              databaseMs: 0,
              totalServerMs: Date.now() - requestStartedAt
            })
          },
          { status: 202 }
        );
      }
      const compressedImageUrl = await compressedImageUrlPromise;
      const databaseStartedAt = Date.now();
      const entry = await prisma.mealEntry.create({
        data: {
          dateKey: date,
          mealSlot,
          status: "draft",
          imageUrl: null,
          compressedImageUrl,
          userDescription: userDescription || null,
          originalBytes: storedOriginalBytes,
          compressedBytes: prepared?.compressedBytes,
          uncertainty: message,
          notes: "模型分析失败，可手动填写热量后确认。"
        },
        include: { items: true }
      });
      scheduleOriginalImageUpload(entry.id, prepared, imageFile, stamp);
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
    const compressedImageUrl = await compressedImageUrlPromise;
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
    const entryData = {
      dateKey: date,
      mealSlot,
      status: "draft",
      imageUrl: null,
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
    };
    const entry = existingDraft
      ? await prisma.$transaction(async (transaction) => {
          await transaction.mealItem.deleteMany({ where: { mealEntryId: existingDraft.id } });
          return transaction.mealEntry.update({
            where: { id: existingDraft.id },
            data: entryData,
            include: { items: { include: { nutritionSource: true } } }
          });
        })
      : await prisma.mealEntry.create({
          data: entryData,
          include: { items: { include: { nutritionSource: true } } }
        });
    const databaseMs = Date.now() - databaseStartedAt;
    scheduleOriginalImageUpload(entry.id, prepared, imageFile, stamp);
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

async function getAnalysisNutritionSources() {
  const now = Date.now();
  if (nutritionSourcesCache && nutritionSourcesCache.expiresAt > now) {
    return nutritionSourcesCache.sources;
  }

  const sources = await prisma.nutritionSource.findMany({
    select: {
      id: true,
      name: true,
      kcalPer100g: true,
      confidence: true
    },
    orderBy: { updatedAt: "desc" },
    take: NUTRITION_SOURCE_LIMIT
  });
  nutritionSourcesCache = { expiresAt: now + NUTRITION_SOURCE_CACHE_MS, sources };
  return sources;
}

function scheduleOriginalImageUpload(entryId: string, prepared: Awaited<ReturnType<typeof prepareMealImage>> | null, imageFile: File | null, stamp: string) {
  if (!prepared) return;
  after(async () => {
    try {
      const imageUrl = await uploadImage(`meals/original/${stamp}.jpg`, prepared.original, imageFile?.type || "image/jpeg");
      await prisma.mealEntry.update({ where: { id: entryId }, data: { imageUrl } });
    } catch (error) {
      console.warn("[meal-original-upload-failed]", error);
    }
  });
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
