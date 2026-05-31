import { NextRequest, NextResponse } from "next/server";
import { requireApiUser, unauthorized } from "@/lib/auth";
import { uploadImage } from "@/lib/blob";
import { prepareMealImage, toDataUrl } from "@/lib/image";
import { analyzeNutritionLabel, normalizeMealText } from "@/lib/openai";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await requireApiUser();
  if (!user) return unauthorized();

  const form = await request.formData();
  const file = form.get("image");
  const suggestedName = String(form.get("name") || "").trim().slice(0, 80);
  if (!(file instanceof File)) return NextResponse.json({ error: "请上传营养成分表图片" }, { status: 400 });

  try {
    const prepared = await prepareMealImage(file);
    const stamp = `${Date.now()}`;
    const imageUrl = await uploadImage(`nutrition-labels/${stamp}.jpg`, prepared.original, file.type || "image/jpeg");
    const analysis = await analyzeNutritionLabel(toDataUrl(prepared.compressed, prepared.contentType), suggestedName);
    return NextResponse.json({
      source: {
        name: normalizeMealText(analysis.name) || suggestedName || "食品成分表",
        imageUrl,
        kcalPer100g: analysis.kcal_per_100g,
        proteinPer100g: analysis.protein_per_100g ?? null,
        fatPer100g: analysis.fat_per_100g ?? null,
        carbsPer100g: analysis.carbs_per_100g ?? null,
        confidence: analysis.confidence ?? null,
        notes: normalizeMealText(analysis.notes)
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "营养成分表识别失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
