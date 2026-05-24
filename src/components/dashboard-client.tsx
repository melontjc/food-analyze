"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Camera, Check, CloudCog, RefreshCw, Save, Send, Settings, Upload } from "lucide-react";

type MealItem = { id: string; name: string; portion: string | null; kcal: number; confidence: number | null };
type MealEntry = {
  id: string;
  dateKey: string;
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
  items: MealItem[];
};
type DashboardDay = {
  dateKey: string;
  intakeKcal: number;
  weightKg: number | null;
  totalBurnKcal: number | null;
  deficitKcal: number | null;
};
type Dashboard = {
  dateKey: string;
  today: DashboardDay & {
    ouraRestingKcal: number | null;
    intervalsTrainingKcal: number | null;
    meals: MealEntry[];
    sourceStatus: string;
    syncedAt: string | null;
  };
  days: DashboardDay[];
  sevenDayDeficitKcal: number;
  predictedWeightLossJin: number;
};

export default function DashboardClient({ initialDate }: { initialDate: string }) {
  const [dateKey, setDateKey] = useState(initialDate);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [draft, setDraft] = useState<MealEntry | null>(null);
  const [kcal, setKcal] = useState("");
  const [mealContext, setMealContext] = useState("");
  const [weightInput, setWeightInput] = useState("");
  const [weightSaving, setWeightSaving] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/dashboard?date=${dateKey}`);
    if (response.ok) {
      const data = await response.json();
      setDashboard(data);
      setWeightInput(data.today.weightKg == null ? "" : String(data.today.weightKg));
    }
  }, [dateKey]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/dashboard?date=${dateKey}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          setDashboard(data);
          setWeightInput(data.today.weightKg == null ? "" : String(data.today.weightKg));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [dateKey]);

  async function analyze() {
    if (!selectedFile) {
      setError("请先选择餐食图片");
      return;
    }
    setLoading(true);
    setError("");
    const form = new FormData();
    form.append("image", selectedFile);
    form.append("dateKey", dateKey);
    form.append("userDescription", mealContext);
    const response = await fetch("/api/meals/analyze", { method: "POST", body: form });
    const data = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok && response.status !== 202) {
      setError(data.error || "上传失败");
      return;
    }
    setDraft(data.entry);
    setKcal(String(data.entry.finalKcal || data.entry.modelKcal || ""));
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }

  function chooseFile(file: File) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setError("");
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  async function confirmDraft() {
    if (!draft) return;
    const finalKcal = Number(kcal);
    if (!Number.isFinite(finalKcal)) {
      setError("请输入热量");
      return;
    }
    const response = await fetch(`/api/meals/${draft.id}/confirm`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ finalKcal: Math.round(finalKcal), notes: draft.notes })
    });
    if (!response.ok) {
      setError("确认失败");
      return;
    }
    setDraft(null);
    setMealContext("");
    await load();
  }

  async function saveWeight() {
    const weightKg = Number(weightInput);
    if (!Number.isFinite(weightKg)) {
      setError("请输入体重");
      return;
    }
    setWeightSaving(true);
    setError("");
    const response = await fetch("/api/weights", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dateKey, weightKg })
    });
    setWeightSaving(false);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error || "体重保存失败");
      return;
    }
    await load();
  }

  async function syncNow() {
    setSyncing(true);
    await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dateKey })
    });
    setSyncing(false);
    await load();
  }

  const compression = useMemo(() => {
    if (!draft?.originalBytes || !draft.compressedBytes) return null;
    return Math.max(0, Math.round((1 - draft.compressedBytes / draft.originalBytes) * 100));
  }, [draft]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-5 sm:px-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-stone-500">Food Deficit</p>
          <h1 className="text-2xl font-semibold tracking-normal">热量缺口看板</h1>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateKey}
            onChange={(event) => setDateKey(event.target.value)}
            className="rounded-md border border-stone-300 bg-white px-3 py-2"
          />
          <button onClick={syncNow} className="rounded-md border border-stone-300 bg-white p-2" aria-label="同步">
            <RefreshCw size={19} className={syncing ? "animate-spin" : ""} />
          </button>
          <Link href="/settings" className="rounded-md border border-stone-300 bg-white p-2" aria-label="设置">
            <Settings size={19} />
          </Link>
        </div>
      </header>

      <section className="mb-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="card p-4 sm:p-5">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) chooseFile(file);
              event.currentTarget.value = "";
            }}
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={loading}
            className="flex min-h-56 w-full flex-col items-center justify-center gap-4 rounded-md bg-emerald-700 px-6 py-12 text-white shadow-lg shadow-emerald-900/15 disabled:opacity-70"
          >
            {loading ? <CloudCog size={52} className="animate-pulse" /> : <Camera size={58} />}
            <span className="text-3xl font-semibold">{loading ? "分析中" : "上传图片"}</span>
            <span className="flex items-center gap-2 text-sm opacity-90">
              <Upload size={16} />
              先选图，再填写说明
            </span>
          </button>

          {previewUrl ? (
            <div className="mt-4 overflow-hidden rounded-md border border-stone-200 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="待分析餐食" className="max-h-72 w-full object-contain" />
              <div className="flex items-center justify-between gap-3 border-t border-stone-200 px-3 py-2 text-sm text-stone-600">
                <span className="truncate">{selectedFile?.name}</span>
                <span>{selectedFile ? `${(selectedFile.size / 1024 / 1024).toFixed(1)} MB` : ""}</span>
              </div>
            </div>
          ) : null}

          <label className="mt-4 block">
            <span className="mb-2 block text-sm font-medium text-stone-700">补充说明</span>
            <textarea
              value={mealContext}
              onChange={(event) => setMealContext(event.target.value)}
              rows={3}
              className="w-full resize-none rounded-md border border-stone-300 bg-white px-3 py-3 text-sm outline-none focus:border-emerald-600"
              placeholder="例如：麦当劳板烧鸡腿堡一份；米饭约 180g；鸡胸肉空气炸锅少油；海底捞番茄锅里捞出的牛肉约 120g"
            />
          </label>
          <p className="mt-2 text-xs text-stone-500">有重量、烹饪手法、连锁店、套餐规格时，写在这里会明显提高估算准确度。</p>
          <button
            onClick={analyze}
            disabled={loading || !selectedFile}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-stone-900 px-5 py-4 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            {loading ? <CloudCog size={19} className="animate-pulse" /> : <Send size={19} />}
            {loading ? "正在分析" : "分析餐食"}
          </button>
          {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        </div>

        <div className="grid gap-4">
          <div className="metric-grid">
            <Metric label="摄入" value={kcalText(dashboard?.today.intakeKcal)} />
            <Metric label="静息" value={restingText(dashboard?.today)} muted={!dashboard?.today.ouraRestingKcal} />
            <Metric label="训练" value={kcalText(dashboard?.today.intervalsTrainingKcal)} />
            <Metric label="缺口" value={kcalText(dashboard?.today.deficitKcal)} highlight />
          </div>
          <WeightInputCard
            dateKey={dateKey}
            value={weightInput}
            saving={weightSaving}
            onChange={setWeightInput}
            onSave={saveWeight}
          />
        </div>
      </section>

      {draft ? (
        <section className="card mb-4 p-4 sm:p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">待确认餐食</h2>
              <p className="text-sm text-stone-500">
                {draft.confidence == null ? "置信度暂无" : `置信度 ${Math.round(draft.confidence * 100)}%`}
                {compression == null ? "" : ` · 图片缩小约 ${compression}%`}
              </p>
              {draft.userDescription ? <p className="mt-2 text-sm text-stone-600">说明：{draft.userDescription}</p> : null}
            </div>
            <div className="flex items-center gap-2">
              <input
                value={kcal}
                onChange={(event) => setKcal(event.target.value)}
                className="w-28 rounded-md border border-stone-300 px-3 py-2 text-right"
                inputMode="numeric"
              />
              <button onClick={confirmDraft} className="flex items-center gap-2 rounded-md bg-emerald-700 px-4 py-2 font-semibold text-white">
                <Check size={17} />
                确认
              </button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {draft.items.map((item) => (
              <div key={item.id} className="rounded-md border border-stone-200 bg-white px-3 py-2">
                <div className="flex justify-between gap-3 font-medium">
                  <span>{item.name}</span>
                  <span>{item.kcal} kcal</span>
                </div>
                <p className="text-sm text-stone-500">{item.portion || "份量未确定"}</p>
              </div>
            ))}
          </div>
          {draft.notes && !looksMojibake(draft.notes) ? <p className="mt-3 text-sm text-stone-600">{draft.notes}</p> : null}
          {draft.uncertainty && !looksMojibake(draft.uncertainty) ? (
            <p className="mt-2 text-sm text-amber-800">{draft.uncertainty}</p>
          ) : null}
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <TrendCard dashboard={dashboard} />
        <WeightChartCard days={dashboard?.days || []} />
      </section>

      <section className="card mt-4 p-4 sm:p-5">
        <h2 className="mb-3 text-lg font-semibold">今日记录</h2>
        <div className="space-y-3">
          {dashboard?.today.meals.length ? (
            dashboard.today.meals.map((meal) => (
              <div key={meal.id} className="rounded-md border border-stone-200 bg-white p-3">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">{meal.items.map((item) => item.name).join("、") || "餐食"}</span>
                  <span className="font-semibold">{meal.finalKcal} kcal</span>
                </div>
                {meal.userDescription ? <p className="mt-1 text-sm text-stone-500">{meal.userDescription}</p> : null}
                <p className="mt-1 text-sm text-stone-500">{meal.notes || meal.uncertainty || "已确认"}</p>
              </div>
            ))
          ) : (
            <p className="rounded-md bg-white p-3 text-sm text-stone-500">暂无已确认餐食</p>
          )}
        </div>
        <p className="mt-4 text-xs text-stone-500">
          {dashboard?.today.syncedAt ? `同步时间 ${new Date(dashboard.today.syncedAt).toLocaleString()}` : "消耗数据未同步"}
        </p>
      </section>
    </main>
  );
}

function WeightInputCard({
  dateKey,
  value,
  saving,
  onChange,
  onSave
}: {
  dateKey: string;
  value: string;
  saving: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-stone-500">今日体重</p>
          <h2 className="text-lg font-semibold">{dateKey}</h2>
        </div>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            inputMode="decimal"
            placeholder="例如 76.4"
            className="w-full rounded-md border border-stone-300 bg-white px-3 py-3 pr-10 text-lg font-semibold outline-none focus:border-emerald-600"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-stone-500">kg</span>
        </div>
        <button
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-md bg-emerald-700 px-4 py-2 font-semibold text-white disabled:opacity-60"
        >
          <Save size={17} />
          {saving ? "保存中" : "保存"}
        </button>
      </div>
    </div>
  );
}

function TrendCard({ dashboard }: { dashboard: Dashboard | null }) {
  const days = dashboard?.days || [];
  return (
    <div className="card p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">7 日热量趋势</h2>
        <div className="flex items-center gap-4 text-xs text-stone-500">
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" />摄入热量</span>
          <span className="inline-flex items-center gap-1"><span className="h-0.5 w-4 bg-stone-900" />每日缺口</span>
        </div>
      </div>
      <ComboTrendChart days={days} />
      <div className="mt-4 rounded-md bg-white p-3">
        <p className="text-sm text-stone-500">7 日累计缺口</p>
        <p className="text-2xl font-semibold">{kcalText(dashboard?.sevenDayDeficitKcal)}</p>
        <p className="text-sm text-stone-600">预计下降 {dashboard?.predictedWeightLossJin.toFixed(2) || "0.00"} 斤</p>
      </div>
    </div>
  );
}

function ComboTrendChart({ days }: { days: DashboardDay[] }) {
  const width = 720;
  const height = 260;
  const padding = { top: 18, right: 26, bottom: 42, left: 44 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const intake = days.map((day) => day.intakeKcal || 0);
  const deficit = days.map((day) => day.deficitKcal || 0);
  const maxValue = niceCeil(Math.max(500, ...intake, ...deficit.map((value) => Math.max(0, value))));
  const minValue = Math.min(0, ...deficit);
  const minAxis = minValue < 0 ? -niceCeil(Math.abs(minValue)) : 0;
  const y = (value: number) => padding.top + ((maxValue - value) / (maxValue - minAxis || 1)) * chartH;
  const zeroY = y(0);
  const x = (index: number) => padding.left + (days.length <= 1 ? chartW / 2 : (chartW / (days.length - 1)) * index);
  const bandW = chartW / Math.max(1, days.length);
  const barWidth = Math.max(14, Math.min(44, bandW - 18));
  const linePoints = deficit.map((value, index) => `${x(index)},${y(value)}`).join(" ");
  const ticks = minAxis < 0 ? [minAxis, 0, maxValue] : [0, Math.round(maxValue / 2), maxValue];

  return (
    <div className="overflow-hidden rounded-md bg-white">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full" role="img" aria-label="7 日摄入热量柱状图和每日缺口折线图">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={padding.left} x2={width - padding.right} y1={y(tick)} y2={y(tick)} stroke="#e7e5e4" strokeWidth="1" />
            <text x={padding.left - 8} y={y(tick) + 4} textAnchor="end" className="fill-stone-400 text-[11px]">
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
              <rect x={x(index) - barWidth / 2} y={top} width={barWidth} height={barHeight} rx="5" fill="#059669" opacity={value === 0 ? 0.25 : 0.86} />
              <HoverBand
                x={x(index)}
                bandWidth={bandW}
                chartTop={padding.top}
                chartHeight={chartH}
                width={width}
                lines={[day.dateKey, `摄入 ${Math.round(day.intakeKcal || 0)} kcal`, `缺口 ${day.deficitKcal == null ? "缺失" : `${Math.round(day.deficitKcal)} kcal`}`]}
              />
              <text x={x(index)} y={height - 18} textAnchor="middle" className="fill-stone-500 text-[12px]">
                {day.dateKey.slice(5)}
              </text>
            </g>
          );
        })}
        <polyline points={linePoints} fill="none" stroke="#1c1917" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        {deficit.map((value, index) => (
          <g key={`${days[index]?.dateKey}-point`}>
            <circle cx={x(index)} cy={y(value)} r="4.5" fill="#1c1917" />
            <circle cx={x(index)} cy={y(value)} r="2" fill="#ffffff" />
          </g>
        ))}
      </svg>
    </div>
  );
}

function WeightChartCard({ days }: { days: DashboardDay[] }) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">7 日体重追踪</h2>
        <span className="text-xs text-stone-500">手动录入</span>
      </div>
      <WeightLineChart days={days} />
      <div className="mt-4 rounded-md bg-white p-3">
        <p className="text-sm text-stone-500">最新体重</p>
        <p className="text-2xl font-semibold">{latestWeightText(days)}</p>
      </div>
    </div>
  );
}

function WeightLineChart({ days }: { days: DashboardDay[] }) {
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
    <div className="overflow-hidden rounded-md bg-white">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full" role="img" aria-label="7 日体重折线图">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={padding.left} x2={width - padding.right} y1={y(tick)} y2={y(tick)} stroke="#e7e5e4" strokeWidth="1" />
            <text x={padding.left - 8} y={y(tick) + 4} textAnchor="end" className="fill-stone-400 text-[11px]">
              {tick.toFixed(1)}
            </text>
          </g>
        ))}
        {points ? <polyline points={points} fill="none" stroke="#0f766e" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /> : null}
        {days.map((day, index) => (
          <g key={day.dateKey} className="group">
            {day.weightKg == null ? (
              <circle cx={x(index)} cy={padding.top + chartH} r="3" fill="#d6d3d1" />
            ) : (
              <circle cx={x(index)} cy={y(day.weightKg)} r="5" fill="#0f766e" />
            )}
            <HoverBand
              x={x(index)}
              bandWidth={bandW}
              chartTop={padding.top}
              chartHeight={chartH}
              width={width}
              lines={[day.dateKey, `体重 ${day.weightKg == null ? "未录入" : `${day.weightKg.toFixed(1)} kg`}`]}
            />
            <text x={x(index)} y={height - 18} textAnchor="middle" className="fill-stone-500 text-[12px]">
              {day.dateKey.slice(5)}
            </text>
          </g>
        ))}
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
  lines
}: {
  x: number;
  bandWidth: number;
  chartTop: number;
  chartHeight: number;
  width: number;
  lines: string[];
}) {
  const tooltipX = Math.min(width - 178, Math.max(54, x - 84));
  const textX = tooltipX + 12;
  return (
    <>
      <rect x={x - bandWidth / 2} y={chartTop} width={bandWidth} height={chartHeight} fill="transparent" />
      <g className="opacity-0 transition-opacity group-hover:opacity-100">
        <line x1={x} x2={x} y1={chartTop} y2={chartTop + chartHeight} stroke="#78716c" strokeDasharray="4 4" />
        <rect x={tooltipX} y={chartTop + 8} width="168" height={lines.length > 2 ? 72 : 54} rx="7" fill="#1c1917" opacity="0.92" />
        {lines.map((line, index) => (
          <text key={line} x={textX} y={chartTop + 29 + index * 18} className="fill-white text-[12px]">
            {line}
          </text>
        ))}
      </g>
    </>
  );
}

function niceCeil(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 500;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function Metric({ label, value, highlight, muted }: { label: string; value: string; highlight?: boolean; muted?: boolean }) {
  return (
    <div className={`card p-4 ${highlight ? "bg-emerald-50" : ""}`}>
      <p className="text-sm text-stone-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${muted ? "text-stone-400" : ""}`}>{value}</p>
    </div>
  );
}

function latestWeightText(days: DashboardDay[]) {
  const latest = [...days].reverse().find((day) => day.weightKg != null);
  return latest?.weightKg == null ? "未录入" : `${latest.weightKg.toFixed(1)} kg`;
}

function restingText(today: Dashboard["today"] | undefined) {
  if (!today) return "未同步";
  if (today.ouraRestingKcal != null) return kcalText(today.ouraRestingKcal);
  if (today.sourceStatus.includes("oura:missing")) return "未连接 Oura";
  return "未同步";
}

function kcalText(value: number | null | undefined) {
  if (value == null) return "未同步";
  return `${Math.round(value)} kcal`;
}

function looksMojibake(value: string) {
  return /[�锟]/.test(value);
}
