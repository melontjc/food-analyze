import { NextRequest, NextResponse } from "next/server";
import { requireApiUser, unauthorized } from "@/lib/auth";
import { uploadImage } from "@/lib/blob";
import { prepareMealImage, toDataUrl } from "@/lib/image";
import { analyzeMealImage, analyzeMealText, normalizeMealText } from "@/lib/openai";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await requireApiUser();
  if (!user) return unauthorized();

  const form = await request.formData();
  const file = form.get("image");
  const description = String(form.get("description") || "").trim().slice(0, 1000);
  if (!(file instanceof File) && !description) {
    return NextResponse.json({ error: "请上传套餐图片或填写套餐描述" }, { status: 400 });
  }

  try {
    const imageFile = file instanceof File ? file : null;
    const prepared = imageFile ? await prepareMealImage(imageFile) : null;
    const imageUrl = prepared
      ? await uploadImage(`meal-presets/${Date.now()}.jpg`, prepared.original, imageFile?.type || "image/jpeg")
      : null;
    const analysis = prepared
      ? await analyzeMealImage(toDataUrl(prepared.compressed, prepared.contentType), description)
      : await analyzeMealText(description);

    return NextResponse.json({
      preset: {
        name: normalizeMealText(analysis.items.map((item) => item.name).join("、")) || "常用餐食",
        imageUrl,
        description: description || null,
        baseKcal: analysis.total_kcal,
        items: analysis.items.map((item) => ({
          name: normalizeMealText(item.name) || "食物",
          portion: normalizeMealText(item.portion),
          defaultGrams: null,
          kcal: item.kcal,
          confidence: item.confidence ?? null,
          calculationSource: "ai_estimate",
          nutritionSourceId: null
        }))
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "套餐拆解失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
