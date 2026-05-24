import { NextRequest, NextResponse } from "next/server";
import { prepareMealImage, toDataUrl } from "@/lib/image";
import { uploadImage } from "@/lib/blob";
import { analyzeMealImage, normalizeMealText } from "@/lib/openai";
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
  if (!(file instanceof File)) return NextResponse.json({ error: "请选择餐食图片" }, { status: 400 });

  try {
    const prepared = await prepareMealImage(file);
    const stamp = `${date}/${Date.now()}`;
    const [imageUrl, compressedImageUrl] = await Promise.all([
      uploadImage(`meals/original/${stamp}.jpg`, prepared.original, file.type || "image/jpeg"),
      uploadImage(`meals/model/${stamp}.jpg`, prepared.compressed, prepared.contentType)
    ]);

    let analysis;
    try {
      analysis = await analyzeMealImage(toDataUrl(prepared.compressed, prepared.contentType), userDescription);
    } catch (error) {
      const message = error instanceof Error ? error.message : "图片分析失败";
      const entry = await prisma.mealEntry.create({
        data: {
          dateKey: date,
          status: "draft",
          imageUrl,
          compressedImageUrl,
          userDescription: userDescription || null,
          originalBytes: prepared.originalBytes,
          compressedBytes: prepared.compressedBytes,
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
        originalBytes: prepared.originalBytes,
        compressedBytes: prepared.compressedBytes,
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
      compression: {
        originalBytes: prepared.originalBytes,
        compressedBytes: prepared.compressedBytes,
        savedPercent: Math.max(0, Math.round((1 - prepared.compressedBytes / prepared.originalBytes) * 100))
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "上传失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
