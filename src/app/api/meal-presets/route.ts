import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const itemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  portion: z.string().max(120).optional().nullable(),
  defaultGrams: z.number().positive().max(5000).optional().nullable(),
  kcal: z.number().int().min(0).max(10000),
  confidence: z.number().min(0).max(1).optional().nullable(),
  calculationSource: z.string().max(40).optional().nullable(),
  nutritionSourceId: z.string().optional().nullable()
});

const createSchema = z
  .object({
    mealEntryId: z.string().min(1).optional(),
    name: z.string().trim().min(1).max(60).optional(),
    imageUrl: z.string().url().optional().nullable(),
    description: z.string().max(1000).optional().nullable(),
    baseKcal: z.number().int().min(0).max(50000).optional(),
    items: z.array(itemSchema).min(1).max(30).optional()
  })
  .refine((value) => value.mealEntryId || (value.name && value.items?.length), {
    message: "请提供来源餐食或模板拆解结果"
  });

export async function GET() {
  const user = await requireApiUser();
  if (!user) return unauthorized();

  const presets = await prisma.mealPreset.findMany({
    include: { items: { include: { nutritionSource: true } } },
    orderBy: [{ lastUsedAt: "desc" }, { createdAt: "desc" }]
  });

  return NextResponse.json({ presets });
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser();
  if (!user) return unauthorized();

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "常用餐食信息不正确" }, { status: 400 });

  if (!parsed.data.mealEntryId) {
    const preset = await prisma.mealPreset.create({
      data: {
        name: parsed.data.name || "常用餐食",
        imageUrl: parsed.data.imageUrl,
        description: parsed.data.description,
        baseKcal: parsed.data.baseKcal ?? parsed.data.items!.reduce((total, item) => total + item.kcal, 0),
        items: { create: parsed.data.items! }
      },
      include: { items: { include: { nutritionSource: true } } }
    });
    return NextResponse.json({ preset }, { status: 201 });
  }

  const existing = await prisma.mealPreset.findUnique({
    where: { sourceMealEntryId: parsed.data.mealEntryId },
    include: { items: { include: { nutritionSource: true } } }
  });
  if (existing) return NextResponse.json({ preset: existing, existed: true });

  const meal = await prisma.mealEntry.findUnique({
    where: { id: parsed.data.mealEntryId },
    include: { items: true }
  });
  if (!meal || meal.status !== "confirmed") {
    return NextResponse.json({ error: "只能将已确认餐食保存为常用餐食" }, { status: 400 });
  }

  const defaultName = meal.items.map((item) => item.name).join("、") || meal.userDescription || "常用餐食";
  const preset = await prisma.mealPreset.create({
    data: {
      name: parsed.data.name || defaultName.slice(0, 60),
      imageUrl: meal.compressedImageUrl || meal.imageUrl,
      description: meal.userDescription,
      baseKcal: meal.finalKcal ?? meal.items.reduce((total, item) => total + item.kcal, 0),
      sourceMealEntryId: meal.id,
      items: {
        create: meal.items.map((item) => ({
          name: item.name,
          portion: item.portion,
          defaultGrams: item.grams,
          kcal: item.kcal,
          confidence: item.confidence,
          calculationSource: item.calculationSource,
          nutritionSourceId: item.nutritionSourceId
        }))
      }
    },
    include: { items: { include: { nutritionSource: true } } }
  });

  return NextResponse.json({ preset }, { status: 201 });
}
