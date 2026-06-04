"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  BookmarkPlus,
  Camera,
  Check,
  ChartPie,
  CircleCheckBig,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  CloudCog,
  Database,
  FileText,
  Flame,
  Home,
  Leaf,
  Lightbulb,
  Menu,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Target,
  Trash2,
  Upload,
  Utensils,
  UserRound,
  Weight,
  X
} from "lucide-react";

type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";
type MealPreference = "homemade" | "takeout" | "light" | "sauce";
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
type MealItem = {
  id: string;
  name: string;
  portion: string | null;
  grams: number | null;
  kcal: number;
  confidence: number | null;
  calculationSource: string | null;
  nutritionSourceId: string | null;
  nutritionSource?: NutritionSource | null;
};
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
type AnalysisDay = DashboardDay & {
  meals: MealEntry[];
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
  analysisDays: AnalysisDay[];
  weeks: WeekSummary[];
  weekDeficitKcal: number;
  sevenDayDeficitKcal: number;
  fourWeekDeficitKcal: number;
  predictedWeightLossJin: number;
  predictedFourWeekWeightLossJin: number;
  dailyDeficitTargetKcal: number;
};

type AppTab = "home" | "quick" | "capture" | "trends" | "more";
type TabTransitionDirection = "forward" | "back" | "none";
type AnalysisView = "calories" | "weight" | "meals" | "correlation";
type AnalysisPhase = "idle" | "compressing" | "recognizing";
type QuickStudioView = "presets" | "library" | "ai";
type MealAnalysisTimings = {
  clientCompressionMs: number;
  serverCompressionMs: number;
  blobUploadMs: number;
  openAiMs: number;
  databaseMs: number;
  totalServerMs: number;
};
type AiInsight = {
  summaryTitle: string;
  insights: string[];
  suggestions: string[];
  cautions: string[];
};
type ConnectionStatus = {
  oura: { connected: boolean; scope: string | null; expiresAt: number | null };
  intervals: { connected: boolean; athleteId: string };
};

const TAB_ORDER: AppTab[] = ["home", "quick", "capture", "trends", "more"];
const APP_TABS = new Set<AppTab>(TAB_ORDER);
const MEAL_SLOTS: Array<{ key: MealSlot; label: string; time: string; image: string }> = [
  { key: "breakfast", label: "早餐", time: "08:00", image: "/illustrations/meal-breakfast.png" },
  { key: "lunch", label: "午餐", time: "12:30", image: "/illustrations/meal-lunch.png" },
  { key: "dinner", label: "晚餐", time: "18:30", image: "/illustrations/meal-dinner.png" },
  { key: "snack", label: "加餐", time: "15:30", image: "/illustrations/meal-snack.png" }
];
const MEAL_PREFERENCES: Array<{ key: MealPreference; label: string; hint: string }> = [
  { key: "homemade", label: "自制", hint: "家常做法" },
  { key: "takeout", label: "外卖", hint: "门店估算" },
  { key: "light", label: "清淡", hint: "少油少糖" },
  { key: "sauce", label: "酱料多", hint: "额外油盐" }
];
const ANALYSIS_TABS: Array<{ key: AnalysisView; label: string }> = [
  { key: "calories", label: "热量" },
  { key: "weight", label: "体重" },
  { key: "meals", label: "餐别" },
  { key: "correlation", label: "相关性" }
];
const QUICK_STUDIO_TABS: Array<{ key: QuickStudioView; label: string; hint: string }> = [
  { key: "presets", label: "常用模板", hint: "快速计入" },
  { key: "library", label: "营养库", hint: "成分表" },
  { key: "ai", label: "AI 新建", hint: "自动拆解" }
];
const CORRELATION_WINDOW_DAYS = 14;
const DEFAULT_SLOT_TARGET_KCAL = 450;

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
  const [analysisPhase, setAnalysisPhase] = useState<AnalysisPhase>("idle");
  const [analysisTimings, setAnalysisTimings] = useState<MealAnalysisTimings | null>(null);
  const [analysisDraftId, setAnalysisDraftId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [presetSavingId, setPresetSavingId] = useState<string | null>(null);
  const [presetAddingId, setPresetAddingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<AppTab>("home");
  const [leavingTab, setLeavingTab] = useState<AppTab | null>(null);
  const [tabDirection, setTabDirection] = useState<TabTransitionDirection>("none");
  const [mealSlot, setMealSlot] = useState<MealSlot>(() => defaultMealSlot());
  const [mealPreferences, setMealPreferences] = useState<MealPreference[]>([]);
  const [pendingPresetUse, setPendingPresetUse] = useState<{ preset: MealPreset; items: Array<{ id: string; grams: number | null }> } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeTabRef = useRef<AppTab>("home");
  const tabInitializedRef = useRef(false);
  const tabTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const applyTab = useCallback((nextTab: AppTab) => {
    const currentTab = activeTabRef.current;
    if (tabTransitionTimerRef.current) {
      clearTimeout(tabTransitionTimerRef.current);
      tabTransitionTimerRef.current = null;
    }

    if (!tabInitializedRef.current) {
      tabInitializedRef.current = true;
      activeTabRef.current = nextTab;
      setActiveTab(nextTab);
      setLeavingTab(null);
      setTabDirection("none");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (nextTab === currentTab) {
      setActiveTab(nextTab);
      setLeavingTab(null);
      setTabDirection("none");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const direction = tabTransitionDirection(currentTab, nextTab);
    activeTabRef.current = nextTab;
    setTabDirection(direction);
    setLeavingTab(currentTab);
    setActiveTab(nextTab);
    window.scrollTo({ top: 0, behavior: "smooth" });
    tabTransitionTimerRef.current = setTimeout(() => {
      setLeavingTab(null);
      tabTransitionTimerRef.current = null;
    }, 180);
  }, []);

  useEffect(() => {
    function updateTabFromHash() {
      const nextTab = window.location.hash.slice(1) as AppTab;
      applyTab(APP_TABS.has(nextTab) ? nextTab : "home");
    }

    updateTabFromHash();
    window.addEventListener("hashchange", updateTabFromHash);
    return () => window.removeEventListener("hashchange", updateTabFromHash);
  }, [applyTab]);

  useEffect(() => {
    return () => {
      if (tabTransitionTimerRef.current) clearTimeout(tabTransitionTimerRef.current);
    };
  }, []);

  const navigateTo = useCallback((tab: AppTab) => {
    if (window.location.hash === `#${tab}`) {
      applyTab(tab);
      return;
    }
    window.location.hash = tab;
  }, [applyTab]);

  function chooseFile(file: File) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (draft) setAnalysisDraftId(draft.id);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setDraft(null);
    setAnalysisTimings(null);
    setError("");
  }

  const toggleMealPreference = useCallback((preference: MealPreference) => {
    setMealPreferences((current) =>
      current.includes(preference) ? current.filter((item) => item !== preference) : [...current, preference]
    );
  }, []);

  async function analyze() {
    const description = mealContext.trim();
    if (!selectedFile && !description) {
      setError("请上传餐食图片或填写餐食描述");
      return;
    }
    const preferenceContext = mealPreferences.length
      ? `用户选择的识别偏好：${mealPreferences.map(mealPreferenceLabel).join("、")}。请结合这些偏好估算做法、油脂、酱料和份量。`
      : "";
    const analysisDescription = [description, preferenceContext].filter(Boolean).join("\n");

    setLoading(true);
    setAnalysisPhase(selectedFile ? "compressing" : "recognizing");
    setAnalysisTimings(null);
    setError("");
    const form = new FormData();
    if (selectedFile) {
      const compressionStartedAt = performance.now();
      let uploadFile = selectedFile;
      try {
        uploadFile = await compressImageForUpload(selectedFile);
      } catch {
        uploadFile = selectedFile;
      }
      form.append("image", uploadFile);
      form.append("clientCompressionMs", String(Math.round(performance.now() - compressionStartedAt)));
      form.append("clientOriginalBytes", String(selectedFile.size));
      setAnalysisPhase("recognizing");
    }
    form.append("dateKey", dateKey);
    form.append("mealSlot", mealSlot);
    form.append("userDescription", analysisDescription);
    if (analysisDraftId) form.append("draftId", analysisDraftId);

    let response: Response;
    let data: { entry?: MealEntry; error?: string; warning?: string; timings?: MealAnalysisTimings };
    try {
      response = await fetch("/api/meals/analyze", { method: "POST", body: form });
      data = await response.json().catch(() => ({}));
    } catch {
      setLoading(false);
      setAnalysisPhase("idle");
      setError("网络连接失败，请稍后重试");
      return;
    }
    setLoading(false);
    setAnalysisPhase("idle");

    if (!response.ok && response.status !== 202) {
      setError(data.error || "上传失败");
      return;
    }

    if (!data.entry) {
      setError("没有收到餐食草稿，请重试");
      return;
    }
    setDraft(data.entry);
    setAnalysisDraftId(data.entry.id);
    setAnalysisTimings(data.timings || null);
    setKcal(String(data.entry.finalKcal || data.entry.modelKcal || ""));
    setError(data.warning || "");
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
      body: JSON.stringify({
        finalKcal: Math.round(finalKcal),
        mealSlot,
        notes: draft.notes,
        items: draft.items.map(({ id, grams }) => ({ id, grams }))
      })
    });

    if (!response.ok) {
      setError("确认失败");
      return;
    }

    setDraft(null);
    setAnalysisDraftId(null);
    setMealContext("");
    setMealPreferences([]);
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    await load();
  }

  function updateDraftItemGrams(itemId: string, value: string) {
    if (!draft) return;
    const parsedGrams = value.trim() === "" ? null : Number(value);
    if (parsedGrams != null && (!Number.isFinite(parsedGrams) || parsedGrams <= 0)) return;

    const items = draft.items.map((item) => {
      if (item.id !== itemId) return item;
      const nextKcal =
        parsedGrams != null && item.nutritionSource
          ? Math.round((item.nutritionSource.kcalPer100g * parsedGrams) / 100)
          : parsedGrams != null && item.grams
            ? Math.round((item.kcal * parsedGrams) / item.grams)
            : item.kcal;
      return { ...item, grams: parsedGrams, kcal: nextKcal };
    });
    const totalKcal = items.reduce((total, item) => total + item.kcal, 0);
    setDraft({ ...draft, items, modelKcal: totalKcal, finalKcal: totalKcal });
    setKcal(String(totalKcal));
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

  function requestPresetUse(preset: MealPreset, items: Array<{ id: string; grams: number | null }>) {
    setPendingPresetUse({ preset, items });
  }

  async function addPresetMeal(preset: MealPreset, items: Array<{ id: string; grams: number | null }>, selectedMealSlot: MealSlot) {
    setPresetAddingId(preset.id);
    setError("");
    const response = await fetch(`/api/meal-presets/${preset.id}/use`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dateKey, mealSlot: selectedMealSlot, items })
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

  function renderTab(tab: AppTab) {
    return (
      <>
        {tab === "home" ? (
          <HomeDashboard
            dashboard={dashboard}
            dateKey={dateKey}
            weightInput={weightInput}
            weightSaving={weightSaving}
            savingPresetId={presetSavingId}
            onDate={setDateKey}
            onWeight={setWeightInput}
            onSaveWeight={saveWeight}
            onSavePreset={savePreset}
            onNavigate={navigateTo}
          />
        ) : null}
        {tab === "capture" ? (
          <CapturePage
            mealSlot={mealSlot}
            mealPreferences={mealPreferences}
            inputRef={inputRef}
            loading={loading}
            analysisPhase={analysisPhase}
            selectedFile={selectedFile}
            previewUrl={previewUrl}
            mealContext={mealContext}
            error={error}
            hasDraft={Boolean(draft || analysisDraftId)}
            draftContent={draft ? <DraftCard draft={draft} kcal={kcal} compression={compression} timings={analysisTimings} onKcal={setKcal} onGrams={updateDraftItemGrams} onConfirm={confirmDraft} /> : null}
            onMealSlot={setMealSlot}
            onPreference={toggleMealPreference}
            onChoose={chooseFile}
            onPick={() => inputRef.current?.click()}
            onContext={setMealContext}
            onAnalyze={analyze}
          />
        ) : null}
        {tab === "quick" ? (
          <QuickPresetsCard
            presets={presets}
            addingId={presetAddingId}
            onUse={requestPresetUse}
            onDelete={deletePreset}
            onReload={loadPresets}
            onError={setError}
          />
        ) : null}
        {tab === "trends" ? (
          <AnalysisPage dashboard={dashboard} />
        ) : null}
        {tab === "more" ? (
          <AppTabSection eyebrow="Profile" title="我的" description="管理数据源、同步状态和连接设置。">
            <MorePage dashboard={dashboard} syncing={syncing} onSync={syncNow} />
          </AppTabSection>
        ) : null}
        {tab !== "capture" && error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      </>
    );
  }

  return (
    <main className="wellness-shell text-slate-900">
      <div className="wellness-app">
        <AppHeader dashboard={dashboard} onNavigate={navigateTo} />
        <section className="px-4 pb-4">
          <div className={leavingTab ? "app-tab-stage app-tab-stage-transitioning" : "app-tab-stage"}>
            {leavingTab ? (
              <div key={`leaving-${leavingTab}`} className={`app-tab-panel app-tab-exit app-tab-exit-${tabDirection} space-y-4`}>
                {renderTab(leavingTab)}
              </div>
            ) : null}
            <div key={`active-${activeTab}`} className={`app-tab-panel app-tab-enter app-tab-enter-${tabDirection} space-y-4`}>
              {renderTab(activeTab)}
            </div>
          </div>
        </section>
        {pendingPresetUse ? (
          <BottomSheet title="选择餐别" onClose={() => setPendingPresetUse(null)}>
            <MealSlotSelector value={mealSlot} onChange={setMealSlot} />
            <button
              type="button"
              onClick={() => {
                void addPresetMeal(pendingPresetUse.preset, pendingPresetUse.items, mealSlot);
                setPendingPresetUse(null);
              }}
              className="mt-4 flex min-h-12 w-full items-center justify-center rounded-full bg-fuchsia-600 px-4 font-semibold text-white"
            >
              计入{mealSlotLabel(mealSlot)}
            </button>
          </BottomSheet>
        ) : null}
        <BottomNavigation activeTab={activeTab} onNavigate={navigateTo} />
      </div>
    </main>
  );
}

function AppHeader({
  dashboard,
  onNavigate
}: {
  dashboard: Dashboard | null;
  onNavigate: (tab: AppTab) => void;
}) {
  const synced = Boolean(dashboard?.today.syncedAt);
  return (
    <header className="wellness-header">
      <button type="button" onClick={() => onNavigate("more")} className="app-icon-button" aria-label="打开更多">
        <Menu size={23} />
      </button>
      <button type="button" onClick={() => onNavigate("home")} className="wellness-wordmark" aria-label="返回首页">
        <strong>TRACKER</strong>
      </button>
      <div className={synced ? "journal-sync-status journal-sync-status-ready" : "journal-sync-status"} aria-label={synced ? "已同步" : "待同步"}>
        <CircleCheckBig size={18} />
        <span>{synced ? "已同步" : "待同步"}</span>
      </div>
    </header>
  );
}

function BottomNavigation({ activeTab, onNavigate }: { activeTab: AppTab; onNavigate: (tab: AppTab) => void }) {
  return (
    <nav className="wellness-bottom-nav" aria-label="应用导航">
      <BottomNavItem icon={<Home size={21} strokeWidth={1.8} />} label="首页" active={activeTab === "home"} onClick={() => onNavigate("home")} />
      <BottomNavItem icon={<ClipboardList size={21} strokeWidth={1.8} />} label="计划" active={activeTab === "quick"} onClick={() => onNavigate("quick")} />
      <BottomNavItem icon={<Plus size={29} strokeWidth={1.8} />} label="记一餐" active={activeTab === "capture"} primary onClick={() => onNavigate("capture")} />
      <BottomNavItem icon={<ChartPie size={21} strokeWidth={1.8} />} label="分析" active={activeTab === "trends"} onClick={() => onNavigate("trends")} />
      <BottomNavItem icon={<UserRound size={22} strokeWidth={1.8} />} label="我的" active={activeTab === "more"} onClick={() => onNavigate("more")} />
    </nav>
  );
}

function BottomNavItem({ icon, label, active, primary, onClick }: { icon: React.ReactNode; label: string; active?: boolean; primary?: boolean; onClick: () => void }) {
  if (primary) {
    return (
      <button type="button" onClick={onClick} className="group relative flex min-h-14 min-w-0 items-center justify-center outline-none" aria-label={label}>
        <span className={`journal-primary-nav absolute -top-5 flex h-14 w-14 items-center justify-center rounded-full text-white transition duration-200 group-active:scale-95 ${active ? "scale-[1.04]" : ""}`}>
          {icon}
        </span>
        <span className="sr-only">{label}</span>
      </button>
    );
  }

  return (
    <button type="button" onClick={onClick} className={`journal-nav-item group flex min-h-14 min-w-0 flex-col items-center justify-center px-1 outline-none transition duration-200 ${active ? "journal-nav-item-active" : ""}`}>
      <span className={`journal-nav-icon transition-transform duration-200 group-active:scale-90 ${active ? "scale-105" : "scale-100"}`}>{icon}</span>
      <span className="journal-nav-label">{label}</span>
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
  weightInput,
  weightSaving,
  savingPresetId,
  onDate,
  onWeight,
  onSaveWeight,
  onSavePreset,
  onNavigate
}: {
  dashboard: Dashboard | null;
  dateKey: string;
  weightInput: string;
  weightSaving: boolean;
  savingPresetId: string | null;
  onDate: (date: string) => void;
  onWeight: (value: string) => void;
  onSaveWeight: () => void;
  onSavePreset: (meal: MealEntry) => void;
  onNavigate: (tab: AppTab) => void;
}) {
  const [weightOpen, setWeightOpen] = useState(false);
  return (
    <>
      <StatusStrip dashboard={dashboard} dateKey={dateKey} onDate={onDate} />
      <MissionCard dashboard={dashboard} />
      <WeightInputCard dashboard={dashboard} dateKey={dateKey} value={weightInput} saving={weightSaving} open={weightOpen} onOpen={setWeightOpen} onChange={onWeight} onSave={onSaveWeight} />
      <HomeShortcuts onNavigate={onNavigate} onWeight={() => setWeightOpen(true)} />
      <TodayMeals meals={dashboard?.today.meals || []} savingId={savingPresetId} onSavePreset={onSavePreset} />
      <WeeklyPreviewCard dashboard={dashboard} onOpen={() => onNavigate("trends")} />
    </>
  );
}

function StatusStrip({
  dashboard,
  dateKey,
  onDate
}: {
  dashboard: Dashboard | null;
  dateKey: string;
  onDate: (date: string) => void;
}) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const weekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [weekPhase, setWeekPhase] = useState<"idle" | "out" | "in">("idle");
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

  useEffect(() => {
    return () => {
      if (weekTimerRef.current) clearTimeout(weekTimerRef.current);
    };
  }, []);

  function shiftWeek(offset: number) {
    if (weekPhase !== "idle") return;
    const date = new Date(`${dateKey}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + offset * 7);
    const nextDateKey = date.toISOString().slice(0, 10);
    setWeekPhase("out");
    weekTimerRef.current = setTimeout(() => {
      onDate(nextDateKey);
      setWeekPhase("in");
      weekTimerRef.current = setTimeout(() => setWeekPhase("idle"), 180);
    }, 120);
  }

  function handleTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 42 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    shiftWeek(deltaX > 0 ? -1 : 1);
  }

  return (
    <section className="app-card wellness-date-strip flex items-center gap-2 p-2">
      <div
        className={`no-scrollbar flex min-w-0 flex-1 touch-pan-y gap-1 overflow-x-auto ${weekPhase === "out" ? "week-calendar-fade-out" : weekPhase === "in" ? "week-calendar-fade-in" : ""}`}
        onTouchStart={(event) => {
          const touch = event.touches[0];
          if (touch) touchStartRef.current = { x: touch.clientX, y: touch.clientY };
        }}
        onTouchEnd={handleTouchEnd}
      >
        {weekDays.map((day) => {
          const active = day.key === dateKey;
          const hasMeals = Boolean(dashboard?.days.find((item) => item.dateKey === day.key)?.mealCount);
          return (
            <button
              type="button"
              key={day.key}
              onClick={() => onDate(day.key)}
              className={active ? "journal-date-item journal-date-item-active" : "journal-date-item"}
              aria-label={`选择 ${day.key}`}
              aria-pressed={active}
            >
              <span className="journal-date-weekday">{day.weekday}</span>
              <span className="journal-date-number">{day.number}</span>
              <span className={hasMeals ? "journal-date-dot journal-date-dot-ready" : "journal-date-dot"} />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function HomeShortcuts({ onNavigate, onWeight }: { onNavigate: (tab: AppTab) => void; onWeight: () => void }) {
  const shortcuts = [
    { label: "记一餐", hint: "记录饮食", image: "/illustrations/shortcut-meal.png", onClick: () => onNavigate("capture") },
    { label: "记运动", hint: "即将开放", image: "/illustrations/shortcut-exercise.png", disabled: true },
    { label: "记体重", hint: "每天记录", image: "/illustrations/shortcut-weight.png", onClick: onWeight },
    { label: "查看趋势", hint: "数据洞察", image: "/illustrations/shortcut-trend.png", onClick: () => onNavigate("trends") }
  ];
  return (
    <section className="journal-section">
      <h2 className="journal-section-title">快捷入口</h2>
      <div className="journal-shortcut-grid">
        {shortcuts.map((item) => (
          <button
            type="button"
            key={item.label}
            onClick={item.onClick}
            disabled={item.disabled}
            className="journal-shortcut-card"
            aria-label={item.disabled ? `${item.label}，即将开放` : item.label}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.image} alt="" />
            <span><strong>{item.label}</strong><small>{item.hint}</small></span>
          </button>
        ))}
      </div>
    </section>
  );
}

function MealSlotSelector({ value, onChange }: { value: MealSlot; onChange: (value: MealSlot) => void }) {
  return (
    <div className="journal-slot-selector" aria-label="选择餐别">
      {MEAL_SLOTS.map((item) => (
        <button
          type="button"
          key={item.key}
          onClick={() => onChange(item.key)}
          className={value === item.key ? "journal-slot-option journal-slot-option-active" : "journal-slot-option"}
          aria-pressed={value === item.key}
        >
          {item.label}
        </button>
      ))}
    </div>
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
    <section className="app-card wellness-section-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="wellness-eyebrow">Quick Meals</p>
          <h2 className="wellness-section-title">常用餐食</h2>
        </div>
        <button type="button" onClick={onViewAll} className="flex min-h-11 items-center gap-1 text-sm font-semibold text-fuchsia-600">
          管理
          <ChevronRight size={16} />
        </button>
      </div>
      {presets.length ? (
        <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
          {presets.map((preset) => (
            <div key={preset.id} className="wellness-quick-meal w-40 shrink-0 p-2">
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
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <button type="button" onClick={onClose} className="fixed inset-0 z-50 bg-slate-950/30" aria-label="关闭弹层" />
      <section className="fixed inset-x-0 bottom-0 z-[60] mx-auto max-h-[82vh] w-full max-w-[480px] overscroll-contain overflow-y-auto rounded-t-2xl bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold">{title}</h3>
          <button type="button" onClick={onClose} className="app-icon-button" aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </>,
    document.body
  );
}

function WeeklyPreviewCard({ dashboard, onOpen }: { dashboard: Dashboard | null; onOpen: () => void }) {
  return (
    <section className="journal-section journal-trend-section">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <h2 className="journal-section-title">本周趋势</h2>
          <p className="journal-section-en">WEEKLY TREND</p>
        </div>
        <button type="button" onClick={onOpen} className="journal-trend-link">
          <span><i className="journal-legend-dot journal-legend-coral" />摄入</span>
          <span><i className="journal-legend-dot journal-legend-sage" />消耗</span>
        </button>
      </div>
      <WeeklyLinePreview days={dashboard?.days || []} />
    </section>
  );
}

function WeeklyLinePreview({ days }: { days: DashboardDay[] }) {
  const width = 720;
  const height = 150;
  const padding = { top: 16, right: 4, bottom: 26, left: 4 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const values = days.flatMap((day) => [day.intakeKcal || 0, day.totalBurnKcal || 0]);
  const min = Math.max(0, Math.min(...values, 0) - 180);
  const max = Math.max(...values, 1) + 180;
  const x = (index: number) => padding.left + (days.length <= 1 ? chartW / 2 : (chartW / (days.length - 1)) * index);
  const y = (value: number) => padding.top + ((max - value) / (max - min || 1)) * chartH;
  const intakePoints = days.map((day, index) => `${x(index)},${y(day.intakeKcal || 0)}`).join(" ");
  const burnPoints = days.map((day, index) => `${x(index)},${y(day.totalBurnKcal || 0)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="journal-week-chart" role="img" aria-label="本周摄入与消耗双折线图">
      <line x1="0" x2={width} y1={height - padding.bottom} y2={height - padding.bottom} stroke="#ded8d0" strokeDasharray="5 6" />
      {burnPoints ? <polyline points={burnPoints} fill="none" stroke="#76917b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> : null}
      {intakePoints ? <polyline points={intakePoints} fill="none" stroke="#dd7858" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> : null}
      {days.map((day, index) => (
        <g key={day.dateKey}>
          <circle cx={x(index)} cy={y(day.intakeKcal || 0)} r="3.5" fill="#dd7858" />
          <circle cx={x(index)} cy={y(day.totalBurnKcal || 0)} r="3.5" fill="#76917b" />
          <text x={x(index)} y={height - 6} textAnchor="middle" className="journal-chart-label">{["一", "二", "三", "四", "五", "六", "日"][index]}</text>
        </g>
      ))}
    </svg>
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
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-fuchsia-50 text-fuchsia-600"><Database size={20} /></div>
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
      <span className={`text-xs font-bold ${connected ? "text-fuchsia-700" : "text-slate-400"}`}>{connected ? "已连接" : connected === false ? "未连接" : "读取中"}</span>
    </div>
  );
}

function MissionCard({ dashboard }: { dashboard: Dashboard | null }) {
  const today = dashboard?.today;
  const intake = today?.intakeKcal ?? 0;
  const totalBurn = today?.totalBurnKcal ?? 0;
  const deficit = today?.deficitKcal;
  const target = dashboard?.dailyDeficitTargetKcal || 500;
  const goalProgress = deficit == null ? 0 : Math.min(100, Math.round((Math.max(0, deficit) / target) * 100));

  return (
    <section className="journal-hero">
      <div className="journal-deficit-panel">
        <h1>今日热量缺口</h1>
        <p>专注当下，稳步达成目标</p>
        <div className="journal-deficit-number">{signedDeficitText(deficit)}<span>kcal</span></div>
        <div className="journal-goal-pill">目标完成 {goalProgress}%</div>
      </div>
      <div className="journal-ring-wrap">
        <svg key={goalProgress} viewBox="0 0 240 240" className="journal-ring-svg">
          <circle cx="120" cy="120" r="103" fill="none" stroke="#f7e2d8" strokeWidth="12" />
          <circle className="mission-ring-progress" pathLength="100" cx="120" cy="120" r="103" fill="none" stroke="#dd7858" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${goalProgress} 100`} />
          <circle cx="120" cy="120" r="84" fill="#fffdf9" stroke="#efe9e2" strokeWidth="1" />
        </svg>
        <div className="journal-ring-copy">
          <span>今日总摄入</span>
          <strong>{intake.toLocaleString()} <small>kcal</small></strong>
          <i />
          <span>总消耗</span>
          <strong>{totalBurn ? totalBurn.toLocaleString() : "--"} <small>kcal</small></strong>
        </div>
      </div>
    </section>
  );
}

function MissionMetric({ dot, label, value }: { dot: string; label: string; value: string }) {
  return (
    <div className="wellness-mission-metric">
      <p><span className={`wellness-metric-dot ${dot}`} />{label}</p>
      <strong>{value}</strong>
    </div>
  );
}

function CapturePage({
  mealSlot,
  mealPreferences,
  inputRef,
  loading,
  analysisPhase,
  selectedFile,
  previewUrl,
  mealContext,
  error,
  hasDraft,
  draftContent,
  onMealSlot,
  onPreference,
  onChoose,
  onPick,
  onContext,
  onAnalyze
}: {
  mealSlot: MealSlot;
  mealPreferences: MealPreference[];
  inputRef: React.RefObject<HTMLInputElement | null>;
  loading: boolean;
  analysisPhase: AnalysisPhase;
  selectedFile: File | null;
  previewUrl: string | null;
  mealContext: string;
  error: string;
  hasDraft: boolean;
  draftContent: React.ReactNode;
  onMealSlot: (value: MealSlot) => void;
  onPreference: (value: MealPreference) => void;
  onChoose: (file: File) => void;
  onPick: () => void;
  onContext: (value: string) => void;
  onAnalyze: () => void;
}) {
  return (
    <section className="capture-page">
      <div className="capture-hero">
        <div className="capture-hero-copy">
          <p>Meal Vision</p>
          <h1>记一餐</h1>
          <span>上传图片或填写描述，AI 先生成草稿，确认热量后再计入今日统计。</span>
        </div>
        <span className="capture-ai-badge"><Sparkles size={14} />AI 识别</span>
      </div>
      <MealSlotSelector value={mealSlot} onChange={onMealSlot} />
      <UploadPanel
        inputRef={inputRef}
        loading={loading}
        analysisPhase={analysisPhase}
        selectedFile={selectedFile}
        previewUrl={previewUrl}
        mealContext={mealContext}
        mealPreferences={mealPreferences}
        error={error}
        onChoose={onChoose}
        onPick={onPick}
        onContext={onContext}
        onPreference={onPreference}
        onAnalyze={onAnalyze}
        hasDraft={hasDraft}
        draftContent={draftContent}
      />
    </section>
  );
}

function UploadPanel({
  inputRef,
  loading,
  analysisPhase,
  selectedFile,
  previewUrl,
  mealContext,
  mealPreferences,
  error,
  onChoose,
  onPick,
  onContext,
  onPreference,
  onAnalyze,
  hasDraft,
  draftContent
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  loading: boolean;
  analysisPhase: AnalysisPhase;
  selectedFile: File | null;
  previewUrl: string | null;
  mealContext: string;
  mealPreferences: MealPreference[];
  error: string;
  onChoose: (file: File) => void;
  onPick: () => void;
  onContext: (value: string) => void;
  onPreference: (value: MealPreference) => void;
  onAnalyze: () => void;
  hasDraft: boolean;
  draftContent: React.ReactNode;
}) {
  const canAnalyze = Boolean(selectedFile || mealContext.trim());

  return (
    <section className="capture-studio-card">
      <div className="capture-card-head">
        <div>
          <p>AI Scanner</p>
          <h2>上传图片或文字描述</h2>
        </div>
        <span><Camera size={17} />智能识别</span>
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
        aria-label={previewUrl ? "替换餐食图片" : "上传餐食图片"}
        className={previewUrl ? "capture-scanner capture-scanner-preview" : "capture-scanner"}
      >
        <span className="capture-frame-corner capture-frame-corner-tl" />
        <span className="capture-frame-corner capture-frame-corner-tr" />
        <span className="capture-frame-corner capture-frame-corner-bl" />
        <span className="capture-frame-corner capture-frame-corner-br" />
        {previewUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="待分析餐食" className="capture-preview-image" />
            <span className="capture-replace-pill">轻触替换图片</span>
            <span className="capture-file-meta">
              <small>{selectedFile?.name || "已选择图片"}</small>
              <small>{selectedFile ? `${(selectedFile.size / 1024 / 1024).toFixed(1)} MB` : ""}</small>
            </span>
            {loading ? (
              <span className="capture-loading-layer">
                <CloudCog size={52} className="animate-pulse" />
                <strong>{analysisPhase === "compressing" ? "正在压缩图片" : "AI 正在识图"}</strong>
                <small>{analysisPhase === "compressing" ? "正在减少图片体积，节省上传时间" : "正在识别食物种类并估测重量"}</small>
              </span>
            ) : null}
          </>
        ) : (
          <>
            <span className="capture-scan-line" />
            <span className="capture-upload-orb">
              {loading ? <CloudCog size={44} className="animate-pulse" /> : <Upload size={46} />}
            </span>
            <strong>{loading ? (analysisPhase === "compressing" ? "正在压缩图片" : "AI 正在识图") : "上传图片"}</strong>
            <small>{loading ? "请稍等，正在为草稿做准备" : "图片优先，也支持只写文字描述"}</small>
          </>
        )}
      </button>

      <div className="capture-preference-card">
        <div className="capture-block-title">
          <p>识别偏好</p>
          <span>帮助 AI 判断做法、油脂和份量</span>
        </div>
        <div className="capture-preference-list">
          {MEAL_PREFERENCES.map((item) => {
            const active = mealPreferences.includes(item.key);
            return (
              <button
                type="button"
                key={item.key}
                onClick={() => onPreference(item.key)}
                aria-pressed={active}
                className={active ? "capture-preference-chip capture-preference-chip-active" : "capture-preference-chip"}
              >
                <strong>{item.label}</strong>
                <small>{item.hint}</small>
              </button>
            );
          })}
        </div>
      </div>

      <label className="capture-text-card">
        <span className="capture-block-title">
          <p>文字补充</p>
          <span>重量、做法、店铺和规格越具体越好</span>
        </span>
        <textarea
          value={mealContext}
          onChange={(event) => onContext(event.target.value)}
          rows={4}
          className="capture-textarea"
          placeholder="例如：米饭 180g，鸡胸肉 150g，少油自制。"
        />
      </label>
      <p className="capture-help">
        {hasDraft
          ? "识别不准确时，可补充食物名称、重量、做法或店铺，再让 AI 修正草稿。只有确认 kcal 后才会计入统计。"
          : "支持图片加说明，也支持只写文字描述。补充重量、做法或店铺可提高准确度；分析后会先生成草稿，确认 kcal 才计入统计。"}
      </p>
      <button
        onClick={onAnalyze}
        disabled={loading || !canAnalyze}
        className="capture-cta"
      >
        {loading ? <CloudCog size={19} className="animate-pulse" /> : <Send size={19} />}
        {loading ? (analysisPhase === "compressing" ? "正在压缩图片" : "AI 正在识图") : hasDraft ? "根据说明重新识别" : "开始 AI 识别"}
      </button>
      {error ? <p className="capture-error">{error}</p> : null}
      {draftContent ? <div className="capture-draft-wrap">{draftContent}</div> : null}
    </section>
  );
}

function WeightInputCard({
  dashboard,
  dateKey,
  value,
  saving,
  open,
  onOpen,
  onChange,
  onSave
}: {
  dashboard: Dashboard | null;
  dateKey: string;
  value: string;
  saving: boolean;
  open: boolean;
  onOpen: (open: boolean) => void;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  const weight = dashboard?.today.weightKg;
  const previous = dashboard?.today.previousWeightKg;
  const delta = weight != null && previous != null ? Number((weight - previous).toFixed(1)) : null;
  return (
    <>
      <section className="journal-weight-card">
        <div className="journal-weight-copy">
          <h2>体重记录</h2>
          <p>BODY WEIGHT</p>
          <div className="journal-weight-value">{weight == null ? "--" : weight.toFixed(1)}<span>kg</span></div>
          {delta == null ? null : <div className="journal-weight-delta">较昨日 {delta > 0 ? "+" : ""}{delta.toFixed(1)} kg <ChevronDown size={14} /></div>}
          <small>{formatWeightTime(dashboard?.today.weightRecordedAt)}</small>
        </div>
        <button type="button" onClick={() => onOpen(true)} className="journal-weight-action">
          <Pencil size={15} />
          记录体重
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/illustrations/wellness-ingredients.webp" alt="" className="journal-weight-illustration" />
      </section>
      {open ? (
        <BottomSheet title="记录体重" onClose={() => onOpen(false)}>
          <p className="mb-3 text-sm text-slate-500">{dateKey} · 留下今日的轻量记录</p>
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <input value={value} onChange={(event) => onChange(event.target.value)} inputMode="decimal" placeholder="例如 61.8" className="wellness-weight-input" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">kg</span>
            </div>
            <button
              type="button"
              onClick={() => {
                onSave();
                onOpen(false);
              }}
              disabled={saving}
              className="wellness-weight-save"
              aria-label={saving ? "保存中" : "保存体重"}
            >
              <Save size={17} />
            </button>
          </div>
        </BottomSheet>
      ) : null}
    </>
  );
}

function DraftCard({
  draft,
  kcal,
  compression,
  timings,
  onKcal,
  onGrams,
  onConfirm
}: {
  draft: MealEntry;
  kcal: string;
  compression: number | null;
  timings: MealAnalysisTimings | null;
  onKcal: (value: string) => void;
  onGrams: (itemId: string, value: string) => void;
  onConfirm: () => void;
}) {
  return (
    <div className="capture-draft-card">
      <div className="capture-draft-head">
        <div>
          <p>待确认</p>
          <h3>餐食草稿</h3>
          <span>
            {draft.confidence == null ? "置信度暂无" : `置信度 ${Math.round(draft.confidence * 100)}%`}
            {compression == null ? "" : ` · 图片缩小约 ${compression}%`}
          </span>
          {timings ? <span>总耗时 {seconds(timings.totalServerMs + timings.clientCompressionMs)} · AI 识图 {seconds(timings.openAiMs)} · 上传 {seconds(timings.blobUploadMs)}</span> : null}
        </div>
        <div className="capture-draft-actions">
          <label>
            <input value={kcal} onChange={(event) => onKcal(event.target.value)} inputMode="numeric" aria-label="最终热量" />
            <span>kcal</span>
          </label>
          <button onClick={onConfirm}>
            <Check size={17} />
            确认
          </button>
        </div>
      </div>
      <div className="capture-draft-list">
        {draft.items.map((item) => (
          <div key={item.id} className="capture-draft-item">
            <div className="capture-draft-item-title">
              <strong>{item.name}</strong>
              <span>{item.kcal} kcal</span>
            </div>
            <p>{item.portion || "AI 已识别食物种类"}</p>
            <div className="capture-draft-grams">
              <label htmlFor={`draft-grams-${item.id}`}>实际重量</label>
              <div>
                <input
                  id={`draft-grams-${item.id}`}
                  value={item.grams ?? ""}
                  onChange={(event) => onGrams(item.id, event.target.value)}
                  inputMode="decimal"
                  placeholder="待补充"
                />
                <span>g</span>
              </div>
            </div>
            <small className={item.nutritionSource ? "capture-draft-source capture-draft-source-ready" : "capture-draft-source"}>
              {item.nutritionSource
                ? `已引用个人营养库：${item.nutritionSource.name} · ${item.nutritionSource.kcalPer100g} kcal/100g`
                : "AI 估测重量，可按实际情况调整"}
            </small>
          </div>
        ))}
      </div>
      {draft.notes && !looksMojibake(draft.notes) ? <p className="capture-draft-note">{draft.notes}</p> : null}
      {draft.uncertainty && !looksMojibake(draft.uncertainty) ? <p className="capture-draft-warning">{draft.uncertainty}</p> : null}
    </div>
  );
}

function AnalysisPage({ dashboard }: { dashboard: Dashboard | null }) {
  const [view, setView] = useState<AnalysisView>("correlation");
  const summary = useMemo(() => buildAnalysisSummary(dashboard), [dashboard]);

  return (
    <section className="analysis-page">
      <div className="analysis-hero">
        <div className="analysis-hero-copy">
          <p>Correlation Gallery</p>
          <h1>数据关系</h1>
          <span>探索摄入、缺口与体重变化的内在联系</span>
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
            <p>Relationship Map</p>
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
          <p>Calorie Summary</p>
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
          <p>Weight Summary</p>
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
          <p>Meal Slot Ranking</p>
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
        <polyline points={intakePoints} fill="none" stroke="#dd7858" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={deficitPoints} fill="none" stroke="#6f9677" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {days.map((day, index) => {
          const delta = dailyWeightDelta(day);
          if (delta == null) return null;
          return <circle key={`${day.dateKey}-delta`} cx={x(index)} cy={yDelta(delta)} r={Math.min(14, Math.max(7, Math.abs(delta) * 28 + 7))} fill="#ead8bd" fillOpacity="0.72" stroke="#d8bea0" />;
        })}
        {highlightX != null ? (
          <g>
            <line x1={highlightX} x2={highlightX} y1={padding.top + 24} y2={height - padding.bottom} stroke="#dfcbb6" strokeDasharray="6 8" />
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
  const [studioView, setStudioView] = useState<QuickStudioView>("presets");
  const [createDescription, setCreateDescription] = useState("");
  const [createFile, setCreateFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [newPreset, setNewPreset] = useState<MealPreset | null>(null);
  const [nutritionReview, setNutritionReview] = useState<{ presetId: string; itemIndex: number; source: NutritionSourceDraft } | null>(null);
  const [nutritionUploading, setNutritionUploading] = useState("");
  const [nutritionSources, setNutritionSources] = useState<NutritionSource[]>([]);
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

  const createPreviewUrl = useMemo(() => createFile ? URL.createObjectURL(createFile) : null, [createFile]);

  useEffect(() => () => {
    if (createPreviewUrl) URL.revokeObjectURL(createPreviewUrl);
  }, [createPreviewUrl]);

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
    setStudioView("library");
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
    setStudioView("presets");
    setCreateDescription("");
    setCreateFile(null);
    setNewPreset(null);
    await onReload();
  }

  const expandedPreset = presets.find((preset) => preset.id === expandedId) || null;
  const expandedItems = expandedPreset ? editableItems[expandedPreset.id] || expandedPreset.items : [];
  const favoritePreset = presets.reduce<MealPreset | null>((best, preset) => {
    if (!best) return preset;
    return preset.usageCount > best.usageCount ? preset : best;
  }, null);
  const hasCreateInput = Boolean(createFile || createDescription.trim());

  return (
    <section className="plan-studio-page">
      <div className="plan-studio-hero">
        <div className="plan-studio-copy">
          <p>MEAL PLAN STUDIO</p>
          <h1>计划</h1>
          <span>管理常用餐食、个人营养库和 AI 模板拆解。</span>
        </div>
        <button type="button" onClick={() => setStudioView("ai")} className="plan-hero-action">
          <Sparkles size={15} />
          AI 新建
        </button>
      </div>

      <div className="plan-stat-grid">
        <button type="button" onClick={() => setStudioView("presets")} className="plan-stat-card">
          <span><BookmarkPlus size={15} /></span>
          <p>模板</p>
          <strong>{presets.length}</strong>
        </button>
        <button type="button" onClick={() => setStudioView("library")} className="plan-stat-card">
          <span><Database size={15} /></span>
          <p>营养库</p>
          <strong>{nutritionSources.length}</strong>
        </button>
        <button type="button" onClick={() => favoritePreset && onUse(favoritePreset, configuredItems(favoritePreset))} disabled={!favoritePreset} className="plan-stat-card plan-stat-card-wide">
          <span><Utensils size={15} /></span>
          <p>最近常用</p>
          <strong>{favoritePreset?.name || "待建立"}</strong>
        </button>
      </div>

      <div className="plan-segmented" role="tablist" aria-label="计划页功能">
        {QUICK_STUDIO_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={studioView === tab.key}
            onClick={() => setStudioView(tab.key)}
            className={studioView === tab.key ? "plan-segmented-item plan-segmented-item-active" : "plan-segmented-item"}
          >
            <strong>{tab.label}</strong>
            <small>{tab.hint}</small>
          </button>
        ))}
      </div>

      {studioView === "presets" ? (
        <div className="plan-template-section">
          <div className="plan-section-head">
            <div>
              <p>QUICK MEALS</p>
              <h2>常用模板</h2>
            </div>
            <button type="button" onClick={() => setStudioView("ai")} className="plan-soft-button">
              <Plus size={15} />
              新建
            </button>
          </div>
          {presets.length ? (
            <div className="plan-template-list">
              {presets.map((preset) => {
                const expanded = expandedId === preset.id;
                return (
                  <article key={preset.id} className="plan-template-card">
                    <div className="plan-template-top">
                      <MealThumbnail url={preset.imageUrl} label={preset.name} compact />
                      <div className="plan-template-copy">
                        <div className="plan-template-title-row">
                          <div className="min-w-0">
                            <h3>{preset.name}</h3>
                            <p>{preset.items.map((item) => item.portion || item.name).join(" · ") || "已确认餐食"}</p>
                          </div>
                          <button type="button" onClick={() => onDelete(preset)} className="plan-icon-danger" aria-label={`删除 ${preset.name}`}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <div className="plan-template-metrics">
                          <span>{preset.baseKcal} kcal</span>
                          <span>{preset.items.length} 项食物</span>
                          <span>用过 {preset.usageCount} 次</span>
                        </div>
                      </div>
                    </div>
                    <div className="plan-template-actions">
                      <button type="button" onClick={() => togglePreset(preset)} className="plan-secondary-action">
                        <ChevronDown size={16} className={expanded ? "rotate-180" : ""} />
                        {expanded ? "正在调整" : "调整克数"}
                      </button>
                      <button type="button" onClick={() => onUse(preset, configuredItems(preset))} disabled={addingId === preset.id} className="plan-primary-action">
                        <Plus size={16} />
                        {addingId === preset.id ? "计入中" : "快速计入"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="plan-empty-card">
              <Sparkles size={18} />
              <strong>还没有常用餐食</strong>
              <span>用 AI 新建一个模板，或从今日记录里存为常用。</span>
              <button type="button" onClick={() => setStudioView("ai")} className="plan-primary-action">开始新建</button>
            </div>
          )}
        </div>
      ) : null}

      {studioView === "library" ? (
        <div className="plan-library-section">
          <div className="plan-section-head">
            <div>
              <p>NUTRITION LIBRARY</p>
              <h2>个人营养库</h2>
            </div>
            <span className="plan-count-pill">{nutritionSources.length} 个食物</span>
          </div>
          <NutritionLibraryEditor
            source={libraryDraft}
            analyzing={libraryAnalyzing}
            saving={librarySaving}
            onChange={setLibraryDraft}
            onAnalyze={analyzeLibraryNutrition}
            onSave={saveLibraryNutrition}
          />
          <div className="plan-source-list">
            {nutritionSources.length ? nutritionSources.slice(0, 10).map((source) => (
              <div key={source.id} className="plan-source-card">
                <div>
                  <strong>{source.name}</strong>
                  <span>{source.kcalPer100g} kcal / 100g</span>
                </div>
                <small>{source.proteinPer100g == null ? "未填蛋白" : `蛋白 ${source.proteinPer100g}g`} · {source.fatPer100g == null ? "未填脂肪" : `脂肪 ${source.fatPer100g}g`}</small>
              </div>
            )) : (
              <div className="plan-empty-card">
                <Database size={18} />
                <strong>营养库还空着</strong>
                <span>上传包装成分表，或手动填写每 100g 热量。</span>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {studioView === "ai" ? (
        <div className="plan-ai-section">
          <div className="capture-card-head">
            <div>
              <p>AI TEMPLATE SCANNER</p>
              <h2>新建餐食模板</h2>
            </div>
            <span><Camera size={15} /> 智能拆解</span>
          </div>
          <label className={createPreviewUrl ? "plan-ai-scanner plan-ai-scanner-preview" : "plan-ai-scanner"}>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                setCreateFile(event.target.files?.[0] || null);
                setNewPreset(null);
              }}
            />
            <i className="capture-frame-corner capture-frame-corner-tl" />
            <i className="capture-frame-corner capture-frame-corner-tr" />
            <i className="capture-frame-corner capture-frame-corner-bl" />
            <i className="capture-frame-corner capture-frame-corner-br" />
            <span className="capture-scan-line" />
            {createPreviewUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={createPreviewUrl} alt="新建模板预览" className="plan-ai-preview-image" />
                <span className="capture-replace-pill">点击替换图片</span>
                <span className="capture-file-meta"><small>{createFile?.name}</small><Upload size={14} /></span>
              </>
            ) : (
              <>
                <span className="capture-upload-orb"><Upload size={34} /></span>
                <strong>上传套餐图片</strong>
                <small>也可以只写文字描述</small>
              </>
            )}
            {analyzing ? (
              <span className="capture-loading-layer">
                <Sparkles size={28} />
                <strong>AI 正在拆解模板</strong>
                <small>会生成食物项、克数和热量草稿</small>
              </span>
            ) : null}
          </label>

          <label className="plan-ai-text-card">
            <div className="capture-block-title">
              <p>文字补充</p>
              <span>图片不清楚时补充份量、品牌或做法。</span>
            </div>
            <textarea
              value={createDescription}
              onChange={(event) => {
                setCreateDescription(event.target.value);
                if (newPreset) setNewPreset(null);
              }}
              placeholder="例如：燕麦 50g，酸奶 200g，每日坚果一包。"
              className="capture-textarea"
            />
          </label>

          <button type="button" onClick={analyzeNewPreset} disabled={analyzing || !hasCreateInput} className="plan-ai-cta">
            <Send size={17} />
            {analyzing ? "AI 正在拆解" : newPreset ? "根据说明重新拆解" : "AI 自动拆解"}
          </button>

          {newPreset ? (
            <div className="plan-new-preset-card">
              <div className="plan-new-preset-head">
                <div>
                  <p>AI DRAFT</p>
                  <h3>确认模板草稿</h3>
                </div>
                <span>{newPreset.items.reduce((total, item) => total + item.kcal, 0)} kcal</span>
              </div>
              <label className="plan-field">
                <span>模板名称</span>
                <input value={newPreset.name} onChange={(event) => setNewPreset({ ...newPreset, name: event.target.value })} />
              </label>
              <div className="plan-new-items">
                {newPreset.items.map((item, index) => (
                  <div key={item.id} className="plan-new-item">
                    <PresetItemEditor
                      item={item}
                      nutritionSources={nutritionSources}
                      showGrams
                      onChange={(patch) => setNewPreset({ ...newPreset, items: newPreset.items.map((current, itemIndex) => (itemIndex === index ? { ...current, ...patch } : current)) })}
                      onSelectSource={(source) => setNewPreset({ ...newPreset, items: newPreset.items.map((current, itemIndex) => (itemIndex === index ? { ...current, ...bindNutritionSource(current, source) } : current)) })}
                      onDelete={() => setNewPreset({ ...newPreset, items: newPreset.items.filter((_, itemIndex) => itemIndex !== index) })}
                    />
                  </div>
                ))}
              </div>
              <button type="button" onClick={saveNewPreset} disabled={savingId === "new"} className="plan-primary-action plan-save-template">
                <Save size={16} />
                {savingId === "new" ? "保存中" : "保存为常用模板"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

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
            }} disabled={addingId === expandedPreset.id} className="flex min-h-12 w-full items-center justify-center gap-1.5 rounded-lg bg-fuchsia-600 px-3 text-sm font-semibold text-white transition hover:bg-fuchsia-700 disabled:opacity-60">
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
    <div className="plan-library-editor">
      <div className="plan-library-editor-head">
        <div>
          <p>FOOD SOURCE</p>
          <h3>添加食物到个人营养库</h3>
          <span>填写每 100g 热量，或上传包装成分表自动识别。</span>
        </div>
        <label className="plan-library-upload">
          <FileText size={15} />
          {analyzing ? "识别中" : source.imageUrl ? "替换成分表" : "上传成分表"}
          <input type="file" accept="image/*" className="hidden" disabled={analyzing} onChange={(event) => event.target.files?.[0] && onAnalyze(event.target.files[0])} />
        </label>
      </div>
      <div className="plan-library-grid">
        <input value={source.name} onChange={(event) => onChange({ ...source, name: event.target.value })} placeholder="食物名称" />
        <input value={source.kcalPer100g || ""} onChange={(event) => onChange({ ...source, kcalPer100g: Number(event.target.value) })} inputMode="decimal" placeholder="kcal / 100g" />
        <input value={source.proteinPer100g ?? ""} onChange={(event) => onChange({ ...source, proteinPer100g: numberValue(event.target.value) })} inputMode="decimal" placeholder="蛋白质 g" />
        <input value={source.fatPer100g ?? ""} onChange={(event) => onChange({ ...source, fatPer100g: numberValue(event.target.value) })} inputMode="decimal" placeholder="脂肪 g" />
        <input value={source.carbsPer100g ?? ""} onChange={(event) => onChange({ ...source, carbsPer100g: numberValue(event.target.value) })} inputMode="decimal" placeholder="碳水 g" />
      </div>
      <textarea value={source.notes || ""} onChange={(event) => onChange({ ...source, notes: event.target.value })} placeholder="可选备注，例如品牌、口味或烹饪方式" rows={2} />
      <button onClick={onSave} disabled={saving || analyzing} className="plan-primary-action plan-library-save">
        <Save size={15} />
        {saving ? "保存中" : "保存食物"}
      </button>
    </div>
  );
}

function NutritionReviewCard({ review, onChange, onCancel, onSave }: { review: { source: NutritionSourceDraft }; onChange: (source: NutritionSourceDraft) => void; onCancel: () => void; onSave: () => void }) {
  const source = review.source;
  const numberValue = (value: string) => value ? Number(value) : null;
  return (
    <div className="mt-4 rounded-lg border border-fuchsia-200 bg-fuchsia-50 p-3">
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
      <button onClick={onSave} className="mt-3 flex min-h-11 items-center gap-1.5 rounded-lg bg-fuchsia-600 px-3 text-xs font-semibold text-white transition hover:bg-fuchsia-700"><Save size={14} />保存并绑定</button>
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
  savingId,
  onSavePreset
}: {
  meals: MealEntry[];
  savingId: string | null;
  onSavePreset: (meal: MealEntry) => void;
}) {
  const [detailSlot, setDetailSlot] = useState<MealSlot | "all" | null>(null);
  const detailMeals = detailSlot === "all" ? meals : meals.filter((meal) => meal.mealSlot === detailSlot);
  return (
    <section className="journal-section">
      <div className="journal-section-heading">
        <h2 className="journal-section-title">今日饮食记录</h2>
        <button type="button" onClick={() => setDetailSlot("all")} className="journal-section-link">查看全部 <ChevronRight size={15} /></button>
      </div>
      <div className="journal-meal-grid">
        {MEAL_SLOTS.map((slot) => {
          const slotMeals = meals.filter((meal) => meal.mealSlot === slot.key);
          const kcal = slotMeals.reduce((total, meal) => total + (meal.finalKcal || 0), 0);
          const latest = slotMeals[0] || null;
          return (
            <button type="button" key={slot.key} onClick={() => setDetailSlot(slot.key)} className="journal-meal-card">
              <span className="journal-meal-meta"><strong>{slot.label}</strong><small>{latest ? mealTime(latest.createdAt, slot.time) : slot.time}</small></span>
              <span className="journal-meal-kcal">{latest ? kcal : "--"} <small>kcal</small></span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={slot.image} alt="" />
            </button>
          );
        })}
      </div>
      {detailSlot ? (
        <BottomSheet title={detailSlot === "all" ? "今日饮食记录" : `${mealSlotLabel(detailSlot)}记录`} onClose={() => setDetailSlot(null)}>
          <div className="space-y-3">
            {detailMeals.length ? detailMeals.map((meal) => (
              <div key={meal.id} className="journal-meal-detail">
                <MealThumbnail url={meal.compressedImageUrl || meal.imageUrl || defaultMealImage(meal.mealSlot)} label="餐食图片" compact />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-3">
                    <strong className="truncate text-sm">{meal.items.map((item) => item.name).join("、") || "餐食"}</strong>
                    <span className="shrink-0 text-sm font-semibold">{meal.finalKcal} kcal</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{mealSlotLabel(meal.mealSlot)} · {mealTime(meal.createdAt, "")}</p>
                  <button type="button" onClick={() => onSavePreset(meal)} disabled={savingId === meal.id} className="journal-save-preset">
                    <BookmarkPlus size={14} />
                    {savingId === meal.id ? "保存中" : "存为常用"}
                  </button>
                </div>
              </div>
            )) : <p className="wellness-empty-note">这一餐还没有记录</p>}
          </div>
        </BottomSheet>
      ) : null}
    </section>
  );
}

function MealThumbnail({ url, label, compact }: { url: string | null; label: string; compact?: boolean }) {
  const sizeClass = compact ? "h-14 w-14" : "h-28 w-full sm:h-full sm:min-h-24 sm:w-28";
  if (!url) {
    return (
      <div className={`${sizeClass} flex shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white/80 text-slate-400`} aria-label={`${label}暂无图片`}>
        <FileText size={16} />
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

function signedDeficitText(value: number | null | undefined) {
  if (value == null) return "--";
  const rounded = Math.round(value);
  if (rounded === 0) return "0";
  return rounded > 0 ? `-${rounded}` : `+${Math.abs(rounded)}`;
}

function tabTransitionDirection(current: AppTab, next: AppTab): TabTransitionDirection {
  const currentIndex = TAB_ORDER.indexOf(current);
  const nextIndex = TAB_ORDER.indexOf(next);
  if (currentIndex === -1 || nextIndex === -1 || currentIndex === nextIndex) return "none";
  return nextIndex > currentIndex ? "forward" : "back";
}

function defaultMealSlot(): MealSlot {
  const hour = new Date().getHours();
  if (hour < 10) return "breakfast";
  if (hour < 14) return "lunch";
  if (hour < 20) return "dinner";
  return "snack";
}

function mealSlotLabel(slot: MealSlot) {
  return MEAL_SLOTS.find((item) => item.key === slot)?.label || "加餐";
}

function mealPreferenceLabel(preference: MealPreference) {
  return MEAL_PREFERENCES.find((item) => item.key === preference)?.label || preference;
}

function defaultMealImage(slot: MealSlot) {
  return MEAL_SLOTS.find((item) => item.key === slot)?.image || "/illustrations/meal-snack.png";
}

function mealTime(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatWeightTime(value: string | null | undefined) {
  return value ? mealTime(value, "") : "";
}

async function compressImageForUpload(file: File) {
  if (!file.type.startsWith("image/")) return file;

  const image = await loadBrowserImage(file);
  const maxEdge = 1280;
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return file;
  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.78));
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "meal"}.jpg`, {
    type: "image/jpeg",
    lastModified: file.lastModified
  });
}

function loadBrowserImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片读取失败"));
    };
    image.src = url;
  });
}

function seconds(milliseconds: number) {
  return `${(milliseconds / 1000).toFixed(1)} 秒`;
}

function looksMojibake(value: string) {
  return /[锟介敓]/.test(value);
}
