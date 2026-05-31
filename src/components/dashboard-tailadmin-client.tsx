"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  BookmarkPlus,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  CloudCog,
  Database,
  FileText,
  Flame,
  Home,
  Menu,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Save,
  Send,
  Settings,
  Star,
  Trash2,
  Upload,
  Weight,
  X
} from "lucide-react";

type NutritionSource = {
  id: string;
  name: string;
  imageUrl: string | null;
  kcalPer100g: number;
  proteinPer100g: number | null;
  fatPer100g: number | null;
  carbsPer100g: number | null;
  confidence: number | null;
  notes: string | null;
};
type NutritionSourceDraft = Omit<NutritionSource, "id">;
type MealItem = { id: string; name: string; portion: string | null; grams: number | null; kcal: number; confidence: number | null; calculationSource: string | null };
type MealPresetItem = {
  id: string;
  name: string;
  portion: string | null;
  defaultGrams: number | null;
  kcal: number;
  confidence: number | null;
  calculationSource: string | null;
  nutritionSourceId: string | null;
  nutritionSource: NutritionSource | null;
};
type MealPreset = {
  id: string;
  name: string;
  imageUrl: string | null;
  description: string | null;
  baseKcal: number;
  usageCount: number;
  items: MealPresetItem[];
};
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
  averageWeightKg: number | null;
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

type AppTab = "home" | "quick" | "capture" | "trends" | "more";
type ConnectionStatus = {
  oura: { connected: boolean; scope: string | null; expiresAt: number | null };
  intervals: { connected: boolean; athleteId: string };
};

const APP_TABS = new Set<AppTab>(["home", "quick", "capture", "trends", "more"]);

export default function DashboardTailAdminClient({ initialDate }: { initialDate: string }) {
  const [dateKey, setDateKey] = useState(initialDate);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [presets, setPresets] = useState<MealPreset[]>([]);
  const [draft, setDraft] = useState<MealEntry | null>(null);
  const [kcal, setKcal] = useState("");
  const [mealContext, setMealContext] = useState("");
  const [weightInput, setWeightInput] = useState("");
  const [weightSaving, setWeightSaving] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [presetSavingId, setPresetSavingId] = useState<string | null>(null);
  const [presetAddingId, setPresetAddingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<AppTab>("home");
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/dashboard?date=${dateKey}`);
    if (!response.ok) return;
    const data = (await response.json()) as Dashboard;
    setDashboard(data);
    setWeightInput(data.today.weightKg == null ? "" : String(data.today.weightKg));
  }, [dateKey]);

  const loadPresets = useCallback(async () => {
    const response = await fetch("/api/meal-presets");
    if (!response.ok) return;
    const data = (await response.json()) as { presets: MealPreset[] };
    setPresets(data.presets);
  }, []);

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
    let cancelled = false;
    fetch("/api/meal-presets")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { presets: MealPreset[] } | null) => {
        if (!cancelled && data) setPresets(data.presets);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    function updateTabFromHash() {
      const nextTab = window.location.hash.slice(1) as AppTab;
      setActiveTab(APP_TABS.has(nextTab) ? nextTab : "home");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    updateTabFromHash();
    window.addEventListener("hashchange", updateTabFromHash);
    return () => window.removeEventListener("hashchange", updateTabFromHash);
  }, []);

  const navigateTo = useCallback((tab: AppTab) => {
    if (window.location.hash === `#${tab}`) {
      setActiveTab(tab);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    window.location.hash = tab;
  }, []);

  function chooseFile(file: File) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setError("");
  }

  async function analyze() {
    const description = mealContext.trim();
    if (!selectedFile && !description) {
      setError("请上传餐食图片或填写餐食描述");
      return;
    }

    setLoading(true);
    setError("");
    const form = new FormData();
    if (selectedFile) form.append("image", selectedFile);
    form.append("dateKey", dateKey);
    form.append("userDescription", description);

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

  async function savePreset(meal: MealEntry) {
    setPresetSavingId(meal.id);
    setError("");
    const response = await fetch("/api/meal-presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mealEntryId: meal.id })
    });
    const data = await response.json().catch(() => ({}));
    setPresetSavingId(null);
    if (!response.ok) {
      setError(data.error || "保存常用餐食失败");
      return;
    }
    await loadPresets();
  }

  async function usePreset(preset: MealPreset, items: Array<{ id: string; grams: number | null }>) {
    setPresetAddingId(preset.id);
    setError("");
    const response = await fetch(`/api/meal-presets/${preset.id}/use`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dateKey, items })
    });
    const data = await response.json().catch(() => ({}));
    setPresetAddingId(null);
    if (!response.ok) {
      setError(data.error || "快速计入失败");
      return;
    }
    if (!data.confirmed && data.entry) {
      setDraft(data.entry);
      setKcal(String(data.entry.finalKcal || data.entry.modelKcal || ""));
    }
    await Promise.all([load(), loadPresets()]);
  }

  async function deletePreset(preset: MealPreset) {
    if (!window.confirm(`删除常用餐食“${preset.name}”？`)) return;
    const response = await fetch(`/api/meal-presets/${preset.id}`, { method: "DELETE" });
    if (!response.ok) {
      setError("删除常用餐食失败");
      return;
    }
    await loadPresets();
  }

  const compression = useMemo(() => {
    if (!draft?.originalBytes || !draft.compressedBytes) return null;
    return Math.max(0, Math.round((1 - draft.compressedBytes / draft.originalBytes) * 100));
  }, [draft]);

  return (
    <main className="min-h-screen bg-[#f7eff4] text-slate-900">
      <div className="relative mx-auto min-h-screen w-full max-w-[480px] overflow-hidden bg-[linear-gradient(180deg,#fff9fb_0%,#fefbfc_42%,#faf6fa_100%)] pb-[calc(5.5rem+env(safe-area-inset-bottom))] shadow-[0_0_70px_rgba(138,91,132,0.16)]">
        <AppHeader activeTab={activeTab} onNavigate={navigateTo} />
        <section className="px-4 pb-4">
          <div key={activeTab} className="app-tab-enter space-y-4">
            {activeTab === "home" ? (
              <HomeDashboard
                dashboard={dashboard}
                dateKey={dateKey}
                presets={presets}
                addingId={presetAddingId}
                weightInput={weightInput}
                weightSaving={weightSaving}
                savingPresetId={presetSavingId}
                onDate={setDateKey}
                onUsePreset={usePreset}
                onWeight={setWeightInput}
                onSaveWeight={saveWeight}
                onSavePreset={savePreset}
                onNavigate={navigateTo}
              />
            ) : null}
            {activeTab === "capture" ? (
              <AppTabSection eyebrow="Meal Vision" title="记一餐" description="上传图片或填写描述，确认热量后再计入今日统计。">
                <div className="space-y-4">
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
                  {draft ? <DraftCard draft={draft} kcal={kcal} compression={compression} onKcal={setKcal} onConfirm={confirmDraft} /> : null}
                </div>
              </AppTabSection>
            ) : null}
            {activeTab === "quick" ? (
              <AppTabSection eyebrow="Quick Meals" title="常用餐食" description="维护模板和个人营养库，常吃的食物可以更快计入。">
                <QuickPresetsCard
                  presets={presets}
                  addingId={presetAddingId}
                  onUse={usePreset}
                  onDelete={deletePreset}
                  onReload={loadPresets}
                  onError={setError}
                />
              </AppTabSection>
            ) : null}
            {activeTab === "trends" ? (
              <AppTabSection eyebrow="Reports" title="趋势" description="按周观察热量缺口和体重变化，按四周查看长期趋势。">
                <div className="space-y-4">
                  <TrendCard dashboard={dashboard} />
                  <WeightChartCard days={dashboard?.days || []} />
                  <MonthlyStatsCard dashboard={dashboard} />
                </div>
              </AppTabSection>
            ) : null}
            {activeTab === "more" ? (
              <AppTabSection eyebrow="Settings" title="更多" description="管理数据源、同步状态和连接设置。">
                <MorePage dashboard={dashboard} syncing={syncing} onSync={syncNow} />
              </AppTabSection>
            ) : null}
            {activeTab !== "capture" && error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          </div>
        </section>
        <BottomNavigation activeTab={activeTab} onNavigate={navigateTo} />
      </div>
    </main>
  );
}

function AppHeader({ activeTab, onNavigate }: { activeTab: AppTab; onNavigate: (tab: AppTab) => void }) {
  return (
    <header className="flex items-center justify-between gap-3 px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))]">
      <button type="button" onClick={() => onNavigate("more")} className="app-icon-button" aria-label="打开更多">
        <Menu size={22} />
      </button>
      <button type="button" onClick={() => onNavigate("home")} className="flex-1 text-left" aria-label="返回首页">
        <p className="text-2xl font-black text-fuchsia-600">TRACKER</p>
        <p className="text-[11px] font-medium text-slate-400">Food Deficit Studio</p>
      </button>
      <button type="button" onClick={() => onNavigate(activeTab === "more" ? "home" : "more")} className="app-icon-button" aria-label="数据设置">
        <Settings size={20} />
      </button>
    </header>
  );
}

function BottomNavigation({ activeTab, onNavigate }: { activeTab: AppTab; onNavigate: (tab: AppTab) => void }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto grid w-full max-w-[480px] grid-cols-5 border-t border-fuchsia-50/90 bg-white/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.65rem)] pt-3 shadow-[0_-12px_34px_rgba(124,76,101,0.10)] backdrop-blur-xl" aria-label="应用导航">
      <BottomNavItem icon={<Home size={21} strokeWidth={1.8} />} label="首页" active={activeTab === "home"} onClick={() => onNavigate("home")} />
      <BottomNavItem icon={<Star size={21} strokeWidth={1.8} />} label="常用" active={activeTab === "quick"} onClick={() => onNavigate("quick")} />
      <BottomNavItem icon={<Plus size={29} strokeWidth={1.8} />} label="记一餐" active={activeTab === "capture"} primary onClick={() => onNavigate("capture")} />
      <BottomNavItem icon={<BarChart3 size={21} strokeWidth={1.8} />} label="趋势" active={activeTab === "trends"} onClick={() => onNavigate("trends")} />
      <BottomNavItem icon={<MoreHorizontal size={23} strokeWidth={1.8} />} label="更多" active={activeTab === "more"} onClick={() => onNavigate("more")} />
    </nav>
  );
}

function BottomNavItem({ icon, label, active, primary, onClick }: { icon: React.ReactNode; label: string; active?: boolean; primary?: boolean; onClick: () => void }) {
  if (primary) {
    return (
      <button type="button" onClick={onClick} className="group relative flex min-h-12 min-w-0 items-end justify-center outline-none" aria-label={label}>
        <span className={`absolute -top-9 flex h-16 w-16 items-center justify-center rounded-full text-white ring-[7px] ring-white/95 transition duration-200 group-active:scale-95 group-focus-visible:ring-[9px] group-focus-visible:ring-fuchsia-200/80 ${active ? "scale-[1.04] bg-fuchsia-700 shadow-[0_14px_26px_rgba(144,77,164,0.28)]" : "bg-fuchsia-600 shadow-[0_12px_24px_rgba(168,95,188,0.22)] hover:bg-fuchsia-700"}`}>
          {icon}
        </span>
        <span className="sr-only">{label}</span>
      </button>
    );
  }

  return (
    <button type="button" onClick={onClick} className={`group flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium outline-none transition-colors duration-200 focus-visible:text-fuchsia-600 ${active ? "font-semibold text-fuchsia-600" : "text-slate-400 hover:text-slate-600"}`}>
      <span className={`transition-transform duration-200 group-active:scale-90 ${active ? "scale-110" : "scale-100"}`}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function AppTabSection({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="px-1">
        <p className="text-xs font-semibold text-fuchsia-600">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">{title}</h1>
        <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
      </div>
      {children}
    </div>
  );
}

function HomeDashboard({
  dashboard,
  dateKey,
  presets,
  addingId,
  weightInput,
  weightSaving,
  savingPresetId,
  onDate,
  onUsePreset,
  onWeight,
  onSaveWeight,
  onSavePreset,
  onNavigate
}: {
  dashboard: Dashboard | null;
  dateKey: string;
  presets: MealPreset[];
  addingId: string | null;
  weightInput: string;
  weightSaving: boolean;
  savingPresetId: string | null;
  onDate: (date: string) => void;
  onUsePreset: (preset: MealPreset, items: Array<{ id: string; grams: number | null }>) => void;
  onWeight: (value: string) => void;
  onSaveWeight: () => void;
  onSavePreset: (meal: MealEntry) => void;
  onNavigate: (tab: AppTab) => void;
}) {
  return (
    <>
      <StatusStrip dateKey={dateKey} onDate={onDate} />
      <MissionCard dashboard={dashboard} />
      <WeightInputCard dateKey={dateKey} value={weightInput} saving={weightSaving} onChange={onWeight} onSave={onSaveWeight} />
      <HomeQuickMeals presets={presets} addingId={addingId} onUse={onUsePreset} onViewAll={() => onNavigate("quick")} />
      <TodayMeals meals={dashboard?.today.meals || []} syncedAt={dashboard?.today.syncedAt || null} savingId={savingPresetId} onSavePreset={onSavePreset} />
      <WeeklyPreviewCard dashboard={dashboard} onOpen={() => onNavigate("trends")} />
    </>
  );
}

function StatusStrip({
  dateKey,
  onDate
}: {
  dateKey: string;
  onDate: (date: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const weekDays = useMemo(() => {
    const selectedDate = new Date(`${dateKey}T00:00:00.000Z`);
    const day = selectedDate.getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    selectedDate.setUTCDate(selectedDate.getUTCDate() + mondayOffset);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(selectedDate);
      date.setUTCDate(selectedDate.getUTCDate() + index);
      return {
        key: date.toISOString().slice(0, 10),
        number: String(date.getUTCDate()).padStart(2, "0"),
        weekday: ["一", "二", "三", "四", "五", "六", "日"][index]
      };
    });
  }, [dateKey]);

  function openDatePicker() {
    if (typeof inputRef.current?.showPicker === "function") {
      inputRef.current.showPicker();
      return;
    }
    inputRef.current?.click();
  }

  return (
    <section className="app-card flex items-center gap-2 bg-white/90 p-2">
      <div className="grid min-w-0 flex-1 grid-cols-7 gap-1">
        {weekDays.map((day) => {
          const active = day.key === dateKey;
          return (
            <button
              type="button"
              key={day.key}
              onClick={() => onDate(day.key)}
              className={`flex min-h-12 min-w-0 flex-col items-center justify-center rounded-lg px-0.5 text-center transition ${active ? "bg-fuchsia-100 text-fuchsia-700 shadow-sm" : "text-slate-400 hover:bg-fuchsia-50 hover:text-fuchsia-600"}`}
              aria-label={`选择 ${day.key}`}
              aria-pressed={active}
            >
              <span className={`text-sm font-bold ${active ? "text-fuchsia-700" : "text-slate-600"}`}>{day.number}</span>
              <span className="mt-0.5 text-[10px]">周{day.weekday}</span>
            </button>
          );
        })}
      </div>
      <input ref={inputRef} type="date" value={dateKey} onChange={(event) => onDate(event.target.value)} className="sr-only" aria-label="选择日期" />
      <button type="button" onClick={openDatePicker} className="app-icon-button shrink-0" aria-label="选择日期">
        <CalendarDays size={18} />
      </button>
    </section>
  );
}

function HomeQuickMeals({
  presets,
  addingId,
  onUse,
  onViewAll
}: {
  presets: MealPreset[];
  addingId: string | null;
  onUse: (preset: MealPreset, items: Array<{ id: string; grams: number | null }>) => void;
  onViewAll: () => void;
}) {
  const [adjusting, setAdjusting] = useState<MealPreset | null>(null);
  const [grams, setGrams] = useState<Record<string, string>>({});

  function presetItems(preset: MealPreset) {
    return preset.items.map((item) => ({ id: item.id, grams: item.defaultGrams }));
  }

  function openAdjustments(preset: MealPreset) {
    setGrams(Object.fromEntries(preset.items.map((item) => [item.id, item.defaultGrams == null ? "" : String(item.defaultGrams)])));
    setAdjusting(preset);
  }

  function adjustedItems(preset: MealPreset) {
    return preset.items.map((item) => {
      const value = grams[item.id];
      return { id: item.id, grams: value ? Number(value) : null };
    });
  }

  return (
    <section className="app-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-fuchsia-600">Quick Meals</p>
          <h2 className="text-lg font-bold">常用餐食</h2>
        </div>
        <button type="button" onClick={onViewAll} className="flex min-h-11 items-center gap-1 text-sm font-semibold text-fuchsia-600">
          管理
          <ChevronRight size={16} />
        </button>
      </div>
      {presets.length ? (
        <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
          {presets.map((preset) => (
            <div key={preset.id} className="w-40 shrink-0 rounded-lg border border-fuchsia-50 bg-white p-2 shadow-sm">
              <button type="button" onClick={() => openAdjustments(preset)} className="w-full text-left">
                <MealThumbnail url={preset.imageUrl} label={preset.name} compact />
                <p className="mt-2 truncate text-sm font-bold text-slate-950">{preset.name}</p>
                <p className="mt-1 text-xs text-slate-400">{preset.baseKcal} kcal</p>
              </button>
              <button type="button" onClick={() => onUse(preset, presetItems(preset))} disabled={addingId === preset.id} className="mt-2 flex min-h-11 w-full items-center justify-center gap-1 rounded-lg bg-fuchsia-600 px-2 text-xs font-bold text-white disabled:opacity-60">
                <Plus size={15} />
                {addingId === preset.id ? "计入中" : "直接计入"}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <button type="button" onClick={onViewAll} className="flex min-h-20 w-full items-center justify-center rounded-lg border border-dashed border-fuchsia-200 bg-fuchsia-50/50 px-4 text-sm font-semibold text-fuchsia-700">
          添加第一个常用餐食
        </button>
      )}
      {adjusting ? (
        <BottomSheet title="调整本次克数" onClose={() => setAdjusting(null)}>
          <div className="space-y-3">
            <p className="text-sm text-slate-500">{adjusting.name} · 仅影响本次计入</p>
            {adjusting.items.map((item) => (
              <label key={item.id} className="block rounded-lg border border-slate-100 bg-slate-50 p-3">
                <span className="mb-2 block text-sm font-semibold text-slate-800">{item.name}</span>
                <GramsSelect value={grams[item.id] || ""} onChange={(value) => setGrams((current) => ({ ...current, [item.id]: value }))} label={`${item.name} 本次克数`} />
              </label>
            ))}
            <button type="button" onClick={() => { onUse(adjusting, adjustedItems(adjusting)); setAdjusting(null); }} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-fuchsia-600 px-4 font-bold text-white">
              <Plus size={18} />
              确认计入
            </button>
          </div>
        </BottomSheet>
      ) : null}
    </section>
  );
}

function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <button type="button" onClick={onClose} className="fixed inset-0 z-50 bg-slate-950/30" aria-label="关闭弹层" />
      <section className="fixed inset-x-0 bottom-0 z-[60] mx-auto max-h-[82vh] w-full max-w-[480px] overflow-y-auto rounded-t-2xl bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold">{title}</h3>
          <button type="button" onClick={onClose} className="app-icon-button" aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </>
  );
}

function WeeklyPreviewCard({ dashboard, onOpen }: { dashboard: Dashboard | null; onOpen: () => void }) {
  return (
    <section className="app-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-fuchsia-600">Overview</p>
          <h2 className="text-lg font-bold">本周趋势</h2>
        </div>
        <button type="button" onClick={onOpen} className="flex min-h-11 items-center gap-1 text-sm font-semibold text-fuchsia-600">
          查看详情
          <ChevronRight size={16} />
        </button>
      </div>
      <ComboTrendChart days={dashboard?.days || []} compact />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <SmallStat label="累计缺口" value={kcalText(dashboard?.weekDeficitKcal)} compact />
        <SmallStat label="预计下降" value={`${dashboard?.predictedWeightLossJin.toFixed(2) || "0.00"} 斤`} compact />
      </div>
    </section>
  );
}

function MorePage({ dashboard, syncing, onSync }: { dashboard: Dashboard | null; syncing: boolean; onSync: () => void }) {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/connections/status")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: ConnectionStatus | null) => {
        if (!cancelled && data) setStatus(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      <section className="app-card p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-fuchsia-50 text-fuchsia-600"><RefreshCw size={20} className={syncing ? "animate-spin" : ""} /></div>
          <div className="min-w-0 flex-1">
            <p className="font-bold">同步状态</p>
            <p className="truncate text-xs text-slate-400">{dashboard?.today.syncedAt ? new Date(dashboard.today.syncedAt).toLocaleString() : "尚未同步"}</p>
          </div>
        </div>
        <button type="button" onClick={onSync} disabled={syncing} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-fuchsia-600 px-4 font-bold text-white disabled:opacity-60">
          <RefreshCw size={18} className={syncing ? "animate-spin" : ""} />
          {syncing ? "正在同步" : "立即同步"}
        </button>
      </section>
      <section className="app-card p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"><Database size={20} /></div>
          <div>
            <p className="font-bold">数据源</p>
            <p className="text-xs text-slate-400">消耗与训练参考连接</p>
          </div>
        </div>
        <div className="space-y-3 text-sm">
          <ConnectionRow label="Oura 总消耗" connected={status?.oura.connected} />
          <ConnectionRow label="Intervals.icu 参考" connected={status?.intervals.connected} />
        </div>
        <Link href="/settings" className="mt-4 flex min-h-12 w-full items-center justify-between rounded-lg border border-fuchsia-100 bg-fuchsia-50 px-4 text-sm font-bold text-fuchsia-700">
          数据源详细设置
          <ChevronRight size={17} />
        </Link>
      </section>
    </div>
  );
}

function ConnectionRow({ label, connected }: { label: string; connected: boolean | undefined }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-3">
      <span className="font-medium text-slate-700">{label}</span>
      <span className={`text-xs font-bold ${connected ? "text-emerald-600" : "text-slate-400"}`}>{connected ? "已连接" : connected === false ? "未连接" : "读取中"}</span>
    </div>
  );
}

function MissionCard({ dashboard }: { dashboard: Dashboard | null }) {
  const today = dashboard?.today;
  const intake = today?.intakeKcal ?? 0;
  const totalBurn = today?.totalBurnKcal ?? 0;
  const deficit = today?.deficitKcal;
  const burnProgress = totalBurn > 0 ? Math.min(100, Math.round((totalBurn / 4000) * 100)) : 0;
  const intakeProgress = totalBurn > 0 ? Math.min(100, Math.round((intake / totalBurn) * 100)) : 0;
  const deficitProgress = deficit == null || totalBurn <= 0 ? 0 : Math.min(100, Math.round((Math.max(0, deficit) / totalBurn) * 100));

  return (
    <section className="app-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-fuchsia-600">Today Mission</p>
          <h2 className="mt-1 text-xl font-bold text-slate-950">今日热量任务</h2>
        </div>
        <span className="rounded-lg bg-fuchsia-50 px-2.5 py-1 text-xs font-bold text-fuchsia-700">{today?.mealCount ? "餐食已录入" : "等待餐食"}</span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
        <div className="flex min-w-0 flex-col items-center justify-center">
          <div className="relative aspect-square w-full max-w-48">
            <svg key={`${burnProgress}-${intakeProgress}-${deficitProgress}`} viewBox="0 0 220 220" className="h-full w-full -rotate-90">
              <circle cx="110" cy="110" r="92" fill="none" stroke="#ebe9ff" strokeWidth="8" />
              <circle className="mission-ring-progress" pathLength="100" cx="110" cy="110" r="92" fill="none" stroke="#7c6ee6" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${burnProgress} 100`} />
              <circle cx="110" cy="110" r="72" fill="none" stroke="#f4e7f8" strokeWidth="8" />
              <circle className="mission-ring-progress mission-ring-progress-delay-1" pathLength="100" cx="110" cy="110" r="72" fill="none" stroke="#b75ad6" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${intakeProgress} 100`} />
              <circle cx="110" cy="110" r="52" fill="none" stroke="#fde9ed" strokeWidth="8" />
              <circle className="mission-ring-progress mission-ring-progress-delay-2" pathLength="100" cx="110" cy="110" r="52" fill="none" stroke="#ee7f93" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${deficitProgress} 100`} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <Flame size={20} className="mb-0.5 text-slate-950" />
              <p className="max-w-28 whitespace-nowrap text-base font-bold text-slate-950">{Math.round(intake)} / {Math.round(totalBurn || 0)}</p>
              <p className="mt-0.5 text-[10px] leading-4 text-slate-500">摄入 / 总消耗</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <MissionMetric dot="bg-[#b75ad6]" label="摄入热量" value={kcalText(today?.intakeKcal)} />
          <MissionMetric dot="bg-[#7c6ee6]" label="Oura 总消耗" value={totalBurnText(today)} />
          <MissionMetric dot="bg-[#ee7f93]" label="今日缺口" value={deficitText(today)} />
          <MissionMetric dot="bg-emerald-500" label="本周预计下降" value={`${dashboard?.predictedWeightLossJin.toFixed(2) || "0.00"} 斤`} />
        </div>
      </div>
    </section>
  );
}

function MissionMetric({ dot, label, value }: { dot: string; label: string; value: string }) {
  return (
    <div className="min-h-16 rounded-lg border border-white/90 bg-white/82 p-2 shadow-sm">
      <p className="flex items-start gap-1 text-[9px] leading-3.5 text-slate-500"><span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />{label}</p>
      <p className="mt-1.5 whitespace-nowrap text-xs font-bold leading-4 text-slate-950">{value}</p>
    </div>
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
  const canAnalyze = Boolean(selectedFile || mealContext.trim());

  return (
    <div className="panel p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-fuchsia-600">Meal Vision</p>
          <h3 className="text-lg font-semibold">上传图片或文字描述</h3>
        </div>
        <Camera className="text-slate-400" size={22} />
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
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
        <span className="text-sm text-fuchsia-500">可选图，也可直接填写文字描述</span>
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
          placeholder="例如：红薯 200g，通过空气炸锅烤制；米饭约 180g；麦当劳板烧鸡腿堡一份；海底捞番茄锅里捞出的牛肉约 120g"
        />
      </label>
      <p className="mt-2 text-xs leading-5 text-slate-500">支持图片加说明，也支持只写文字描述。补充重量、做法或店铺可提高准确度；分析后会先生成草稿，确认 kcal 才计入统计。</p>
      <button
        onClick={onAnalyze}
        disabled={loading || !canAnalyze}
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
    <div className="app-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-fuchsia-600">Body Weight</p>
          <h3 className="mt-1 text-lg font-bold text-slate-950">记录今日体重</h3>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-fuchsia-50 text-fuchsia-600">
          <Weight size={19} />
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-400">{dateKey} · 每日记录更容易看清长期趋势</p>
      <div className="mt-3 flex items-center justify-end gap-2">
        <div className="relative w-36">
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            inputMode="decimal"
            placeholder="例如 76.4"
            className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 pr-9 text-base font-semibold outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-100"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">kg</span>
        </div>
        <button
          onClick={onSave}
          disabled={saving}
          aria-label={saving ? "保存中" : "保存体重"}
          title={saving ? "保存中" : "保存体重"}
          className="flex h-11 w-11 items-center justify-center rounded-lg bg-fuchsia-100 text-fuchsia-700 transition-colors hover:bg-fuchsia-200 disabled:opacity-60"
        >
          <Save size={17} />
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
        <div className="flex flex-wrap items-center justify-end gap-2">
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
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-fuchsia-300" />摄入热量</span>
          <span className="inline-flex items-center gap-1"><span className="h-0.5 w-4 bg-fuchsia-700" />每日缺口</span>
        </div>
      </div>
      <ComboTrendChart days={days} />
      <div className="mt-4 grid grid-cols-2 gap-3">
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
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-fuchsia-300" />每周缺口</span>
          <span className="inline-flex items-center gap-1"><span className="h-0.5 w-4 bg-fuchsia-700" />周均体重</span>
        </div>
      </div>
      <FourWeekChart weeks={weeks} />
      <div className="mt-4 grid grid-cols-3 gap-2">
        <SmallStat label="4 周累计缺口" value={kcalText(dashboard?.fourWeekDeficitKcal)} compact />
        <SmallStat label="4 周预计下降" value={`${dashboard?.predictedFourWeekWeightLossJin.toFixed(2) || "0.00"} 斤`} compact />
        <SmallStat label="本周平均体重" value={latestWeeklyAverageWeightText(weeks)} compact />
      </div>
    </div>
  );
}

function QuickPresetsCard({
  presets,
  addingId,
  onUse,
  onDelete,
  onReload,
  onError
}: {
  presets: MealPreset[];
  addingId: string | null;
  onUse: (preset: MealPreset, items: Array<{ id: string; grams: number | null }>) => void;
  onDelete: (preset: MealPreset) => void;
  onReload: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [grams, setGrams] = useState<Record<string, string>>({});
  const [editableItems, setEditableItems] = useState<Record<string, MealPresetItem[]>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createDescription, setCreateDescription] = useState("");
  const [createFile, setCreateFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [newPreset, setNewPreset] = useState<MealPreset | null>(null);
  const [nutritionReview, setNutritionReview] = useState<{ presetId: string; itemIndex: number; source: NutritionSourceDraft } | null>(null);
  const [nutritionUploading, setNutritionUploading] = useState("");
  const [nutritionSources, setNutritionSources] = useState<NutritionSource[]>([]);
  const [libraryCreating, setLibraryCreating] = useState(false);
  const [libraryDraft, setLibraryDraft] = useState<NutritionSourceDraft>(emptyNutritionSource());
  const [libraryAnalyzing, setLibraryAnalyzing] = useState(false);
  const [librarySaving, setLibrarySaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/nutrition-sources")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { sources: NutritionSource[] } | null) => {
        if (!cancelled && data) setNutritionSources(data.sources);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  function togglePreset(preset: MealPreset) {
    const nextId = expandedId === preset.id ? null : preset.id;
    setExpandedId(nextId);
    if (nextId && !editableItems[preset.id]) {
      setEditableItems((current) => ({ ...current, [preset.id]: preset.items.map((item) => ({ ...item })) }));
    }
  }

  function currentGrams(item: MealPresetItem) {
    return grams[item.id] ?? (item.defaultGrams == null ? "" : String(item.defaultGrams));
  }

  function setCurrentGrams(itemId: string, value: string) {
    setGrams((current) => ({ ...current, [itemId]: value }));
  }

  function configuredItems(preset: MealPreset) {
    return preset.items.map((item) => {
      const value = currentGrams(item);
      return { id: item.id, grams: value ? Number(value) : null };
    });
  }

  function updateEditableItem(presetId: string, index: number, patch: Partial<MealPresetItem>) {
    setEditableItems((current) => ({
      ...current,
      [presetId]: (current[presetId] || []).map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
    }));
  }

  function bindNutritionSource(item: MealPresetItem, source: NutritionSource, gramsValue = item.defaultGrams == null ? "" : String(item.defaultGrams)): Partial<MealPresetItem> {
    const itemGrams = gramsValue ? Number(gramsValue) : null;
    return {
      name: source.name,
      kcal: itemGrams == null ? item.kcal : Math.round((source.kcalPer100g * itemGrams) / 100),
      calculationSource: "nutrition_label",
      nutritionSourceId: source.id,
      nutritionSource: source
    };
  }

  async function savePresetItems(preset: MealPreset) {
    const items = editableItems[preset.id] || preset.items;
    if (!items.length) return onError("模板至少需要一种食物");
    setSavingId(preset.id);
    const response = await fetch(`/api/meal-presets/${preset.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: preset.name,
        description: preset.description,
        items: items.map((item) => {
          const gramsValue = currentGrams(item);
          const storedGrams = gramsValue ? Number(gramsValue) : item.defaultGrams;
          return {
            name: item.name,
            portion: item.portion,
            defaultGrams: storedGrams,
            kcal: item.nutritionSource && storedGrams != null ? Math.round((item.nutritionSource.kcalPer100g * storedGrams) / 100) : item.kcal,
            confidence: item.confidence,
            calculationSource: item.calculationSource,
            nutritionSourceId: item.nutritionSourceId
          };
        })
      })
    });
    const data = await response.json().catch(() => ({}));
    setSavingId(null);
    if (!response.ok) return onError(data.error || "模板保存失败");
    setEditableItems((current) => ({ ...current, [preset.id]: data.preset.items }));
    setGrams((current) => {
      const next = { ...current };
      data.preset.items.forEach((item: MealPresetItem) => {
        if (item.defaultGrams != null) next[item.id] = String(item.defaultGrams);
      });
      return next;
    });
    await onReload();
  }

  async function analyzeNutrition(file: File, preset: MealPreset, itemIndex: number) {
    const item = (editableItems[preset.id] || preset.items)[itemIndex];
    const key = `${preset.id}-${itemIndex}`;
    setNutritionUploading(key);
    const form = new FormData();
    form.append("image", file);
    form.append("name", item.name);
    const response = await fetch("/api/nutrition-sources/analyze", { method: "POST", body: form });
    const data = await response.json().catch(() => ({}));
    setNutritionUploading("");
    if (!response.ok) return onError(data.error || "成分表识别失败");
    setNutritionReview({ presetId: preset.id, itemIndex, source: data.source });
  }

  async function saveNutritionSource() {
    if (!nutritionReview) return;
    const response = await fetch("/api/nutrition-sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nutritionReview.source)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return onError(data.error || "营养信息保存失败");
    const preset = presets.find((item) => item.id === nutritionReview.presetId);
    if (!preset) return onError("对应模板不存在");
    const updatedItems = (editableItems[preset.id] || preset.items).map((item, itemIndex) => itemIndex === nutritionReview.itemIndex ? {
      ...item,
      nutritionSourceId: data.source.id,
      nutritionSource: data.source,
      calculationSource: "nutrition_label"
    } : item);
    setEditableItems((current) => ({ ...current, [preset.id]: updatedItems }));
    const bindResponse = await fetch(`/api/meal-presets/${preset.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: preset.name,
        description: preset.description,
        items: updatedItems.map(({ name, portion, defaultGrams, kcal, confidence, calculationSource, nutritionSourceId }) => ({
          name,
          portion,
          defaultGrams,
          kcal,
          confidence,
          calculationSource,
          nutritionSourceId
        }))
      })
    });
    if (!bindResponse.ok) return onError("成分表已保存，但绑定模板失败");
    const boundData = await bindResponse.json();
    setEditableItems((current) => ({ ...current, [preset.id]: boundData.preset.items }));
    setNutritionSources((current) => [data.source, ...current]);
    setNutritionReview(null);
    await onReload();
  }

  async function analyzeLibraryNutrition(file: File) {
    setLibraryAnalyzing(true);
    const form = new FormData();
    form.append("image", file);
    form.append("name", libraryDraft.name);
    const response = await fetch("/api/nutrition-sources/analyze", { method: "POST", body: form });
    const data = await response.json().catch(() => ({}));
    setLibraryAnalyzing(false);
    if (!response.ok) return onError(data.error || "成分表识别失败");
    setLibraryDraft(data.source);
  }

  async function saveLibraryNutrition() {
    setLibrarySaving(true);
    const response = await fetch("/api/nutrition-sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(libraryDraft)
    });
    const data = await response.json().catch(() => ({}));
    setLibrarySaving(false);
    if (!response.ok) return onError(data.error || "食物保存失败，请检查名称和每 100g 热量");
    setNutritionSources((current) => [data.source, ...current]);
    setLibraryDraft(emptyNutritionSource());
    setLibraryCreating(false);
  }

  async function analyzeNewPreset() {
    if (!createFile && !createDescription.trim()) return onError("请上传套餐图片或填写套餐描述");
    setAnalyzing(true);
    const form = new FormData();
    if (createFile) form.append("image", createFile);
    form.append("description", createDescription.trim());
    const response = await fetch("/api/meal-presets/analyze", { method: "POST", body: form });
    const data = await response.json().catch(() => ({}));
    setAnalyzing(false);
    if (!response.ok) return onError(data.error || "套餐拆解失败");
    setNewPreset({
      ...data.preset,
      id: "new",
      usageCount: 0,
      items: data.preset.items.map((item: MealPresetItem, index: number) => ({ ...item, id: `new-${index}`, nutritionSource: null }))
    });
  }

  async function saveNewPreset() {
    if (!newPreset) return;
    setSavingId("new");
    const response = await fetch("/api/meal-presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newPreset.name,
        imageUrl: newPreset.imageUrl,
        description: newPreset.description,
        baseKcal: newPreset.items.reduce((total, item) => total + item.kcal, 0),
        items: newPreset.items.map(({ name, portion, defaultGrams, kcal, confidence, calculationSource, nutritionSourceId }) => ({
          name,
          portion,
          defaultGrams,
          kcal,
          confidence,
          calculationSource,
          nutritionSourceId
        }))
      })
    });
    const data = await response.json().catch(() => ({}));
    setSavingId(null);
    if (!response.ok) return onError(data.error || "新建模板失败");
    setCreating(false);
    setCreateDescription("");
    setCreateFile(null);
    setNewPreset(null);
    await onReload();
  }

  const expandedPreset = presets.find((preset) => preset.id === expandedId) || null;
  const expandedItems = expandedPreset ? editableItems[expandedPreset.id] || expandedPreset.items : [];

  return (
    <section className="panel p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-fuchsia-600">Quick Meals</p>
          <h3 className="text-lg font-semibold">常用餐食</h3>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="rounded-full bg-fuchsia-50 px-2.5 py-1 text-xs font-medium text-fuchsia-700">{presets.length} 个模板</span>
          <button onClick={() => setLibraryCreating((value) => !value)} className="flex min-h-11 items-center gap-1.5 rounded-lg border border-fuchsia-100 bg-white px-3 text-xs font-semibold text-fuchsia-700">
            {libraryCreating ? <X size={15} /> : <Plus size={15} />}
            {libraryCreating ? "取消添加" : "添加食物"}
          </button>
          <button onClick={() => setCreating((value) => !value)} className="flex min-h-11 items-center gap-1.5 rounded-lg bg-fuchsia-600 px-3 text-xs font-semibold text-white">
            {creating ? <X size={15} /> : <Plus size={15} />}
            {creating ? "取消" : "新建模板"}
          </button>
        </div>
      </div>
      {libraryCreating ? (
        <BottomSheet title="添加食物" onClose={() => setLibraryCreating(false)}>
          <NutritionLibraryEditor
            source={libraryDraft}
            analyzing={libraryAnalyzing}
            saving={librarySaving}
            onChange={setLibraryDraft}
            onAnalyze={analyzeLibraryNutrition}
            onSave={saveLibraryNutrition}
          />
        </BottomSheet>
      ) : null}
      {creating ? (
        <BottomSheet title="新建常用餐食模板" onClose={() => setCreating(false)}>
          <div className="rounded-lg border border-fuchsia-100 bg-fuchsia-50/50 p-3">
            <textarea value={createDescription} onChange={(event) => setCreateDescription(event.target.value)} placeholder="例如：早餐，燕麦 50g、每日坚果一包、无糖酸奶 200g" className="min-h-24 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm outline-none focus:border-fuchsia-400" />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600">
                <Upload size={15} />
                {createFile ? createFile.name : "可选套餐图片"}
                <input type="file" accept="image/*" className="hidden" onChange={(event) => setCreateFile(event.target.files?.[0] || null)} />
              </label>
              <button onClick={analyzeNewPreset} disabled={analyzing} className="flex min-h-11 items-center gap-1.5 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white disabled:opacity-60">
                <Send size={15} />
                {analyzing ? "拆解中" : "AI 自动拆解"}
              </button>
            </div>
            {newPreset ? (
              <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                <input value={newPreset.name} onChange={(event) => setNewPreset({ ...newPreset, name: event.target.value })} className="h-11 w-full rounded-lg border border-slate-200 px-2 text-sm font-semibold outline-none focus:border-fuchsia-400" />
                <div className="mt-2 space-y-2">
                  {newPreset.items.map((item, index) => (
                    <PresetItemEditor key={item.id} item={item} nutritionSources={nutritionSources} showGrams onChange={(patch) => setNewPreset({ ...newPreset, items: newPreset.items.map((current, itemIndex) => (itemIndex === index ? { ...current, ...patch } : current)) })} onSelectSource={(source) => setNewPreset({ ...newPreset, items: newPreset.items.map((current, itemIndex) => (itemIndex === index ? { ...current, ...bindNutritionSource(current, source) } : current)) })} onDelete={() => setNewPreset({ ...newPreset, items: newPreset.items.filter((_, itemIndex) => itemIndex !== index) })} />
                  ))}
                </div>
                <button onClick={saveNewPreset} disabled={savingId === "new"} className="mt-3 flex min-h-11 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white disabled:opacity-60">
                  <Save size={15} />
                  {savingId === "new" ? "保存中" : "保存模板"}
                </button>
              </div>
            ) : null}
          </div>
        </BottomSheet>
      ) : null}
      {presets.length ? (
        <div className="grid gap-3">
          {presets.map((preset) => {
            const expanded = expandedId === preset.id;
            return (
              <div key={preset.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <div className="flex gap-3">
                  <MealThumbnail url={preset.imageUrl} label={preset.name} compact />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-950">{preset.name}</p>
                        <p className="mt-1 text-sm text-slate-500">{preset.baseKcal} kcal</p>
                      </div>
                      <button onClick={() => onDelete(preset)} className="text-slate-400 transition hover:text-red-600" aria-label={`删除 ${preset.name}`}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-400">{preset.items.map((item) => item.portion || item.name).join(" · ") || "已确认餐食"}</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => togglePreset(preset)} className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600">
                    <ChevronDown size={16} className={expanded ? "rotate-180" : ""} />
                    {expanded ? "正在调整" : "调整克数"}
                  </button>
                  <button
                    onClick={() => onUse(preset, configuredItems(preset))}
                    disabled={addingId === preset.id}
                    className="flex min-h-11 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    <Plus size={16} />
                    {addingId === preset.id ? "计入中" : "计入"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
          还没有常用餐食。确认餐食后，在今日记录中点击“存为常用”。
        </div>
      )}
      {expandedPreset ? (
        <BottomSheet title={`调整 ${expandedPreset.name}`} onClose={() => {
          setExpandedId(null);
          setNutritionReview(null);
        }}>
          <div className="space-y-3">
            <p className="text-xs leading-5 text-slate-500">从个人营养库选择食物，或使用自定义名称。填写本次计入克数后，系统会按每 100g 热量精确换算。</p>
            {expandedItems.map((item, index) => (
              <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <PresetItemEditor item={item} nutritionSources={nutritionSources} onChange={(patch) => updateEditableItem(expandedPreset.id, index, patch)} onSelectSource={(source) => updateEditableItem(expandedPreset.id, index, bindNutritionSource(item, source, currentGrams(item)))} onDelete={() => setEditableItems((current) => ({ ...current, [expandedPreset.id]: expandedItems.filter((_, itemIndex) => itemIndex !== index) }))} />
                <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3">
                  <label className="block min-w-0">
                    <span className="mb-1 block text-xs font-medium text-slate-500">本次计入克数</span>
                    <GramsSelect value={currentGrams(item)} onChange={(value) => setCurrentGrams(item.id, value)} label={`${item.name} 本次克数`} />
                  </label>
                  <label className="flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600">
                    <FileText size={14} />
                    {nutritionUploading === `${expandedPreset.id}-${index}` ? "识别中" : item.nutritionSource ? "替换成分表" : "上传成分表"}
                    <input type="file" accept="image/*" className="hidden" disabled={Boolean(nutritionUploading)} onChange={(event) => event.target.files?.[0] && analyzeNutrition(event.target.files[0], expandedPreset, index)} />
                  </label>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {item.nutritionSource ? `营养库：${item.nutritionSource.name} · ${item.nutritionSource.kcalPer100g} kcal/100g` : "未绑定成分表，修改克数时由 AI 复核"}
                </p>
              </div>
            ))}
            {nutritionReview ? (
              <NutritionReviewCard review={nutritionReview} onChange={(source) => setNutritionReview({ ...nutritionReview, source })} onCancel={() => setNutritionReview(null)} onSave={saveNutritionSource} />
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setEditableItems((current) => ({ ...current, [expandedPreset.id]: [...expandedItems, emptyPresetItem(expandedPreset.id)] }))} className="flex min-h-11 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600">
                <Plus size={14} /> 添加食物
              </button>
              <button onClick={() => savePresetItems(expandedPreset)} disabled={savingId === expandedPreset.id} className="flex min-h-11 items-center justify-center gap-1 rounded-lg border border-fuchsia-100 bg-white px-2 text-xs font-semibold text-fuchsia-700 disabled:opacity-60">
                <Save size={14} /> {savingId === expandedPreset.id ? "保存中" : "保存模板"}
              </button>
            </div>
            <button onClick={() => {
              onUse(expandedPreset, configuredItems(expandedPreset));
              setExpandedId(null);
            }} disabled={addingId === expandedPreset.id} className="flex min-h-12 w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white disabled:opacity-60">
              <Plus size={16} />
              {addingId === expandedPreset.id ? "计入中" : "确认计入"}
            </button>
          </div>
        </BottomSheet>
      ) : null}
    </section>
  );
}

const GRAMS_OPTIONS = ["", "25", "50", "75", "100", "125", "150", "200", "250", "300", "custom"];

function GramsSelect({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const [custom, setCustom] = useState(!GRAMS_OPTIONS.includes(value) && Boolean(value));
  return (
    <div className={`grid min-w-0 gap-2 ${custom ? "grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : "grid-cols-1"}`}>
      <select value={custom ? "custom" : value} onChange={(event) => event.target.value === "custom" ? setCustom(true) : (setCustom(false), onChange(event.target.value))} className="h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold outline-none" aria-label={label}>
        <option value="">克数未填</option>
        {GRAMS_OPTIONS.slice(1, -1).map((grams) => <option key={grams} value={grams}>{grams}g</option>)}
        <option value="custom">自定义</option>
      </select>
      {custom ? <input value={value} onChange={(event) => onChange(event.target.value)} inputMode="decimal" placeholder="克数" className="h-11 min-w-0 rounded-lg border border-slate-200 px-2 text-xs outline-none" aria-label={`${label}自定义`} /> : null}
    </div>
  );
}

function PresetItemEditor({
  item,
  nutritionSources,
  showGrams,
  onChange,
  onSelectSource,
  onDelete
}: {
  item: MealPresetItem;
  nutritionSources: NutritionSource[];
  showGrams?: boolean;
  onChange: (patch: Partial<MealPresetItem>) => void;
  onSelectSource: (source: NutritionSource) => void;
  onDelete: () => void;
}) {
  return (
    <div className={`grid gap-3 ${showGrams ? "sm:grid-cols-[minmax(0,1fr)_minmax(0,180px)_40px]" : "sm:grid-cols-[minmax(0,1fr)_40px]"} sm:items-end`}>
      <label className="block min-w-0">
        <span className="mb-1 block text-xs font-medium text-slate-500">选择食物</span>
        <select
          value={item.nutritionSourceId || "custom"}
          onChange={(event) => {
            const source = nutritionSources.find((candidate) => candidate.id === event.target.value);
            if (source) {
              onSelectSource(source);
            } else {
              onChange({ nutritionSourceId: null, nutritionSource: null, calculationSource: "ai_estimate" });
            }
          }}
          className="h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold outline-none focus:border-fuchsia-400"
          aria-label={`${item.name} 选择食物`}
        >
          <option value="custom">自定义食物</option>
          {nutritionSources.map((source) => <option key={source.id} value={source.id}>{source.name} · {source.kcalPer100g} kcal/100g</option>)}
        </select>
        {!item.nutritionSourceId ? <input value={item.name} onChange={(event) => onChange({ name: event.target.value })} placeholder="填写自定义食物名称" className="mt-2 h-11 w-full min-w-0 rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-fuchsia-400" aria-label="自定义食物名称" /> : null}
      </label>
      {showGrams ? <label className="block min-w-0">
        <span className="mb-1 block text-xs font-medium text-slate-500">计入克数</span>
        <GramsSelect
          value={item.defaultGrams == null ? "" : String(item.defaultGrams)}
          onChange={(value) => {
            const defaultGrams = value ? Number(value) : null;
            onChange({
              defaultGrams,
              kcal: item.nutritionSource && defaultGrams != null ? Math.round((item.nutritionSource.kcalPer100g * defaultGrams) / 100) : item.kcal
            });
          }}
          label={`${item.name} 计入克数`}
        />
      </label> : null}
      <button onClick={onDelete} className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:border-red-100 hover:bg-red-50 hover:text-red-600" aria-label={`删除 ${item.name}`}><Trash2 size={15} /></button>
    </div>
  );
}

function NutritionLibraryEditor({
  source,
  analyzing,
  saving,
  onChange,
  onAnalyze,
  onSave
}: {
  source: NutritionSourceDraft;
  analyzing: boolean;
  saving: boolean;
  onChange: (source: NutritionSourceDraft) => void;
  onAnalyze: (file: File) => void;
  onSave: () => void;
}) {
  const numberValue = (value: string) => value ? Number(value) : null;
  return (
    <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
      <div>
        <p className="font-semibold text-slate-950">添加食物到个人营养库</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">可手动填写每 100g 热量，也可以上传包装成分表自动识别。保存后即可在模板食物下拉框中复用。</p>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-6">
        <input value={source.name} onChange={(event) => onChange({ ...source, name: event.target.value })} placeholder="食物名称" className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm sm:col-span-2" />
        <input value={source.kcalPer100g || ""} onChange={(event) => onChange({ ...source, kcalPer100g: Number(event.target.value) })} inputMode="decimal" placeholder="kcal / 100g" className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm" />
        <input value={source.proteinPer100g ?? ""} onChange={(event) => onChange({ ...source, proteinPer100g: numberValue(event.target.value) })} inputMode="decimal" placeholder="蛋白质 g" className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm" />
        <input value={source.fatPer100g ?? ""} onChange={(event) => onChange({ ...source, fatPer100g: numberValue(event.target.value) })} inputMode="decimal" placeholder="脂肪 g" className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm" />
        <input value={source.carbsPer100g ?? ""} onChange={(event) => onChange({ ...source, carbsPer100g: numberValue(event.target.value) })} inputMode="decimal" placeholder="碳水 g" className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm" />
      </div>
      <textarea value={source.notes || ""} onChange={(event) => onChange({ ...source, notes: event.target.value })} placeholder="可选备注，例如品牌、口味或烹饪方式" rows={2} className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
      <div className="mt-3 flex flex-wrap gap-2">
        <label className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 text-xs font-semibold text-emerald-700">
          <FileText size={15} />
          {analyzing ? "识别中" : source.imageUrl ? "替换成分表" : "上传成分表"}
          <input type="file" accept="image/*" className="hidden" disabled={analyzing} onChange={(event) => event.target.files?.[0] && onAnalyze(event.target.files[0])} />
        </label>
        <button onClick={onSave} disabled={saving || analyzing} className="flex min-h-11 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white disabled:opacity-60">
          <Save size={15} />
          {saving ? "保存中" : "保存食物"}
        </button>
      </div>
    </div>
  );
}

function NutritionReviewCard({ review, onChange, onCancel, onSave }: { review: { source: NutritionSourceDraft }; onChange: (source: NutritionSourceDraft) => void; onCancel: () => void; onSave: () => void }) {
  const source = review.source;
  const numberValue = (value: string) => value ? Number(value) : null;
  return (
    <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div><p className="font-semibold">确认营养成分表</p><p className="mt-1 text-xs text-slate-500">AI 已换算为每 100g，请核对后保存到个人营养库。</p></div>
        <button onClick={onCancel} className="flex h-11 w-11 items-center justify-center text-slate-400" aria-label="关闭"><X size={17} /></button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-6">
        <input value={source.name} onChange={(event) => onChange({ ...source, name: event.target.value })} className="h-11 rounded-lg border border-slate-200 px-2 text-xs sm:col-span-2" aria-label="食品名称" />
        <input value={source.kcalPer100g} onChange={(event) => onChange({ ...source, kcalPer100g: Number(event.target.value) })} inputMode="decimal" className="h-11 rounded-lg border border-slate-200 px-2 text-xs" aria-label="每100克热量" />
        <input value={source.proteinPer100g ?? ""} onChange={(event) => onChange({ ...source, proteinPer100g: numberValue(event.target.value) })} inputMode="decimal" placeholder="蛋白质 g" className="h-11 rounded-lg border border-slate-200 px-2 text-xs" />
        <input value={source.fatPer100g ?? ""} onChange={(event) => onChange({ ...source, fatPer100g: numberValue(event.target.value) })} inputMode="decimal" placeholder="脂肪 g" className="h-11 rounded-lg border border-slate-200 px-2 text-xs" />
        <input value={source.carbsPer100g ?? ""} onChange={(event) => onChange({ ...source, carbsPer100g: numberValue(event.target.value) })} inputMode="decimal" placeholder="碳水 g" className="h-11 rounded-lg border border-slate-200 px-2 text-xs" />
      </div>
      <p className="mt-2 text-xs text-slate-500">热量：{source.kcalPer100g || 0} kcal / 100g{source.notes ? ` · ${source.notes}` : ""}</p>
      <button onClick={onSave} className="mt-3 flex min-h-11 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white"><Save size={14} />保存并绑定</button>
    </div>
  );
}

function emptyPresetItem(presetId: string): MealPresetItem {
  return { id: `${presetId}-${Date.now()}`, name: "新食物", portion: null, defaultGrams: null, kcal: 0, confidence: null, calculationSource: null, nutritionSourceId: null, nutritionSource: null };
}

function emptyNutritionSource(): NutritionSourceDraft {
  return { name: "", imageUrl: null, kcalPer100g: 0, proteinPer100g: null, fatPer100g: null, carbsPer100g: null, confidence: null, notes: null };
}

function TodayMeals({
  meals,
  syncedAt,
  savingId,
  onSavePreset
}: {
  meals: MealEntry[];
  syncedAt: string | null;
  savingId: string | null;
  onSavePreset: (meal: MealEntry) => void;
}) {
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
                <button
                  onClick={() => onSavePreset(meal)}
                  disabled={savingId === meal.id}
                  className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg border border-fuchsia-100 bg-white px-2.5 text-xs font-semibold text-fuchsia-700 transition hover:bg-fuchsia-50 disabled:opacity-60"
                >
                  <BookmarkPlus size={14} />
                  {savingId === meal.id ? "保存中" : "存为常用"}
                </button>
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
              <rect x={x(index) - barWidth / 2} y={top} width={barWidth} height={barHeight} rx="5" fill="#c595cf" opacity={value === 0 ? 0.25 : 0.88} />
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
        {linePoints ? <polyline points={linePoints} fill="none" stroke="#904da4" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /> : null}
        {deficit.map((value, index) =>
          value == null ? null : (
            <g key={`${days[index]?.dateKey}-point`}>
              <circle cx={x(index)} cy={y(value)} r="4.5" fill="#904da4" />
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
        {points ? <polyline points={points} fill="none" stroke="#a85fbc" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /> : null}
        {days.map((day, index) => (
          <g key={day.dateKey} className="group">
            {day.weightKg == null ? <circle cx={x(index)} cy={padding.top + chartH} r="3" fill="#d8b9df" /> : <circle cx={x(index)} cy={y(day.weightKg)} r="5" fill="#a85fbc" />}
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
              <rect x={x(index) - barWidth / 2} y={barY} width={barWidth} height={barHeight} rx="6" fill="#c595cf" opacity={value === 0 ? 0.25 : 0.88} />
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
        {weightPoints ? <polyline points={weightPoints} fill="none" stroke="#904da4" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /> : null}
        {weeks.map((week, index) =>
          week.averageWeightKg == null ? null : (
            <g key={`${week.startDateKey}-weight`}>
              <circle cx={x(index)} cy={yWeight(week.averageWeightKg)} r="4.5" fill="#904da4" />
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

function latestWeeklyAverageWeightText(weeks: WeekSummary[]) {
  const latest = [...weeks].reverse().find((week) => week.averageWeightKg != null);
  return latest?.averageWeightKg == null ? "未录入" : `${latest.averageWeightKg.toFixed(1)} kg`;
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
