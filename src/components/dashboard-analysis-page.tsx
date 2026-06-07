"use client";

import { useEffect, useMemo, useState } from "react";
import { Database, Flame, Leaf, Lightbulb, Target, Utensils } from "lucide-react";

type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";
type MealItem = {
  id: string;
  name: string;
  portion: string | null;
  grams: number | null;
  kcal: number;
  confidence: number | null;
  calculationSource: string | null;
  nutritionSourceId: string | null;
};
type MealEntry = {
  id: string;
  dateKey: string;
  mealSlot: MealSlot;
  status: string;
  imageUrl: string | null;
  compressedImageUrl: string | null;
  userDescription: string | null;
  finalKcal: number | null;
  modelKcal: number | null;
  confidence: number | null;
  uncertainty: string | null;
  notes: string | null;
  originalBytes: number | null;
  compressedBytes: number | null;
  createdAt: string;
  items: MealItem[];
};
type DashboardDay = {
  dateKey: string;
  intakeKcal: number;
  mealCount: number;
  weightKg: number | null;
  weightRecordedAt: string | null;
  previousWeightKg: number | null;
  totalBurnKcal: number | null;
  deficitKcal: number | null;
};
type AnalysisDay = DashboardDay & { meals: MealEntry[] };
type WeekSummary = {
  startDateKey: string;
  endDateKey: string;
  label: string;
  intakeKcal: number;
  deficitKcal: number;
  averageWeightKg: number | null;
};
type Dashboard = {
  dateKey: string;
  today: DashboardDay & {
    ouraRestingKcal: number | null;
    ouraTotalKcal: number | null;
    intervalsTrainingKcal: number | null;
    sourceStatus: string;
    syncedAt: string | null;
    meals: MealEntry[];
  };
  days: DashboardDay[];
  analysisDays: AnalysisDay[];
  weeks: WeekSummary[];
  weekDeficitKcal: number;
  sevenDayDeficitKcal: number;
  fourWeekDeficitKcal: number;
  predictedWeightLossJin: number;
  predictedFourWeekWeightLossJin: number;
  dailyDeficitTargetKcal: number;
};
type AnalysisView = "calories" | "weight" | "meals" | "correlation";
type AiInsight = {
  summaryTitle: string;
  insights: string[];
  suggestions: string[];
  cautions: string[];
};

const MEAL_SLOTS: Array<{ key: MealSlot; label: string; time: string; image: string }> = [
  { key: "breakfast", label: "早餐", time: "08:00", image: "/illustrations/meal-breakfast.webp" },
  { key: "lunch", label: "午餐", time: "12:30", image: "/illustrations/meal-lunch.webp" },
  { key: "dinner", label: "晚餐", time: "18:30", image: "/illustrations/meal-dinner.webp" },
  { key: "snack", label: "加餐", time: "15:30", image: "/illustrations/meal-snack.webp" }
];
const ANALYSIS_TABS: Array<{ key: AnalysisView; label: string }> = [
  { key: "calories", label: "热量" },
  { key: "weight", label: "体重" },
  { key: "meals", label: "餐别" },
  { key: "correlation", label: "关系" }
];
const CORRELATION_WINDOW_DAYS = 14;
const DEFAULT_SLOT_TARGET_KCAL = 450;

export default function AnalysisPage({ dashboard }: { dashboard: Dashboard | null }) {
  const [view, setView] = useState<AnalysisView>("correlation");
  const summary = useMemo(() => buildAnalysisSummary(dashboard), [dashboard]);

  return (
    <section className="analysis-page">
      <div className="analysis-hero">
        <div className="analysis-hero-copy">
          <p>数据洞察</p>
          <h1>分析</h1>
          <span>把摄入、缺口和体重变化放在一起看</span>
        </div>
      </div>
      <div className="analysis-tabs" role="tablist" aria-label="分析视图">
        {ANALYSIS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={view === tab.key}
            className={view === tab.key ? "analysis-tab analysis-tab-active" : "analysis-tab"}
            onClick={() => setView(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {view === "correlation" ? <CorrelationAnalysis summary={summary} /> : null}
      {view === "calories" ? <CaloriesAnalysis dashboard={dashboard} summary={summary} /> : null}
      {view === "weight" ? <WeightAnalysis dashboard={dashboard} summary={summary} /> : null}
      {view === "meals" ? <MealSlotAnalysis summary={summary} /> : null}
    </section>
  );
}

function CorrelationAnalysis({ summary }: { summary: AnalysisSummary }) {
  const hasEnoughData = summary.validCorrelationPoints >= 5;
  return (
    <div className="space-y-4">
      <section className="analysis-card analysis-main-card">
        <div className="analysis-card-header">
          <div>
            <p>关系图谱</p>
            <h2>{summary.primarySignalTitle}</h2>
          </div>
          <span>近 {CORRELATION_WINDOW_DAYS} 天</span>
        </div>
        {hasEnoughData ? (
          <CorrelationChart summary={summary} />
        ) : (
          <div className="analysis-empty-card">
            <Database size={24} />
            <strong>记录满 7 天后生成洞察</strong>
            <p>每个餐别至少需要 5 组有效的餐别热量与次日体重记录，才能参与自动发现。</p>
          </div>
        )}
      </section>

      <section className="analysis-score-card">
        <div>
          <p>相关指数</p>
          <strong>{summary.correlation == null ? "--" : Math.abs(summary.correlation).toFixed(2)}</strong>
          <span>{summary.correlationLabel}</span>
        </div>
        <div>
          <p><Lightbulb size={15} /> 建议</p>
          <strong>{summary.recommendationTitle}</strong>
          <span>{summary.recommendation}</span>
        </div>
      </section>

      <div className="analysis-mini-grid">
        <AnalysisMiniCard icon={<Utensils size={19} />} title="早餐稳定度" value={percentMetric(summary.breakfastVariation)} status={summary.breakfastStatus} accent="sage" />
        <AnalysisMiniCard icon={<Flame size={19} />} title={`${summary.primarySlotLabel}波动`} value={percentMetric(summary.primarySlotVariation)} status={summary.primarySlotStatus} accent="coral" />
        <AnalysisMiniCard icon={<Target size={19} />} title="缺口达标率" value={percentMetric(summary.deficitRate)} status={summary.deficitStatus} accent="sage" />
      </div>

      <InsightPanel summary={summary} />
    </div>
  );
}

function CaloriesAnalysis({ dashboard, summary }: { dashboard: Dashboard | null; summary: AnalysisSummary }) {
  return (
    <section className="analysis-card">
      <div className="analysis-card-header">
        <div>
          <p>热量摘要</p>
          <h2>热量趋势摘要</h2>
        </div>
        <span>本周</span>
      </div>
      <ComboTrendChart days={dashboard?.days || []} compact />
      <div className="analysis-summary-grid">
        <SmallStat label="本周累计缺口" value={kcalText(dashboard?.weekDeficitKcal ?? dashboard?.sevenDayDeficitKcal)} compact />
        <SmallStat label="日均摄入" value={kcalText(summary.averageIntakeKcal)} compact />
        <SmallStat label="预计下降" value={`${dashboard?.predictedWeightLossJin.toFixed(2) || "0.00"} 斤`} compact />
      </div>
    </section>
  );
}

function WeightAnalysis({ dashboard, summary }: { dashboard: Dashboard | null; summary: AnalysisSummary }) {
  return (
    <section className="analysis-card">
      <div className="analysis-card-header">
        <div>
          <p>体重摘要</p>
          <h2>体重趋势摘要</h2>
        </div>
        <span>本周</span>
      </div>
      <WeightLineChart days={dashboard?.days || []} />
      <div className="analysis-summary-grid">
        <SmallStat label="最新体重" value={latestWeightText(dashboard?.days || [])} compact />
        <SmallStat label="近 14 天变化" value={summary.weightChangeText} compact />
        <SmallStat label="有效记录" value={`${summary.weightRecordCount} 天`} compact />
      </div>
    </section>
  );
}

function MealSlotAnalysis({ summary }: { summary: AnalysisSummary }) {
  return (
    <section className="analysis-card">
      <div className="analysis-card-header">
        <div>
          <p>餐别排序</p>
          <h2>餐别相关性排序</h2>
        </div>
        <span>近 14 天</span>
      </div>
      <div className="analysis-slot-list">
        {summary.slotCorrelations.map((slot) => (
          <div key={slot.slot} className="analysis-slot-row">
            <span>{slot.label}</span>
            <div><i style={{ width: `${Math.round(slot.absCorrelation * 100)}%` }} /></div>
            <strong>{slot.eligible && slot.correlation != null ? slot.correlation.toFixed(2) : "样本不足"}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function CorrelationChart({ summary }: { summary: AnalysisSummary }) {
  const width = 720;
  const height = 330;
  const padding = { top: 54, right: 34, bottom: 48, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const days = summary.recentDays;
  const x = (index: number) => padding.left + (days.length <= 1 ? chartW / 2 : (chartW / (days.length - 1)) * index);
  const primarySlot = summary.primarySignal?.slot || "dinner";
  const primarySlotKcal = days.map((day) => mealSlotKcal(day, primarySlot));
  const maxKcal = niceCeil(Math.max(800, ...primarySlotKcal, ...days.map((day) => Math.max(0, day.deficitKcal || 0))));
  const yKcal = (value: number) => padding.top + ((maxKcal - value) / maxKcal) * chartH;
  const deltas = days.map((day) => dailyWeightDelta(day)).filter((value): value is number => value != null);
  const maxAbsDelta = Math.max(0.3, ...deltas.map((value) => Math.abs(value)));
  const yDelta = (value: number) => padding.top + ((maxAbsDelta - value) / (maxAbsDelta * 2)) * chartH;
  const intakePoints = primarySlotKcal.map((value, index) => `${x(index)},${yKcal(value || 0)}`).join(" ");
  const deficitPoints = days.map((day, index) => `${x(index)},${yKcal(Math.max(0, day.deficitKcal || 0))}`).join(" ");
  const highlight = summary.strongestPair;
  const highlightX = highlight == null ? null : x(days.findIndex((day) => day.dateKey === highlight.dateKey));

  return (
    <div className="analysis-chart-wrap">
      <div className="analysis-legend">
        <span><i className="analysis-dot analysis-dot-coral" />{summary.primarySlotLabel}热量</span>
        <span><i className="analysis-dot analysis-dot-sage" />热量缺口</span>
        <span><i className="analysis-dot analysis-dot-oat" />体重变化</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="analysis-correlation-svg" role="img" aria-label="摄入、热量缺口与体重变化关系图">
        {[0, Math.round(maxKcal / 2), maxKcal].map((tick) => (
          <g key={tick}>
            <line x1={padding.left} x2={width - padding.right} y1={yKcal(tick)} y2={yKcal(tick)} stroke="rgba(95, 88, 78, 0.09)" />
            <text x={padding.left - 10} y={yKcal(tick) + 4} textAnchor="end" className="fill-[#8a8f88] text-[13px]">
              {tick}
            </text>
          </g>
        ))}
        <polyline className="analysis-line analysis-line-coral" points={intakePoints} fill="none" stroke="#dd7858" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <polyline className="analysis-line analysis-line-sage" points={deficitPoints} fill="none" stroke="#6f9677" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {days.map((day, index) => {
          const delta = dailyWeightDelta(day);
          if (delta == null) return null;
          return (
            <circle
              key={`${day.dateKey}-delta`}
              className="analysis-delta-dot"
              cx={x(index)}
              cy={yDelta(delta)}
              r={Math.min(14, Math.max(7, Math.abs(delta) * 28 + 7))}
              fill="#ead8bd"
              fillOpacity="0.72"
              stroke="#d8bea0"
              style={{ animationDelay: `${190 + index * 26}ms` }}
            />
          );
        })}
        {highlightX != null ? (
          <g>
            <line className="analysis-highlight-line" x1={highlightX} x2={highlightX} y1={padding.top + 24} y2={height - padding.bottom} stroke="#dfcbb6" strokeDasharray="6 8" />
            <foreignObject x={Math.min(width - 246, Math.max(76, highlightX - 112))} y="36" width="224" height="58">
              <div className="analysis-chart-callout">{summary.chartCallout}</div>
            </foreignObject>
          </g>
        ) : null}
        {days.map((day, index) => (
          <text key={`${day.dateKey}-label`} x={x(index)} y={height - 24} textAnchor="middle" className="fill-[#8a8f88] text-[12px]">
            {index % 2 === 0 ? day.dateKey.slice(5) : ""}
          </text>
        ))}
      </svg>
    </div>
  );
}

function AnalysisMiniCard({ icon, title, value, status, accent }: { icon: React.ReactNode; title: string; value: string; status: string; accent: "sage" | "coral" }) {
  return (
    <div className={`analysis-mini-card analysis-mini-${accent}`}>
      <div>{icon}</div>
      <p>{title}</p>
      <strong>{value}</strong>
      <span>{status}</span>
    </div>
  );
}

function InsightPanel({ summary }: { summary: AnalysisSummary }) {
  const [aiInsight, setAiInsight] = useState<AiInsight | null>(null);
  const [aiStatus, setAiStatus] = useState<"idle" | "loading" | "ready" | "cached" | "error">("idle");

  useEffect(() => {
    if (!summary.aiPayload || summary.validCorrelationPoints < 5) {
      void Promise.resolve().then(() => {
        setAiInsight(null);
        setAiStatus("idle");
      });
      return;
    }

    let cancelled = false;
    const cacheKey = `tracker-ai-insight:${summary.dateKey}:${summary.analysisFingerprint}`;

    void (async () => {
      await Promise.resolve();
      try {
        const cached = window.localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as AiInsight;
          if (!cancelled) {
            setAiInsight(parsed);
            setAiStatus("cached");
          }
          return;
        }
      } catch {
        // Ignore cache parsing issues and request a fresh explanation.
      }

      if (cancelled) return;
      setAiStatus("loading");
      setAiInsight(null);
      fetch("/api/analysis/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(summary.aiPayload)
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("AI 数据解读失败");
          return response.json() as Promise<{ insight: AiInsight }>;
        })
        .then((data) => {
          if (cancelled) return;
          setAiInsight(data.insight);
          setAiStatus("ready");
          try {
            window.localStorage.setItem(cacheKey, JSON.stringify(data.insight));
          } catch {
            // Cache is an optimization only.
          }
        })
        .catch(() => {
          if (!cancelled) setAiStatus("error");
        });
    })();

    return () => {
      cancelled = true;
    };
  }, [summary.aiPayload, summary.analysisFingerprint, summary.dateKey, summary.validCorrelationPoints]);

  const insights = aiInsight?.insights?.length ? aiInsight.insights : summary.insights;
  const suggestions = aiInsight?.suggestions || [];
  const cautions = aiInsight?.cautions || [];

  return (
    <section className="analysis-insight-card">
      <div className="analysis-insight-title">
        <Leaf size={22} />
        <div>
          <p>{aiInsight?.summaryTitle || "Insight 洞察"}</p>
          <h2>{aiStatus === "loading" ? "正在生成 AI 数据解读" : aiStatus === "ready" || aiStatus === "cached" ? "AI 数据解读" : "本地数据解读"}</h2>
        </div>
      </div>
      <div className="analysis-insight-list">
        {aiStatus === "loading" ? <p>我正在结合四餐相关性排名、体重变化和缺口达标率生成更自然的解释。</p> : null}
        {insights.map((insight) => (
          <p key={insight}>{insight}</p>
        ))}
        {suggestions.map((suggestion) => (
          <p key={suggestion} className="analysis-insight-suggestion">建议：{suggestion}</p>
        ))}
        {cautions.map((caution) => (
          <p key={caution} className="analysis-insight-caution">提示：{caution}</p>
        ))}
        {aiStatus === "error" ? <p className="analysis-insight-caution">AI 解读暂时不可用，已保留本地算法洞察。</p> : null}
      </div>
    </section>
  );
}

type AnalysisSourceDay = DashboardDay & { meals?: MealEntry[] };
type SlotWeightPair = { dateKey: string; slotKcal: number; nextWeightDeltaKg: number };
type SlotCorrelationSummary = {
  slot: MealSlot;
  label: string;
  pairs: SlotWeightPair[];
  sampleSize: number;
  correlation: number | null;
  absCorrelation: number;
  eligible: boolean;
  meaningful: boolean;
  strengthLabel: string;
  averageKcal: number;
  variation: number | null;
  strongestPair: SlotWeightPair | null;
  recommendation: string;
};
type AnalysisSummary = ReturnType<typeof buildAnalysisSummary>;

function buildAnalysisSummary(dashboard: Dashboard | null) {
  const sourceDays: AnalysisSourceDay[] = (dashboard?.analysisDays?.length ? dashboard.analysisDays : dashboard?.days || []).slice();
  const recentDays = sourceDays.slice(-CORRELATION_WINDOW_DAYS);
  const target = dashboard?.dailyDeficitTargetKcal || 500;
  const slotCorrelations = MEAL_SLOTS.map((slot) => buildSlotCorrelation(recentDays, slot.key, slot.label))
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.absCorrelation - a.absCorrelation || b.sampleSize - a.sampleSize);
  const primarySignal = slotCorrelations.find((slot) => slot.eligible) || null;
  const displaySignal = primarySignal || slotCorrelations[0] || null;
  const breakfastValues = recentDays.map((day) => mealSlotKcal(day, "breakfast")).filter((value) => value > 0);
  const deficitValues = recentDays.map((day) => day.deficitKcal).filter((value): value is number => value != null);
  const weightValues = recentDays.map((day) => day.weightKg).filter((value): value is number => value != null);
  const breakfastVariation = coefficientOfVariation(breakfastValues);
  const deficitRate = deficitValues.length ? deficitValues.filter((value) => value >= target).length / deficitValues.length : null;
  const averageIntakeKcal = recentDays.length ? recentDays.reduce((total, day) => total + (day.intakeKcal || 0), 0) / recentDays.length : null;
  const correlation = primarySignal?.correlation ?? null;
  const correlationLabel = primarySignal == null ? "等待更多记录" : primarySignal.strengthLabel;
  const primarySignalTitle = primarySignal == null
    ? "继续记录，自动发现规律"
    : primarySignal.meaningful
      ? `${primarySignal.label}热量与次日体重变化最相关`
      : "暂未发现明显规律";
  const recommendationTitle = primarySignal?.meaningful ? `优先稳定${primarySignal.label}` : "继续积累数据";
  const recommendation = primarySignal?.recommendation || "四个餐别暂时没有足够强的个人规律，先保持完整记录和固定称重时间。";
  const primarySlotLabel = displaySignal?.label || "餐别";
  const primarySlotVariation = displaySignal?.variation ?? null;
  const primarySlotStatus = variationStatus(primarySlotVariation, primarySlotLabel);
  const chartCallout = primarySignal?.meaningful
    ? `${primarySignal.label}热量变化时，次日体重波动更值得观察`
    : "当前相关性较弱，继续记录会让判断更可靠";
  const insights = buildInsightMessages({
    primarySignal,
    validCorrelationPoints: primarySignal?.sampleSize ?? displaySignal?.sampleSize ?? 0,
    breakfastVariation,
    deficitRate
  });
  const analysisFingerprint = hashString(JSON.stringify({
    dateKey: dashboard?.dateKey || "",
    target,
    slots: slotCorrelations.map(({ slot, sampleSize, correlation, averageKcal, variation }) => ({ slot, sampleSize, correlation, averageKcal, variation })),
    days: recentDays.map((day) => ({
      dateKey: day.dateKey,
      intakeKcal: day.intakeKcal,
      deficitKcal: day.deficitKcal,
      weightKg: day.weightKg,
      slots: Object.fromEntries(MEAL_SLOTS.map((slot) => [slot.key, mealSlotKcal(day, slot.key)]))
    }))
  }));
  const aiPayload = dashboard?.dateKey
    ? {
        dateKey: dashboard.dateKey,
        fingerprint: analysisFingerprint,
        primarySignal: primarySignal
          ? {
              slot: primarySignal.slot,
              label: primarySignal.label,
              correlation: primarySignal.correlation,
              absCorrelation: primarySignal.absCorrelation,
              sampleSize: primarySignal.sampleSize,
              strengthLabel: primarySignal.strengthLabel,
              meaningful: primarySignal.meaningful,
              recommendation: primarySignal.recommendation
            }
          : null,
        slotCorrelations: slotCorrelations.map(({ slot, label, correlation, absCorrelation, sampleSize, eligible, strengthLabel, averageKcal, variation }) => ({
          slot,
          label,
          correlation,
          absCorrelation,
          sampleSize,
          eligible,
          strengthLabel,
          averageKcal,
          variation
        })),
        metrics: {
          deficitRate,
          breakfastVariation,
          primarySlotVariation,
          averageIntakeKcal,
          weightChangeText: weightChangeText(weightValues),
          weightRecordCount: weightValues.length,
          dailyDeficitTargetKcal: target
        },
        recentDays: recentDays.map((day) => ({
          dateKey: day.dateKey,
          intakeKcal: day.intakeKcal,
          deficitKcal: day.deficitKcal,
          weightKg: day.weightKg,
          weightDeltaKg: dailyWeightDelta(day),
          slots: Object.fromEntries(MEAL_SLOTS.map((slot) => [slot.key, mealSlotKcal(day, slot.key)]))
        }))
      }
    : null;

  return {
    dateKey: dashboard?.dateKey || "unknown",
    recentDays,
    correlation,
    validCorrelationPoints: primarySignal?.sampleSize ?? displaySignal?.sampleSize ?? 0,
    strongestPair: primarySignal?.strongestPair ?? null,
    primarySignal,
    primarySignalTitle,
    primarySlotLabel,
    primarySlotVariation,
    primarySlotStatus,
    chartCallout,
    recommendationTitle,
    breakfastVariation,
    deficitRate,
    averageIntakeKcal,
    weightRecordCount: weightValues.length,
    weightChangeText: weightChangeText(weightValues),
    breakfastStatus: variationStatus(breakfastVariation, "早餐"),
    deficitStatus: deficitRateStatus(deficitRate),
    correlationLabel,
    recommendation,
    insights,
    slotCorrelations,
    analysisFingerprint,
    aiPayload
  };
}

function buildSlotCorrelation(days: AnalysisSourceDay[], slot: MealSlot, label: string): SlotCorrelationSummary {
  const pairs = buildSlotWeightPairs(days, slot);
  const values = days.map((day) => mealSlotKcal(day, slot)).filter((value) => value > 0);
  const correlation = pairs.length >= 2 ? pearsonCorrelation(pairs.map((pair) => pair.slotKcal), pairs.map((pair) => pair.nextWeightDeltaKg)) : null;
  const absCorrelation = correlation == null ? 0 : Math.abs(correlation);
  const sampleSize = pairs.length;
  const eligible = sampleSize >= 5;
  const meaningful = eligible && absCorrelation >= 0.35;
  const averageKcal = values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
  const variation = coefficientOfVariation(values);
  const strongestPair = pairs.reduce<SlotWeightPair | null>((current, pair) => {
    if (!current) return pair;
    return Math.abs(pair.nextWeightDeltaKg) > Math.abs(current.nextWeightDeltaKg) ? pair : current;
  }, null);
  return {
    slot,
    label,
    pairs,
    sampleSize,
    correlation,
    absCorrelation,
    eligible,
    meaningful,
    strengthLabel: eligible && correlation != null ? correlationStrengthLabel(correlation) : "样本不足",
    averageKcal,
    variation,
    strongestPair,
    recommendation: slotRecommendation(label, correlation, averageKcal, meaningful)
  };
}

function buildSlotWeightPairs(days: AnalysisSourceDay[], slot: MealSlot) {
  const pairs: SlotWeightPair[] = [];
  for (let index = 0; index < days.length - 1; index += 1) {
    const day = days[index];
    const next = days[index + 1];
    const slotKcal = mealSlotKcal(day, slot);
    if (slotKcal <= 0 || day.weightKg == null || next.weightKg == null) continue;
    pairs.push({
      dateKey: day.dateKey,
      slotKcal,
      nextWeightDeltaKg: Number((next.weightKg - day.weightKg).toFixed(2))
    });
  }
  return pairs;
}

function mealSlotKcal(day: AnalysisSourceDay, slot: MealSlot) {
  return (day.meals || [])
    .filter((meal) => meal.mealSlot === slot)
    .reduce((total, meal) => total + (meal.finalKcal || 0), 0);
}

function slotRecommendation(label: string, correlation: number | null, averageKcal: number, meaningful: boolean) {
  if (!meaningful || correlation == null) {
    return `${label}还没有形成足够强的信号，继续记录 7-14 天会更可靠。`;
  }
  const target = Math.max(80, Math.round(Math.min(averageKcal, averageKcal * 0.92 || DEFAULT_SLOT_TARGET_KCAL) / 10) * 10);
  if (correlation > 0) {
    return `${label}热量越高时，次日体重波动越明显。先把${label}稳定在约 ${target} kcal 附近。`;
  }
  return `${label}热量与次日体重呈负相关，但这不代表应该增加热量；建议先观察结构、盐分和称重时间。`;
}

function dailyWeightDelta(day: AnalysisSourceDay) {
  if (day.weightKg == null || day.previousWeightKg == null) return null;
  return Number((day.weightKg - day.previousWeightKg).toFixed(2));
}

function pearsonCorrelation(a: number[], b: number[]) {
  if (a.length !== b.length || a.length < 2) return null;
  const meanA = a.reduce((total, value) => total + value, 0) / a.length;
  const meanB = b.reduce((total, value) => total + value, 0) / b.length;
  const numerator = a.reduce((total, value, index) => total + (value - meanA) * (b[index] - meanB), 0);
  const varianceA = a.reduce((total, value) => total + (value - meanA) ** 2, 0);
  const varianceB = b.reduce((total, value) => total + (value - meanB) ** 2, 0);
  const denominator = Math.sqrt(varianceA * varianceB);
  return denominator === 0 ? null : Math.max(-1, Math.min(1, numerator / denominator));
}

function coefficientOfVariation(values: number[]) {
  if (values.length < 2) return null;
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  if (mean <= 0) return null;
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function percentMetric(value: number | null) {
  return value == null ? "--" : `${Math.round(value * 100)}%`;
}

function correlationStrengthLabel(value: number) {
  const abs = Math.abs(value);
  if (abs < 0.35) return "弱相关";
  if (abs < 0.65) return value > 0 ? "中等正相关" : "中等负相关";
  return value > 0 ? "较强正相关" : "较强负相关";
}

function variationStatus(value: number | null, label: string) {
  if (value == null) return "待记录";
  if (value < 0.16) return "稳定";
  if (value < 0.28) return `${label}波动适中`;
  return `${label}偏高`;
}

function deficitRateStatus(value: number | null) {
  if (value == null) return "待同步";
  if (value >= 0.7) return "良好";
  if (value >= 0.45) return "一般";
  return "需加强";
}

function weightChangeText(values: number[]) {
  if (values.length < 2) return "--";
  const delta = values[values.length - 1] - values[0];
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)} kg`;
}

function buildInsightMessages({
  primarySignal,
  validCorrelationPoints,
  breakfastVariation,
  deficitRate
}: {
  primarySignal: SlotCorrelationSummary | null;
  validCorrelationPoints: number;
  breakfastVariation: number | null;
  deficitRate: number | null;
}) {
  if (validCorrelationPoints < 5) {
    return ["记录满 7 天并持续录入体重后，我会自动比较早餐、午餐、晚餐和加餐的相关性。", "当前先保持每日餐别记录完整，尤其是加餐、晚餐和次日体重记录。"];
  }
  const messages: string[] = [];
  if (primarySignal?.meaningful && primarySignal.correlation != null) {
    messages.push(`${primarySignal.label}是当前四个餐别里最明显的信号，相关指数 ${primarySignal.absCorrelation.toFixed(2)}。`);
    messages.push(primarySignal.recommendation);
  } else if (primarySignal) {
    messages.push(`四个餐别都已参与计算，目前最强的是${primarySignal.label}，但仍属于弱相关。`);
  } else {
    messages.push("四个餐别暂未出现足够可靠的相关性，体重变化可能更多来自水分、运动或同步数据波动。");
  }
  if (deficitRate != null && deficitRate >= 0.7) {
    messages.push("本阶段缺口达标率良好，执行节奏比较稳定。");
  } else {
    messages.push("缺口达标天数偏少，可以先把每日缺口稳定到 500 kcal 附近。");
  }
  if (breakfastVariation != null && breakfastVariation < 0.16) {
    messages.push("早餐结构稳定，这是全天摄入更容易受控的好信号。");
  } else if (primarySignal?.variation != null && primarySignal.variation > 0.28) {
    messages.push(`${primarySignal.label}波动偏高，可以先固定一个常用模板，再观察相关性是否下降。`);
  }
  return messages;
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function ComboTrendChart({ days, compact }: { days: DashboardDay[]; compact?: boolean }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const width = 720;
  const height = 260;
  const padding = { top: 18, right: 26, bottom: 42, left: 44 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const intake = days.map((day) => day.intakeKcal || 0);
  const deficit = days.map((day) => day.deficitKcal);
  const validDeficits = deficit.filter((value): value is number => value != null);
  const maxValue = niceCeil(Math.max(500, ...intake, ...validDeficits.map((value) => Math.max(0, value))));
  const minValue = Math.min(0, ...validDeficits);
  const minAxis = minValue < 0 ? -niceCeil(Math.abs(minValue)) : 0;
  const y = (value: number) => padding.top + ((maxValue - value) / (maxValue - minAxis || 1)) * chartH;
  const zeroY = y(0);
  const x = (index: number) => padding.left + (days.length <= 1 ? chartW / 2 : (chartW / (days.length - 1)) * index);
  const bandW = chartW / Math.max(1, days.length);
  const barWidth = Math.max(14, Math.min(44, bandW - 18));
  const linePoints = deficit.map((value, index) => (value == null ? null : `${x(index)},${y(value)}`)).filter(Boolean).join(" ");
  const ticks = minAxis < 0 ? [minAxis, 0, maxValue] : [0, Math.round(maxValue / 2), maxValue];

  return (
    <div className="overflow-hidden rounded-lg bg-slate-50">
      <svg viewBox={`0 0 ${width} ${height}`} className={`${compact ? "h-44" : "h-64"} w-full`} role="img" aria-label="本周摄入热量柱状图和每日缺口折线图">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={padding.left} x2={width - padding.right} y1={y(tick)} y2={y(tick)} stroke="#e2e8f0" strokeWidth="1" />
            <text x={padding.left - 8} y={y(tick) + 4} textAnchor="end" className="fill-slate-400 text-[11px]">
              {Math.round(tick)}
            </text>
          </g>
        ))}
        {days.map((day, index) => {
          const value = intake[index];
          const top = y(value);
          const barHeight = Math.max(2, zeroY - top);
          return (
            <g key={day.dateKey} className="group">
              <rect x={x(index) - barWidth / 2} y={top} width={barWidth} height={barHeight} rx="5" fill="#aec7b3" opacity={value === 0 ? 0.25 : 0.88} />
              <HoverBand
                x={x(index)}
                bandWidth={bandW}
                chartTop={padding.top}
                chartHeight={chartH}
                width={width}
                lines={[day.dateKey, `摄入 ${Math.round(day.intakeKcal || 0)} kcal`, `缺口 ${day.deficitKcal == null ? "未统计" : `${Math.round(day.deficitKcal)} kcal`}`]}
                active={activeIndex === index}
                onActivate={() => setActiveIndex((current) => (current === index ? null : index))}
              />
              <text x={x(index)} y={height - 18} textAnchor="middle" className="fill-slate-500 text-[12px]">
                {day.dateKey.slice(5)}
              </text>
            </g>
          );
        })}
        {linePoints ? <polyline points={linePoints} fill="none" stroke="#cf806f" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /> : null}
        {deficit.map((value, index) =>
          value == null ? null : (
            <g key={`${days[index]?.dateKey}-point`}>
              <circle cx={x(index)} cy={y(value)} r="4.5" fill="#cf806f" />
              <circle cx={x(index)} cy={y(value)} r="2" fill="#ffffff" />
            </g>
          )
        )}
      </svg>
    </div>
  );
}

function WeightLineChart({ days }: { days: DashboardDay[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const width = 720;
  const height = 260;
  const padding = { top: 22, right: 26, bottom: 42, left: 48 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const values = days.map((day) => day.weightKg).filter((value): value is number => value != null);
  const minWeight = values.length ? Math.floor((Math.min(...values) - 0.4) * 10) / 10 : 70;
  const maxWeight = values.length ? Math.ceil((Math.max(...values) + 0.4) * 10) / 10 : 80;
  const x = (index: number) => padding.left + (days.length <= 1 ? chartW / 2 : (chartW / (days.length - 1)) * index);
  const y = (value: number) => padding.top + ((maxWeight - value) / (maxWeight - minWeight || 1)) * chartH;
  const points = days
    .map((day, index) => (day.weightKg == null ? null : `${x(index)},${y(day.weightKg)}`))
    .filter(Boolean)
    .join(" ");
  const bandW = chartW / Math.max(1, days.length);
  const ticks = [minWeight, Number(((minWeight + maxWeight) / 2).toFixed(1)), maxWeight];

  return (
    <div className="overflow-hidden rounded-lg bg-slate-50">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full" role="img" aria-label="本周体重折线图">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={padding.left} x2={width - padding.right} y1={y(tick)} y2={y(tick)} stroke="#e2e8f0" strokeWidth="1" />
            <text x={padding.left - 8} y={y(tick) + 4} textAnchor="end" className="fill-slate-400 text-[11px]">
              {tick.toFixed(1)}
            </text>
          </g>
        ))}
        {points ? <polyline points={points} fill="none" stroke="#5f806b" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /> : null}
        {days.map((day, index) => (
          <g key={day.dateKey} className="group">
            {day.weightKg == null ? <circle cx={x(index)} cy={padding.top + chartH} r="3" fill="#cfdfd0" /> : <circle cx={x(index)} cy={y(day.weightKg)} r="5" fill="#5f806b" />}
            <HoverBand
              x={x(index)}
              bandWidth={bandW}
              chartTop={padding.top}
              chartHeight={chartH}
              width={width}
              lines={[day.dateKey, `体重 ${day.weightKg == null ? "未录入" : `${day.weightKg.toFixed(1)} kg`}`]}
              active={activeIndex === index}
              onActivate={() => setActiveIndex((current) => (current === index ? null : index))}
            />
            <text x={x(index)} y={height - 18} textAnchor="middle" className="fill-slate-500 text-[12px]">
              {day.dateKey.slice(5)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function FourWeekChart({ weeks }: { weeks: WeekSummary[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const width = 720;
  const height = 260;
  const padding = { top: 22, right: 30, bottom: 42, left: 48 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const deficits = weeks.map((week) => week.deficitKcal || 0);
  const weights = weeks.map((week) => week.averageWeightKg).filter((value): value is number => value != null);
  const maxValue = niceCeil(Math.max(500, ...deficits.map((value) => Math.max(0, value))));
  const minValue = Math.min(0, ...deficits);
  const minAxis = minValue < 0 ? -niceCeil(Math.abs(minValue)) : 0;
  const yDeficit = (value: number) => padding.top + ((maxValue - value) / (maxValue - minAxis || 1)) * chartH;
  const zeroY = yDeficit(0);
  const minWeight = weights.length ? Math.floor((Math.min(...weights) - 0.4) * 10) / 10 : 70;
  const maxWeight = weights.length ? Math.ceil((Math.max(...weights) + 0.4) * 10) / 10 : 80;
  const yWeight = (value: number) => padding.top + ((maxWeight - value) / (maxWeight - minWeight || 1)) * chartH;
  const x = (index: number) => padding.left + (weeks.length <= 1 ? chartW / 2 : (chartW / (weeks.length - 1)) * index);
  const bandW = chartW / Math.max(1, weeks.length);
  const barWidth = Math.max(30, Math.min(70, bandW - 28));
  const weightPoints = weeks
    .map((week, index) => (week.averageWeightKg == null ? null : `${x(index)},${yWeight(week.averageWeightKg)}`))
    .filter(Boolean)
    .join(" ");
  const ticks = minAxis < 0 ? [minAxis, 0, maxValue] : [0, Math.round(maxValue / 2), maxValue];

  return (
    <div className="overflow-hidden rounded-lg bg-slate-50">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full" role="img" aria-label="4 周热量缺口柱状图和体重折线图">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={padding.left} x2={width - padding.right} y1={yDeficit(tick)} y2={yDeficit(tick)} stroke="#e2e8f0" strokeWidth="1" />
            <text x={padding.left - 8} y={yDeficit(tick) + 4} textAnchor="end" className="fill-slate-400 text-[11px]">
              {Math.round(tick)}
            </text>
          </g>
        ))}
        {weeks.map((week, index) => {
          const value = deficits[index];
          const top = yDeficit(Math.max(0, value));
          const bottom = yDeficit(Math.min(0, value));
          const barY = value >= 0 ? top : zeroY;
          const barHeight = Math.max(2, Math.abs(bottom - top));
          return (
            <g key={week.startDateKey} className="group">
              <rect x={x(index) - barWidth / 2} y={barY} width={barWidth} height={barHeight} rx="6" fill="#aec7b3" opacity={value === 0 ? 0.25 : 0.88} />
              <HoverBand
                x={x(index)}
                bandWidth={bandW}
                chartTop={padding.top}
                chartHeight={chartH}
                width={width}
                lines={[
                  week.label,
                  `缺口 ${Math.round(week.deficitKcal || 0)} kcal`,
                  `周均体重 ${week.averageWeightKg == null ? "未录入" : `${week.averageWeightKg.toFixed(1)} kg`}`
                ]}
                active={activeIndex === index}
                onActivate={() => setActiveIndex((current) => (current === index ? null : index))}
              />
              <text x={x(index)} y={height - 18} textAnchor="middle" className="fill-slate-500 text-[12px]">
                {week.label}
              </text>
            </g>
          );
        })}
        {weightPoints ? <polyline points={weightPoints} fill="none" stroke="#cf806f" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /> : null}
        {weeks.map((week, index) =>
          week.averageWeightKg == null ? null : (
            <g key={`${week.startDateKey}-weight`}>
              <circle cx={x(index)} cy={yWeight(week.averageWeightKg)} r="4.5" fill="#cf806f" />
              <circle cx={x(index)} cy={yWeight(week.averageWeightKg)} r="2" fill="#ffffff" />
            </g>
          )
        )}
      </svg>
    </div>
  );
}

function HoverBand({
  x,
  bandWidth,
  chartTop,
  chartHeight,
  width,
  lines,
  active,
  onActivate
}: {
  x: number;
  bandWidth: number;
  chartTop: number;
  chartHeight: number;
  width: number;
  lines: string[];
  active: boolean;
  onActivate: () => void;
}) {
  const tooltipX = Math.min(width - 178, Math.max(54, x - 84));
  const textX = tooltipX + 12;
  return (
    <>
      <rect
        x={x - bandWidth / 2}
        y={chartTop}
        width={bandWidth}
        height={chartHeight}
        fill="transparent"
        className="cursor-pointer"
        role="button"
        tabIndex={0}
        aria-label={lines.join("，")}
        onClick={onActivate}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onActivate();
          }
        }}
      />
      <g className={`${active ? "opacity-100" : "opacity-0"} pointer-events-none transition-opacity group-hover:opacity-100 group-focus-within:opacity-100`}>
        <line x1={x} x2={x} y1={chartTop} y2={chartTop + chartHeight} stroke="#64748b" strokeDasharray="4 4" />
        <rect x={tooltipX} y={chartTop + 8} width="168" height={lines.length > 2 ? 72 : 54} rx="7" fill="#0f172a" opacity="0.94" />
        {lines.map((line, index) => (
          <text key={line} x={textX} y={chartTop + 29 + index * 18} className="fill-white text-[12px]">
            {line}
          </text>
        ))}
      </g>
    </>
  );
}

function SmallStat({ label, value, compact }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 whitespace-nowrap font-semibold text-slate-950 ${compact ? "text-base" : "text-lg"}`}>{value}</p>
    </div>
  );
}

function niceCeil(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 500;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function latestWeightText(days: DashboardDay[]) {
  const latest = [...days].reverse().find((day) => day.weightKg != null);
  return latest?.weightKg == null ? "未录入" : `${latest.weightKg.toFixed(1)} kg`;
}

function kcalText(value: number | null | undefined) {
  if (value == null) return "未同步";
  return `${Math.round(value)} kcal`;
}
