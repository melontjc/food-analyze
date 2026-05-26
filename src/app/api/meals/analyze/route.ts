import { NextRequest, NextResponse } from "next/server";
import { prepareMealImage, toDataUrl } from "@/lib/image";
import { uploadImage } from "@/lib/blob";
import { analyzeMealImage, analyzeMealText, normalizeMealText } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import { requireApiUser, unauthorized } from "@/lib/auth";
import { isDateKey, todayKey } from "@/lib/date";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await requireApiUser();
  if (!user) return unauthorized();

  const form = await request.formData();
  const file = form.get("image");
  const date = String(form.get("dateKey") || todayKey());
  const userDescription = String(form.get("userDescription") || "").trim().slice(0, 1000);

  if (!isDateKey(date)) return NextResponse.json({ error: "日期格式不正确" }, { status: 400 });
  if (!(file instanceof File) && !userDescription) {
    return NextResponse.json({ error: "请上传餐食图片或填写餐食描述" }, { status: 400 });
  }

  try {
    const imageFile = file instanceof File ? file : null;
    const prepared = imageFile ? await prepareMealImage(imageFile) : null;
    const stamp = `${date}/${Date.now()}`;
    const [imageUrl, compressedImageUrl] = prepared
      ? await Promise.all([
          uploadImage(`meals/original/${stamp}.jpg`, prepared.original, imageFile?.type || "image/jpeg"),
          uploadImage(`meals/model/${stamp}.jpg`, prepared.compressed, prepared.contentType)
        ])
      : [null, null];

    let analysis;
    try {
      analysis = prepared
        ? await analyzeMealImage(toDataUrl(prepared.compressed, prepared.contentType), userDescription)
        : await analyzeMealText(userDescription);
    } catch (error) {
      const message = error instanceof Error ? error.message : "餐食分析失败";
      const entry = await prisma.mealEntry.create({
        data: {
          dateKey: date,
          status: "draft",
          imageUrl,
          compressedImageUrl,
          userDescription: userDescription || null,
          originalBytes: prepared?.originalBytes,
          compressedBytes: prepared?.compressedBytes,
          uncertainty: message,
          notes: "模型分析失败，可手动填写热量后确认。"
        },
        include: { items: true }
      });
      return NextResponse.json({ entry, warning: message }, { status: 202 });
    }

    const entry = await prisma.mealEntry.create({
      data: {
        dateKey: date,
        status: "draft",
        imageUrl,
        compressedImageUrl,
        userDescription: userDescription || null,
        originalBytes: prepared?.originalBytes,
        compressedBytes: prepared?.compressedBytes,
        modelKcal: analysis.total_kcal,
        finalKcal: analysis.total_kcal,
        confidence: analysis.confidence ?? null,
        uncertainty: normalizeMealText(analysis.uncertainty),
        notes: normalizeMealText(analysis.notes),
        items: {
          create: analysis.items.map((item) => ({
            name: normalizeMealText(item.name) || "餐食",
            portion: normalizeMealText(item.portion),
            kcal: item.kcal,
            confidence: item.confidence ?? null
          }))
        }
      },
      include: { items: true }
    });

    return NextResponse.json({
      entry,
      compression: prepared
        ? {
            originalBytes: prepared.originalBytes,
            compressedBytes: prepared.compressedBytes,
            savedPercent: Math.max(0, Math.round((1 - prepared.compressedBytes / prepared.originalBytes) * 100))
          }
        : null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "上传失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
