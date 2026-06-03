import { NextRequest, NextResponse } from "next/server";
import { requireApiUser, unauthorized } from "@/lib/auth";
import { analyzeDashboardInsight } from "@/lib/openai";
import { isDateKey } from "@/lib/date";
import { z } from "zod";

export const runtime = "nodejs";

const insightRequestSchema = z.object({
  dateKey: z.string().refine((value) => isDateKey(value), "日期格式不正确"),
  fingerprint: z.string().min(1).max(80),
  primarySignal: z
    .object({
      slot: z.string(),
      label: z.string(),
      correlation: z.number().nullable(),
      absCorrelation: z.number(),
      sampleSize: z.number().int().nonnegative(),
      strengthLabel: z.string(),
      meaningful: z.boolean(),
      recommendation: z.string()
    })
    .nullable(),
  slotCorrelations: z.array(
    z.object({
      slot: z.string(),
      label: z.string(),
      correlation: z.number().nullable(),
      absCorrelation: z.number(),
      sampleSize: z.number().int().nonnegative(),
      eligible: z.boolean(),
      strengthLabel: z.string(),
      averageKcal: z.number(),
      variation: z.number().nullable()
    })
  ),
  metrics: z.record(z.string(), z.unknown()),
  recentDays: z.array(z.record(z.string(), z.unknown())).max(28)
});

export async function POST(request: NextRequest) {
  const user = await requireApiUser();
  if (!user) return unauthorized();

  const parsed = insightRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "分析数据格式不正确" }, { status: 400 });
  }

  const input = parsed.data;
  if (!input.primarySignal || input.primarySignal.sampleSize < 5) {
    return NextResponse.json({
      source: "template",
      insight: insufficientInsight(input.primarySignal?.label)
    });
  }

  if (process.env.NODE_ENV !== "production" && process.env.LOCAL_MOCK_DATA === "true") {
    return NextResponse.json({
      source: "mock-ai",
      insight: mockInsight(input)
    });
  }

  try {
    const insight = await analyzeDashboardInsight(input);
    return NextResponse.json({ source: "ai", insight });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 数据解读失败";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

function insufficientInsight(slotLabel?: string | null) {
  return {
    summaryTitle: "继续积累记录",
    insights: [
      slotLabel ? `${slotLabel}相关性样本还不足，暂时不适合下结论。` : "四个餐别暂时都没有足够样本参与相关性判断。",
      "连续记录四餐热量和每日体重后，系统会自动发现更稳定的个人规律。"
    ],
    suggestions: ["优先保持餐别完整记录，尤其是晚餐、加餐和次日体重。"],
    cautions: ["相关性需要足够样本，短期体重波动不能直接等同于脂肪变化。"]
  };
}

function mockInsight(input: z.infer<typeof insightRequestSchema>) {
  const label = input.primarySignal?.label || "餐别";
  const strength = input.primarySignal?.strengthLabel || "弱相关";
  return {
    summaryTitle: `${label}是当前最明显的信号`,
    insights: [
      `最近一段时间，${label}热量与次日体重变化呈现${strength}，这是当前四个餐别里最值得观察的规律。`,
      input.primarySignal?.meaningful
        ? `可以先围绕${label}做小幅稳定，而不是同时调整所有餐别。`
        : "当前相关性不强，建议继续记录，不要急着根据单一指标调整。"
    ],
    suggestions: [
      input.primarySignal?.recommendation || `保持${label}结构稳定，继续观察 7-14 天。`,
      "继续记录每日体重，尽量固定称重时间。"
    ],
    cautions: ["这是基于本地算法结果生成的模拟 AI 解读；相关性不代表因果。"]
  };
}
