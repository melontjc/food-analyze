import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  mealEntryId: z.string().min(1),
  name: z.string().trim().min(1).max(60).optional()
});

export async function GET() {
  const user = await requireApiUser();
  if (!user) return unauthorized();

  const presets = await prisma.mealPreset.findMany({
    include: { items: true },
    orderBy: [{ lastUsedAt: "desc" }, { createdAt: "desc" }]
  });

  return NextResponse.json({ presets });
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser();
  if (!user) return unauthorized();

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "常用餐食信息不正确" }, { status: 400 });

  const existing = await prisma.mealPreset.findUnique({
    where: { sourceMealEntryId: parsed.data.mealEntryId },
    include: { items: true }
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
          kcal: item.kcal,
          confidence: item.confidence
        }))
      }
    },
    include: { items: true }
  });

  return NextResponse.json({ preset }, { status: 201 });
}
