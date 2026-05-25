"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  BarChart3,
  Camera,
  Check,
  CloudCog,
  Flame,
  Gauge,
  LineChart,
  RefreshCw,
  Save,
  Send,
  Settings,
  TrendingDown,
  Upload,
  Utensils,
  Weight
} from "lucide-react";

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
  mealCount: number;
  weightKg: number | null;
  totalBurnKcal: number | null;
  deficitKcal: number | null;
};
type WeekSummary = {
  startDateKey: string;
  endDateKey: string;
  label: string;
  intakeKcal: number;
  deficitKcal: number;
  latestWeightKg: number | null;
};
type Dashboard = {
  dateKey: string;
  today: DashboardDay & {
    ouraRestingKcal: number | null;
    ouraTotalKcal: number | null;
    intervalsTrainingKcal: number | null;
    meals: MealEntry[];
    sourceStatus: string;
    syncedAt: string | null;
  };
  days: DashboardDay[];
  weeks: WeekSummary[];
  weekDeficitKcal: number;
  sevenDayDeficitKcal: number;
  fourWeekDeficitKcal: number;
  predictedWeightLossJin: number;
  predictedFourWeekWeightLossJin: number;
};

export default function DashboardTailAdminClient({ initialDate }: { initialDate: string }) {
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
    if (!response.ok) return;
    const data = (await response.json()) as Dashboard;
    setDashboard(data);
    setWeightInput(data.today.weightKg == null ? "" : String(data.today.weightKg));
  }, [dateKey]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/dashboard?date=${dateKey}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: Dashboard | null) => {
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

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function chooseFile(file: File) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setError("");
  }

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
    <main className="min-h-screen bg-[linear-gradient(135deg,#fff7ed_0%,#f8fafc_44%,#eef2ff_100%)] px-3 py-3 text-slate-900 sm:px-5 sm:py-5">
      <div className="mx-auto grid min-h-[calc(100vh-40px)] w-full max-w-[1640px] gap-5 rounded-lg border border-white/70 bg-white/55 p-3 shadow-2xl shadow-slate-300/30 backdrop-blur md:p-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden rounded-lg border border-white/70 bg-white/80 p-5 shadow-sm lg:flex lg:flex-col">
          <div className="px-1 py-2">
            <p className="text-3xl font-black tracking-normal text-fuchsia-600">TRACKER</p>
            <p className="mt-1 text-sm font-medium text-slate-500">Food Deficit Studio</p>
          </div>
          <nav className="mt-8 space-y-2 text-sm">
            <SideItem icon={<Gauge size={18} />} label="Dashboard" active />
            <SideItem icon={<Camera size={18} />} label="餐食识别" />
            <SideItem icon={<BarChart3 size={18} />} label="周/月统计" />
            <SideItem icon={<Weight size={18} />} label="体重追踪" />
            <SideItem icon={<Activity size={18} />} label="数据同步" />
            <SideItem icon={<Settings size={18} />} label="设置" href="/settings" />
          </nav>
          <div className="mt-auto rounded-lg border border-fuchsia-100 bg-fuchsia-50 p-4 text-center">
            <p className="text-sm font-semibold text-fuchsia-700">同步状态</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">{dashboard?.today.syncedAt ? new Date(dashboard.today.syncedAt).toLocaleString() : "消耗数据未同步"}</p>
            <button onClick={syncNow} className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-fuchsia-600 px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={syncing}>
              <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
              同步
            </button>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-h-14 items-center gap-3 rounded-lg border border-white/80 bg-white/80 px-4 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                <Flame size={22} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-950">今日热量任务</p>
                <p className="text-xs text-slate-500">先记录餐食，再查看真实缺口趋势</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={dateKey}
                onChange={(event) => setDateKey(event.target.value)}
                className="h-11 rounded-lg border border-white/80 bg-white px-3 text-sm shadow-sm outline-none focus:border-fuchsia-400"
              />
              <button onClick={syncNow} className="icon-button" aria-label="同步">
                <RefreshCw size={18} className={syncing ? "animate-spin" : ""} />
              </button>
              <Link href="/settings" className="icon-button" aria-label="设置">
                <Settings size={18} />
              </Link>
            </div>
          </header>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-5">
              <MissionCard dashboard={dashboard} />

              <section className="grid gap-5 2xl:grid-cols-[1.05fr_0.95fr]">
                <UploadPanel
                  inputRef={inputRef}
                  loading={loading}
                  selectedFile={selectedFile}
                  previewUrl={previewUrl}
                  mealContext={mealContext}
                  error={error}
                  onChoose={chooseFile}
                  onPick={() => inputRef.current?.click()}
                  onContext={setMealContext}
                  onAnalyze={analyze}
                />
                {draft ? (
                  <DraftCard draft={draft} kcal={kcal} compression={compression} onKcal={setKcal} onConfirm={confirmDraft} />
                ) : (
                  <ClassificationCard />
                )}
              </section>

              <section className="grid gap-5 2xl:grid-cols-[1.1fr_0.9fr]">
                <TrendCard dashboard={dashboard} />
                <WeightChartCard days={dashboard?.days || []} />
              </section>

              <MonthlyStatsCard dashboard={dashboard} />
            </div>

            <aside className="space-y-5">
              <DailySummaryCard dashboard={dashboard} dateKey={dateKey} />
              <WeightInputCard dateKey={dateKey} value={weightInput} saving={weightSaving} onChange={setWeightInput} onSave={saveWeight} />
              <TipsCard />
              <TodayMeals meals={dashboard?.today.meals || []} syncedAt={dashboard?.today.syncedAt || null} />
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}

function SideItem({ icon, label, active, href }: { icon: React.ReactNode; label: string; active?: boolean; href?: string }) {
  const content = (
    <>
      {icon}
      <span>{label}</span>
    </>
  );
  const className = `flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium transition ${active ? "bg-fuchsia-100 text-fuchsia-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`;

  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

function MissionCard({ dashboard }: { dashboard: Dashboard | null }) {
  const today = dashboard?.today;
  const intake = today?.intakeKcal ?? 0;
  const totalBurn = today?.totalBurnKcal ?? 0;
  const deficit = today?.deficitKcal;
  const progress = totalBurn > 0 ? Math.min(100, Math.round((intake / totalBurn) * 100)) : 0;
  const deficitProgress = deficit == null || totalBurn <= 0 ? 0 : Math.min(100, Math.round((Math.max(0, deficit) / totalBurn) * 100));
  const weekProgress = dashboard?.weekDeficitKcal && dashboard.weekDeficitKcal > 0 ? Math.min(100, Math.round((dashboard.weekDeficitKcal / 3850) * 100)) : 0;

  return (
    <section className="panel p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-fuchsia-600">Today Mission</p>
          <h2 className="text-2xl font-semibold tracking-normal text-slate-950">今日热量任务</h2>
        </div>
        <span className="rounded-lg bg-orange-50 px-3 py-1.5 text-sm font-medium text-orange-600">{today?.mealCount ? "餐食已录入" : "等待餐食"}</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[330px_minmax(0,1fr)]">
        <div className="flex items-center justify-center">
          <div className="relative h-72 w-72">
            <svg viewBox="0 0 220 220" className="h-full w-full -rotate-90">
              <circle cx="110" cy="110" r="92" fill="none" stroke="#f3e8ff" strokeWidth="8" />
              <circle cx="110" cy="110" r="92" fill="none" stroke="#a855f7" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${progress * 5.78} 578`} />
              <circle cx="110" cy="110" r="72" fill="none" stroke="#ffedd5" strokeWidth="8" />
              <circle cx="110" cy="110" r="72" fill="none" stroke="#fb923c" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${deficitProgress * 4.52} 452`} />
              <circle cx="110" cy="110" r="52" fill="none" stroke="#dcfce7" strokeWidth="8" />
              <circle cx="110" cy="110" r="52" fill="none" stroke="#22c55e" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${weekProgress * 3.26} 326`} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <Flame size={28} className="mb-2 text-slate-950" />
              <p className="text-3xl font-bold tracking-normal text-slate-950">{Math.round(intake)} / {Math.round(totalBurn || 0)}</p>
              <p className="text-sm text-slate-500">kcal 摄入 / 总消耗</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <MissionMetric dot="bg-blue-500" label="摄入热量" value={kcalText(today?.intakeKcal)} />
          <MissionMetric dot="bg-orange-400" label="Oura 总消耗" value={totalBurnText(today)} />
          <MissionMetric dot="bg-emerald-500" label="今日缺口" value={deficitText(today)} />
          <MissionMetric dot="bg-violet-500" label="ICU 训练参考" value={kcalText(today?.intervalsTrainingKcal)} />
          <MissionMetric dot="bg-rose-400" label="本周累计缺口" value={kcalText(dashboard?.weekDeficitKcal)} />
          <MissionMetric dot="bg-slate-300" label="本周预计下降" value={`${dashboard?.predictedWeightLossJin.toFixed(2) || "0.00"} 斤`} />
        </div>
      </div>
    </section>
  );
}

function MissionMetric({ dot, label, value }: { dot: string; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white/70 p-4 shadow-sm">
      <p className="flex items-center gap-2 text-sm text-slate-500"><span className={`h-2.5 w-2.5 rounded-full ${dot}`} />{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function DailySummaryCard({ dashboard, dateKey }: { dashboard: Dashboard | null; dateKey: string }) {
  const today = dashboard?.today;
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center gap-3 bg-orange-100 px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-950">
          <Gauge size={19} />
        </div>
        <div>
          <p className="text-sm text-orange-700">当前日期</p>
          <h3 className="text-lg font-semibold text-slate-950">{dateKey}</h3>
        </div>
      </div>
      <div className="p-5">
        <p className="text-3xl font-bold text-slate-950">{deficitText(today)}</p>
        <p className="mt-1 text-sm text-slate-500">今日热量缺口</p>
        <div className="mt-5 space-y-3 text-sm">
          <SummaryRow label="摄入" value={kcalText(today?.intakeKcal)} />
          <SummaryRow label="总消耗" value={totalBurnText(today)} />
          <SummaryRow label="餐食记录" value={`${today?.mealCount || 0} 条`} />
        </div>
      </div>
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 last:border-b-0 last:pb-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-950">{value}</span>
    </div>
  );
}

function TipsCard() {
  return (
    <section className="panel overflow-hidden p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Function Map</p>
          <h3 className="text-lg font-semibold">功能分类</h3>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
          <BarChart3 size={20} />
        </div>
      </div>
      <div className="space-y-3 text-sm">
        <SummaryRow label="餐食识别" value="图片 + 文本" />
        <SummaryRow label="消耗来源" value="Oura 总消耗" />
        <SummaryRow label="训练数据" value="ICU 参考" />
        <SummaryRow label="统计周期" value="本周 / 4 周" />
      </div>
    </section>
  );
}

function ClassificationCard() {
  return (
    <section className="panel flex min-h-full flex-col justify-center p-5">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-fuchsia-50 text-fuchsia-600">
        <LineChart size={24} />
      </div>
      <p className="text-sm font-medium text-fuchsia-600">Analysis Flow</p>
      <h3 className="mt-1 text-xl font-semibold">餐食先生成草稿</h3>
      <p className="mt-3 text-sm leading-6 text-slate-500">图片和补充说明一起发送。你确认热量后，才会计入摄入、缺口、本周和月度统计。</p>
      <div className="mt-5 grid gap-2 text-sm text-slate-600">
        <div className="rounded-lg bg-slate-50 px-3 py-2">1. 上传图片</div>
        <div className="rounded-lg bg-slate-50 px-3 py-2">2. 填写重量/做法/店铺</div>
        <div className="rounded-lg bg-slate-50 px-3 py-2">3. 确认 kcal 后入账</div>
      </div>
    </section>
  );
}

function UploadPanel({
  inputRef,
  loading,
  selectedFile,
  previewUrl,
  mealContext,
  error,
  onChoose,
  onPick,
  onContext,
  onAnalyze
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  loading: boolean;
  selectedFile: File | null;
  previewUrl: string | null;
  mealContext: string;
  error: string;
  onChoose: (file: File) => void;
  onPick: () => void;
  onContext: (value: string) => void;
  onAnalyze: () => void;
}) {
  return (
    <div className="panel p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-fuchsia-600">Meal Vision</p>
          <h3 className="text-lg font-semibold">上传餐食图片</h3>
        </div>
        <Camera className="text-slate-400" size={22} />
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onChoose(file);
          event.currentTarget.value = "";
        }}
      />
      <button
        onClick={onPick}
        disabled={loading}
        className="flex min-h-64 w-full flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-fuchsia-300 bg-fuchsia-50 px-6 py-12 text-fuchsia-700 transition hover:border-fuchsia-500 hover:bg-fuchsia-100 disabled:opacity-70"
      >
        {loading ? <CloudCog size={52} className="animate-pulse" /> : <Upload size={58} />}
        <span className="text-3xl font-semibold">{loading ? "分析中" : "上传图片"}</span>
        <span className="text-sm text-fuchsia-500">先选图，再填写重量、做法或店铺</span>
      </button>

      {previewUrl ? (
        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="待分析餐食" className="max-h-72 w-full object-contain" />
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-3 py-2 text-sm text-slate-500">
            <span className="truncate">{selectedFile?.name}</span>
            <span>{selectedFile ? `${(selectedFile.size / 1024 / 1024).toFixed(1)} MB` : ""}</span>
          </div>
        </div>
      ) : null}

      <label className="mt-4 block">
        <span className="mb-2 block text-sm font-medium text-slate-700">补充说明</span>
        <textarea
          value={mealContext}
          onChange={(event) => onContext(event.target.value)}
          rows={4}
          className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-100"
          placeholder="例如：米饭约 180g；鸡胸肉空气炸锅少油；麦当劳板烧鸡腿堡一份；海底捞番茄锅里捞出的牛肉约 120g"
        />
      </label>
      <button
        onClick={onAnalyze}
        disabled={loading || !selectedFile}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-fuchsia-600 px-5 py-4 text-base font-semibold text-white shadow-sm shadow-fuchsia-600/20 transition hover:bg-fuchsia-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {loading ? <CloudCog size={19} className="animate-pulse" /> : <Send size={19} />}
        {loading ? "正在分析" : "发送并分析餐食"}
      </button>
      {error ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
    </div>
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
    <div className="panel p-4 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">Body Weight</p>
          <h3 className="text-lg font-semibold">今日体重</h3>
          <p className="mt-1 text-xs text-slate-400">{dateKey}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
          <Weight size={20} />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            inputMode="decimal"
            placeholder="例如 76.4"
          className="h-12 w-full rounded-lg border border-slate-200 bg-white px-3 pr-10 text-lg font-semibold outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-100"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">kg</span>
        </div>
        <button onClick={onSave} disabled={saving} className="flex items-center gap-2 rounded-lg bg-slate-950 px-4 font-semibold text-white disabled:opacity-60">
          <Save size={17} />
          {saving ? "保存中" : "保存"}
        </button>
      </div>
    </div>
  );
}

function DraftCard({
  draft,
  kcal,
  compression,
  onKcal,
  onConfirm
}: {
  draft: MealEntry;
  kcal: string;
  compression: number | null;
  onKcal: (value: string) => void;
  onConfirm: () => void;
}) {
  const draftImageUrl = draft.compressedImageUrl || draft.imageUrl;

  return (
    <div className="panel p-4 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-amber-600">待确认</p>
          <h3 className="text-lg font-semibold">餐食草稿</h3>
          <p className="mt-1 text-xs text-slate-500">
            {draft.confidence == null ? "置信度暂无" : `置信度 ${Math.round(draft.confidence * 100)}%`}
            {compression == null ? "" : ` · 图片缩小约 ${compression}%`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input value={kcal} onChange={(event) => onKcal(event.target.value)} className="h-10 w-28 rounded-lg border border-slate-200 px-3 text-right font-semibold outline-none focus:border-fuchsia-500" inputMode="numeric" />
          <button onClick={onConfirm} className="flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 font-semibold text-white">
            <Check size={17} />
            确认
          </button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[112px_minmax(0,1fr)]">
        <MealThumbnail url={draftImageUrl} label="上传图片" />
        <div className="grid gap-2">
          {draft.items.map((item) => (
            <div key={item.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="flex justify-between gap-3 font-medium">
                <span>{item.name}</span>
                <span>{item.kcal} kcal</span>
              </div>
              <p className="mt-1 text-sm text-slate-500">{item.portion || "份量未确定"}</p>
            </div>
          ))}
        </div>
      </div>
      {draft.notes && !looksMojibake(draft.notes) ? <p className="mt-3 text-sm text-slate-600">{draft.notes}</p> : null}
      {draft.uncertainty && !looksMojibake(draft.uncertainty) ? <p className="mt-2 text-sm text-amber-700">{draft.uncertainty}</p> : null}
    </div>
  );
}

function EmptyDraftCard() {
  return (
    <div className="panel flex min-h-48 flex-col justify-center p-5">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        <LineChart size={22} />
      </div>
      <h3 className="text-lg font-semibold">等待餐食分析</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">上传图片并填写说明后，模型估算会先生成草稿。确认热量后，才会计入今日摄入和缺口。</p>
    </div>
  );
}

function TrendCard({ dashboard }: { dashboard: Dashboard | null }) {
  const days = dashboard?.days || [];
  return (
    <div className="panel p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">Calorie Trend</p>
          <h3 className="text-lg font-semibold">本周热量趋势</h3>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-blue-500" />摄入热量</span>
          <span className="inline-flex items-center gap-1"><span className="h-0.5 w-4 bg-emerald-600" />每日缺口</span>
        </div>
      </div>
      <ComboTrendChart days={days} />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <SmallStat label="本周累计缺口" value={kcalText(dashboard?.weekDeficitKcal ?? dashboard?.sevenDayDeficitKcal)} />
        <SmallStat label="预计下降" value={`${dashboard?.predictedWeightLossJin.toFixed(2) || "0.00"} 斤`} />
      </div>
    </div>
  );
}
function WeightChartCard({ days }: { days: DashboardDay[] }) {
  return (
    <div className="panel p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">Weight Trend</p>
          <h3 className="text-lg font-semibold">本周体重追踪</h3>
        </div>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">手动录入</span>
      </div>
      <WeightLineChart days={days} />
      <div className="mt-4">
        <SmallStat label="最新体重" value={latestWeightText(days)} />
      </div>
    </div>
  );
}

function MonthlyStatsCard({ dashboard }: { dashboard: Dashboard | null }) {
  const weeks = dashboard?.weeks || [];
  return (
    <div className="panel p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">Monthly Summary</p>
          <h3 className="text-lg font-semibold">月度统计</h3>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" />每周缺口</span>
          <span className="inline-flex items-center gap-1"><span className="h-0.5 w-4 bg-rose-500" />体重追踪</span>
        </div>
      </div>
      <FourWeekChart weeks={weeks} />
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <SmallStat label="4 周累计缺口" value={kcalText(dashboard?.fourWeekDeficitKcal)} />
        <SmallStat label="4 周预计下降" value={`${dashboard?.predictedFourWeekWeightLossJin.toFixed(2) || "0.00"} 斤`} />
        <SmallStat label="最新体重" value={latestWeeklyWeightText(weeks)} />
      </div>
    </div>
  );
}

function TodayMeals({ meals, syncedAt }: { meals: MealEntry[]; syncedAt: string | null }) {
  return (
    <section className="panel p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">Meal Entries</p>
          <h3 className="text-lg font-semibold">今日记录</h3>
        </div>
        <p className="text-xs text-slate-400">{syncedAt ? `同步时间 ${new Date(syncedAt).toLocaleString()}` : "消耗数据未同步"}</p>
      </div>
      <div className="space-y-3">
        {meals.length ? (
          meals.map((meal) => (
            <div key={meal.id} className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
              <MealThumbnail url={meal.compressedImageUrl || meal.imageUrl} label="餐食图片" compact />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-3">
                  <span className="truncate font-medium">{meal.items.map((item) => item.name).join("、") || "餐食"}</span>
                  <span className="shrink-0 font-semibold">{meal.finalKcal} kcal</span>
                </div>
                {meal.userDescription ? <p className="mt-1 text-sm text-slate-500">{meal.userDescription}</p> : null}
                <p className="mt-1 text-sm text-slate-500">{meal.notes || meal.uncertainty || "已确认"}</p>
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">暂无已确认餐食</p>
        )}
      </div>
    </section>
  );
}

function MealThumbnail({ url, label, compact }: { url: string | null; label: string; compact?: boolean }) {
  const sizeClass = compact ? "h-14 w-14" : "h-28 w-full sm:h-full sm:min-h-24 sm:w-28";
  if (!url) {
    return (
      <div className={`${sizeClass} flex shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white text-xs text-slate-400`}>
        无图片
      </div>
    );
  }

  return (
    <div className={`${sizeClass} shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={label} className="h-full w-full object-cover" />
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
      <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full" role="img" aria-label="本周摄入热量柱状图和每日缺口折线图">
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
              <rect x={x(index) - barWidth / 2} y={top} width={barWidth} height={barHeight} rx="5" fill="#3b82f6" opacity={value === 0 ? 0.25 : 0.9} />
              <HoverBand
                x={x(index)}
                bandWidth={bandW}
                chartTop={padding.top}
                chartHeight={chartH}
                width={width}
                lines={[day.dateKey, `摄入 ${Math.round(day.intakeKcal || 0)} kcal`, `缺口 ${day.deficitKcal == null ? "未统计" : `${Math.round(day.deficitKcal)} kcal`}`]}
              />
              <text x={x(index)} y={height - 18} textAnchor="middle" className="fill-slate-500 text-[12px]">
                {day.dateKey.slice(5)}
              </text>
            </g>
          );
        })}
        {linePoints ? <polyline points={linePoints} fill="none" stroke="#059669" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /> : null}
        {deficit.map((value, index) =>
          value == null ? null : (
            <g key={`${days[index]?.dateKey}-point`}>
              <circle cx={x(index)} cy={y(value)} r="4.5" fill="#059669" />
              <circle cx={x(index)} cy={y(value)} r="2" fill="#ffffff" />
            </g>
          )
        )}
      </svg>
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
        {points ? <polyline points={points} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /> : null}
        {days.map((day, index) => (
          <g key={day.dateKey} className="group">
            {day.weightKg == null ? <circle cx={x(index)} cy={padding.top + chartH} r="3" fill="#cbd5e1" /> : <circle cx={x(index)} cy={y(day.weightKg)} r="5" fill="#2563eb" />}
            <HoverBand x={x(index)} bandWidth={bandW} chartTop={padding.top} chartHeight={chartH} width={width} lines={[day.dateKey, `体重 ${day.weightKg == null ? "未录入" : `${day.weightKg.toFixed(1)} kg`}`]} />
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
  const width = 720;
  const height = 260;
  const padding = { top: 22, right: 30, bottom: 42, left: 48 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const deficits = weeks.map((week) => week.deficitKcal || 0);
  const weights = weeks.map((week) => week.latestWeightKg).filter((value): value is number => value != null);
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
    .map((week, index) => (week.latestWeightKg == null ? null : `${x(index)},${yWeight(week.latestWeightKg)}`))
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
              <rect x={x(index) - barWidth / 2} y={barY} width={barWidth} height={barHeight} rx="6" fill="#6366f1" opacity={value === 0 ? 0.25 : 0.9} />
              <HoverBand
                x={x(index)}
                bandWidth={bandW}
                chartTop={padding.top}
                chartHeight={chartH}
                width={width}
                lines={[
                  week.label,
                  `缺口 ${Math.round(week.deficitKcal || 0)} kcal`,
                  `体重 ${week.latestWeightKg == null ? "未录入" : `${week.latestWeightKg.toFixed(1)} kg`}`
                ]}
              />
              <text x={x(index)} y={height - 18} textAnchor="middle" className="fill-slate-500 text-[12px]">
                {week.label}
              </text>
            </g>
          );
        })}
        {weightPoints ? <polyline points={weightPoints} fill="none" stroke="#f43f5e" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /> : null}
        {weeks.map((week, index) =>
          week.latestWeightKg == null ? null : (
            <g key={`${week.startDateKey}-weight`}>
              <circle cx={x(index)} cy={yWeight(week.latestWeightKg)} r="4.5" fill="#f43f5e" />
              <circle cx={x(index)} cy={yWeight(week.latestWeightKg)} r="2" fill="#ffffff" />
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

function Metric({ icon, label, value, accent, muted }: { icon: React.ReactNode; label: string; value: string; accent: "blue" | "amber" | "violet" | "emerald"; muted?: boolean }) {
  const styles = {
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
    violet: "bg-violet-50 text-violet-600",
    emerald: "bg-emerald-50 text-emerald-600"
  };

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${styles[accent]}`}>{icon}</div>
      </div>
      <p className={`mt-4 text-2xl font-semibold ${muted ? "text-slate-400" : "text-slate-950"}`}>{value}</p>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
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

function latestWeeklyWeightText(weeks: WeekSummary[]) {
  const latest = [...weeks].reverse().find((week) => week.latestWeightKg != null);
  return latest?.latestWeightKg == null ? "未录入" : `${latest.latestWeightKg.toFixed(1)} kg`;
}

function totalBurnText(today: Dashboard["today"] | undefined) {
  if (!today) return "未同步";
  if (today.totalBurnKcal != null) return kcalText(today.totalBurnKcal);
  if (today.sourceStatus.includes("oura:missing")) return "未连接 Oura";
  return "未同步";
}

function kcalText(value: number | null | undefined) {
  if (value == null) return "未同步";
  return `${Math.round(value)} kcal`;
}

function deficitText(today: DashboardDay | undefined) {
  if (!today) return "未同步";
  if (today.mealCount === 0) return "未统计";
  return kcalText(today.deficitKcal);
}

function looksMojibake(value: string) {
  return /[锟介敓]/.test(value);
}
