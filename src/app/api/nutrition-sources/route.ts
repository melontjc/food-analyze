import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  imageUrl: z.string().url().optional().nullable(),
  kcalPer100g: z.number().positive().max(2000),
  proteinPer100g: z.number().min(0).max(100).optional().nullable(),
  fatPer100g: z.number().min(0).max(100).optional().nullable(),
  carbsPer100g: z.number().min(0).max(100).optional().nullable(),
  confidence: z.number().min(0).max(1).optional().nullable(),
  notes: z.string().max(1000).optional().nullable()
});

export async function GET() {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  const sources = await prisma.nutritionSource.findMany({ orderBy: { updatedAt: "desc" } });
  return NextResponse.json({ sources });
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser();
  if (!user) return unauthorized();
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "营养成分信息不正确" }, { status: 400 });
  const source = await prisma.nutritionSource.create({ data: parsed.data });
  return NextResponse.json({ source }, { status: 201 });
}
