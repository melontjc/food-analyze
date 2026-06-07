"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
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
  Home,
  Image as ImageIcon,
  Leaf,
  Menu,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Send,
  ChefHat,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  Utensils,
  UserRound,
  Weight,
  X
} from "lucide-react";

type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";
type MealPreference = "light" | "takeout" | "homemade" | "photo";
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
export type DashboardPayload = Dashboard;
export type MealPresetPayload = MealPreset;

type AppTab = "home" | "quick" | "capture" | "trends" | "more";
type TabTransitionDirection = "forward" | "back" | "none";
type TabTransitionVariant = "lateral" | "capture" | "panel";
type AnalysisPhase = "idle" | "compressing" | "recognizing";
type QuickStudioView = "presets" | "library" | "ai";
type ManualPresetItem = {
  id: string;
  nutritionSourceId: string;
  grams: string;
};
type MealAnalysisTimings = {
  clientCompressionMs: number;
  serverCompressionMs: number;
  blobUploadMs: number;
  openAiMs: number;
  databaseMs: number;
  totalServerMs: number;
};
type ConnectionStatus = {
  oura: { connected: boolean; scope: string | null; expiresAt: number | null };
  intervals: { connected: boolean; athleteId: string };
};

const loadAnalysisPage = () => import("./dashboard-analysis-page");

const AnalysisPage = dynamic(loadAnalysisPage, {
  ssr: false,
  loading: () => (
    <section className="analysis-page">
      <div className="analysis-empty-card">
        <strong>正在准备分析</strong>
        <p>图表和洞察会在进入分析页时加载。</p>
      </div>
    </section>
  )
});

const TAB_ORDER: AppTab[] = ["home", "quick", "capture", "trends", "more"];
const APP_TABS = new Set<AppTab>(TAB_ORDER);
const TAB_TRANSITION_MS = 280;
const MEAL_SLOTS: Array<{ key: MealSlot; label: string; time: string; image: string }> = [
  { key: "breakfast", label: "早餐", time: "08:00", image: "/illustrations/meal-breakfast.webp" },
  { key: "lunch", label: "午餐", time: "12:30", image: "/illustrations/meal-lunch.webp" },
  { key: "dinner", label: "晚餐", time: "18:30", image: "/illustrations/meal-dinner.webp" },
  { key: "snack", label: "加餐", time: "15:30", image: "/illustrations/meal-snack.webp" }
];
const MEAL_PREFERENCES: Array<{ key: MealPreference; label: string; hint: string }> = [
  { key: "light", label: "清淡", hint: "少油少盐" },
  { key: "takeout", label: "外卖", hint: "门店估算" },
  { key: "homemade", label: "自制", hint: "家常做法" },
  { key: "photo", label: "拍照", hint: "照片优先" }
];
const QUICK_STUDIO_TABS: Array<{ key: QuickStudioView; label: string; hint: string }> = [
  { key: "presets", label: "常用模板", hint: "快速计入" },
  { key: "library", label: "营养库", hint: "成分表" },
  { key: "ai", label: "AI 新建", hint: "自动拆解" }
];

type DashboardTailAdminClientProps = {
  initialDate: string;
  initialDashboard: Dashboard | null;
  initialPresets: MealPreset[];
};

export default function DashboardTailAdminClient({ initialDate, initialDashboard, initialPresets }: DashboardTailAdminClientProps) {
  const [dateKey, setDateKey] = useState(initialDate);
  const [dashboard, setDashboard] = useState<Dashboard | null>(initialDashboard);
  const [presets, setPresets] = useState<MealPreset[]>(initialPresets);
  const [draft, setDraft] = useState<MealEntry | null>(null);
  const [kcal, setKcal] = useState("");
  const [mealContext, setMealContext] = useState("");
  const [weightInput, setWeightInput] = useState(() => (initialDashboard?.today.weightKg == null ? "" : String(initialDashboard.today.weightKg)));
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
  const [tabTransitionVariant, setTabTransitionVariant] = useState<TabTransitionVariant>("lateral");
  const [tabStageMinHeight, setTabStageMinHeight] = useState<number | null>(null);
  const [mealSlot, setMealSlot] = useState<MealSlot>(() => defaultMealSlot());
  const [mealPreferences, setMealPreferences] = useState<MealPreference[]>([]);
  const [pendingPresetUse, setPendingPresetUse] = useState<{ preset: MealPreset; items: Array<{ id: string; grams: number | null }> } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const tabStageRef = useRef<HTMLDivElement>(null);
  const activePanelRef = useRef<HTMLDivElement>(null);
  const leavingPanelRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<AppTab>("home");
  const tabInitializedRef = useRef(false);
  const initialDashboardDateRef = useRef(initialDashboard?.dateKey || null);
  const initialPresetsLoadedRef = useRef(true);
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
    if (initialDashboardDateRef.current === dateKey) {
      initialDashboardDateRef.current = null;
      return;
    }
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
    if (initialPresetsLoadedRef.current) {
      initialPresetsLoadedRef.current = false;
      return;
    }
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
    if (nextTab === "trends") void loadAnalysisPage();
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
      setTabTransitionVariant("lateral");
      setTabStageMinHeight(null);
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }

    if (nextTab === currentTab) {
      setActiveTab(nextTab);
      setLeavingTab(null);
      setTabDirection("none");
      setTabTransitionVariant("lateral");
      setTabStageMinHeight(null);
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }

    const direction = tabTransitionDirection(currentTab, nextTab);
    const currentHeight = activePanelRef.current?.getBoundingClientRect().height || tabStageRef.current?.getBoundingClientRect().height || 0;
    activeTabRef.current = nextTab;
    setTabDirection(direction);
    setTabTransitionVariant(tabTransitionVariantFor(currentTab, nextTab));
    setTabStageMinHeight(currentHeight > 0 ? Math.ceil(currentHeight) : null);
    setLeavingTab(currentTab);
    setActiveTab(nextTab);
    window.scrollTo({ top: 0, behavior: "auto" });
    tabTransitionTimerRef.current = setTimeout(() => {
      setLeavingTab(null);
      setTabStageMinHeight(null);
      tabTransitionTimerRef.current = null;
    }, TAB_TRANSITION_MS);
  }, []);

  useLayoutEffect(() => {
    if (!leavingTab) return;
    const frame = window.requestAnimationFrame(() => {
      const activeHeight = activePanelRef.current?.getBoundingClientRect().height || 0;
      const leavingHeight = leavingPanelRef.current?.getBoundingClientRect().height || 0;
      const nextHeight = Math.max(activeHeight, leavingHeight);
      if (nextHeight > 0) setTabStageMinHeight(Math.ceil(nextHeight));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, leavingTab]);

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
    if (tab === "trends") void loadAnalysisPage();
    if (window.location.hash === `#${tab}`) {
      applyTab(tab);
      return;
    }
    window.location.hash = tab;
  }, [applyTab]);

  const prepareTab = useCallback((tab: AppTab) => {
    if (tab === "trends") void loadAnalysisPage();
  }, []);

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
          <MorePage dashboard={dashboard} syncing={syncing} onSync={syncNow} />
        ) : null}
        {tab !== "capture" && error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      </>
    );
  }

  const tabStageClassName = leavingTab
    ? `app-tab-stage app-tab-stage-transitioning app-tab-transition-${tabTransitionVariant}`
    : "app-tab-stage";
  const tabStageStyle = tabStageMinHeight == null ? undefined : { minHeight: `${tabStageMinHeight}px` };

  return (
    <main className="wellness-shell text-slate-900">
      <div className="wellness-app">
        <AppHeader dashboard={dashboard} onNavigate={navigateTo} />
        <section className="px-4 pb-4">
          <div ref={tabStageRef} className={tabStageClassName} style={tabStageStyle}>
            {leavingTab ? (
              <div
                ref={leavingPanelRef}
                key={`leaving-${leavingTab}`}
                className={`app-tab-panel app-tab-exit app-tab-exit-${tabDirection} app-tab-exit-${tabTransitionVariant} space-y-4`}
              >
                {renderTab(leavingTab)}
              </div>
            ) : null}
            <div
              ref={activePanelRef}
              key={`active-${activeTab}`}
              className={`app-tab-panel app-tab-enter app-tab-enter-${tabDirection} app-tab-enter-${tabTransitionVariant} space-y-4`}
            >
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
              className="plan-primary-action bottom-sheet-full-action bottom-sheet-spaced-action"
            >
              计入{mealSlotLabel(mealSlot)}
            </button>
          </BottomSheet>
        ) : null}
        <BottomNavigation activeTab={activeTab} onNavigate={navigateTo} onPrepare={prepareTab} />
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

function BottomNavigation({
  activeTab,
  onNavigate,
  onPrepare
}: {
  activeTab: AppTab;
  onNavigate: (tab: AppTab) => void;
  onPrepare: (tab: AppTab) => void;
}) {
  const activeIndex = Math.max(0, TAB_ORDER.indexOf(activeTab));
  const navStyle = { "--active-index": activeIndex } as React.CSSProperties & { "--active-index": number };
  return (
    <nav className="wellness-bottom-nav" aria-label="应用导航" style={navStyle}>
      <BottomNavItem icon={<Home size={21} strokeWidth={1.8} />} label="首页" active={activeTab === "home"} onClick={() => onNavigate("home")} onPrepare={() => onPrepare("home")} />
      <BottomNavItem icon={<ClipboardList size={21} strokeWidth={1.8} />} label="计划" active={activeTab === "quick"} onClick={() => onNavigate("quick")} onPrepare={() => onPrepare("quick")} />
      <BottomNavItem icon={<Plus size={29} strokeWidth={1.8} />} label="记一餐" active={activeTab === "capture"} primary onClick={() => onNavigate("capture")} onPrepare={() => onPrepare("capture")} />
      <BottomNavItem icon={<ChartPie size={21} strokeWidth={1.8} />} label="分析" active={activeTab === "trends"} onClick={() => onNavigate("trends")} onPrepare={() => onPrepare("trends")} />
      <BottomNavItem icon={<UserRound size={22} strokeWidth={1.8} />} label="我的" active={activeTab === "more"} onClick={() => onNavigate("more")} onPrepare={() => onPrepare("more")} />
    </nav>
  );
}

function BottomNavItem({
  icon,
  label,
  active,
  primary,
  onClick,
  onPrepare
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  primary?: boolean;
  onClick: () => void;
  onPrepare: () => void;
}) {
  if (primary) {
    return (
      <button type="button" onClick={onClick} onPointerEnter={onPrepare} onFocus={onPrepare} className="group relative flex min-h-14 min-w-0 items-center justify-center outline-none" aria-label={label}>
        <span className={`journal-primary-nav absolute -top-5 flex h-14 w-14 items-center justify-center rounded-full text-white transition duration-200 group-active:translate-y-0.5 group-active:scale-[0.98] ${active ? "journal-primary-nav-active scale-[1.04]" : ""}`}>
          {icon}
        </span>
        <span className="sr-only">{label}</span>
      </button>
    );
  }

  return (
    <button type="button" onClick={onClick} onPointerEnter={onPrepare} onFocus={onPrepare} className={`journal-nav-item group flex min-h-14 min-w-0 flex-col items-center justify-center px-1 outline-none transition duration-200 ${active ? "journal-nav-item-active" : ""}`}>
      <span className={`journal-nav-icon transition-transform duration-200 group-active:translate-y-0.5 group-active:scale-95 ${active ? "scale-105" : "scale-100"}`}>{icon}</span>
      <span className="journal-nav-label">{label}</span>
    </button>
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
    { label: "记一餐", hint: "记录饮食", image: "/illustrations/shortcut-meal.webp", onClick: () => onNavigate("capture") },
    { label: "记运动", hint: "即将开放", image: "/illustrations/shortcut-exercise.webp", disabled: true },
    { label: "记体重", hint: "每天记录", image: "/illustrations/shortcut-weight.webp", onClick: onWeight },
    { label: "查看趋势", hint: "数据洞察", image: "/illustrations/shortcut-trend.webp", onClick: () => onNavigate("trends") }
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
            <img src={item.image} alt="" loading="lazy" decoding="async" />
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
        <button type="button" onClick={onViewAll} className="wellness-text-link">
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
                 <p className="meal-preset-title">{preset.name}</p>
                 <p className="meal-preset-meta">{preset.baseKcal} kcal</p>
              </button>
              <button type="button" onClick={() => onUse(preset, presetItems(preset))} disabled={addingId === preset.id} className="meal-preset-primary">
                <Plus size={15} />
                {addingId === preset.id ? "计入中" : "直接计入"}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <button type="button" onClick={onViewAll} className="wellness-empty-action">
          添加第一个常用餐食
        </button>
      )}
      {adjusting ? (
        <BottomSheet title="调整本次克数" onClose={() => setAdjusting(null)}>
          <div className="bottom-sheet-stack">
            <p className="bottom-sheet-note">{adjusting.name} · 仅影响本次计入</p>
            {adjusting.items.map((item) => (
              <label key={item.id} className="bottom-sheet-edit-card">
                <span className="bottom-sheet-edit-title">{item.name}</span>
                <GramsSelect value={grams[item.id] || ""} onChange={(value) => setGrams((current) => ({ ...current, [item.id]: value }))} label={`${item.name} 本次克数`} />
              </label>
            ))}
            <button type="button" onClick={() => { onUse(adjusting, adjustedItems(adjusting)); setAdjusting(null); }} className="plan-primary-action bottom-sheet-full-action">
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
      <button type="button" onClick={onClose} className="bottom-sheet-backdrop" aria-label="关闭弹层" />
      <section className="bottom-sheet-panel">
        <div className="bottom-sheet-handle" />
        <div className="bottom-sheet-header">
          <h3 className="bottom-sheet-title">{title}</h3>
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
  const [connectionFailed, setConnectionFailed] = useState(false);
  const synced = Boolean(dashboard?.today.syncedAt);
  const syncedText = formatSyncDate(dashboard?.today.syncedAt);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/connections/status")
      .then((response) => {
        if (!response.ok) throw new Error("connection status unavailable");
        return response.json() as Promise<ConnectionStatus>;
      })
      .then((data) => {
        if (!cancelled) {
          setStatus(data);
          setConnectionFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setConnectionFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="more-page">
      <div className="more-hero">
        <div className="more-hero-copy">
          <p>我的数据</p>
          <h1>我的</h1>
          <span>管理同步、数据源和账户设置。</span>
        </div>
        <span className={synced ? "more-status-pill more-status-pill-ready" : "more-status-pill"}>
          <CircleCheckBig size={15} />
          {synced ? "已同步" : "待同步"}
        </span>
      </div>

      <section className="more-card">
        <div className="more-card-head">
          <span className="more-card-icon"><RefreshCw size={20} className={syncing ? "animate-spin" : ""} /></span>
          <div>
            <p>同步状态</p>
            <h2>同步状态</h2>
            <span>{syncedText}</span>
          </div>
        </div>
        <button type="button" onClick={onSync} disabled={syncing} className="more-primary-action">
          <RefreshCw size={18} className={syncing ? "animate-spin" : ""} />
          {syncing ? "正在同步" : "立即同步"}
        </button>
      </section>

      <section className="more-card">
        <div className="more-card-head">
          <span className="more-card-icon"><Database size={20} /></span>
          <div>
            <p>数据源</p>
            <h2>数据源</h2>
            <span>消耗与训练参考连接</span>
          </div>
        </div>
        <div className="more-connection-list">
          <ConnectionRow label="Oura 总消耗" connected={status?.oura.connected} failed={connectionFailed} />
          <ConnectionRow label="Intervals.icu 参考" connected={status?.intervals.connected} failed={connectionFailed} />
        </div>
        <Link href="/settings" className="more-setting-link">
          数据源详细设置
          <ChevronRight size={17} />
        </Link>
      </section>
    </section>
  );
}

function ConnectionRow({ label, connected, failed }: { label: string; connected: boolean | undefined; failed?: boolean }) {
  const statusText = connected ? "已连接" : connected === false ? "未连接" : failed ? "暂不可用" : "读取中";
  return (
    <div className="more-connection-row">
      <span>{label}</span>
      <strong className={connected ? "more-connection-ready" : failed ? "more-connection-error" : ""}>{statusText}</strong>
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
          <span>拍照上传餐食，AI 智能识别营养</span>
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
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const contextLimit = 200;
  const contextCount = mealContext.length;
  const loadingTitle = analysisPhase === "compressing" ? "正在压缩图片" : "AI 正在识图";
  const loadingText = analysisPhase === "compressing" ? "正在减少图片体积，节省上传时间" : "正在识别食物种类并估测热量";
  const actionTitle = loading ? loadingTitle : hasDraft ? "根据说明重新识别" : "开始 AI 识别";
  const actionHint = loading ? loadingText : hasDraft ? "更新营养草稿" : "识别营养与热量";
  const photoStageClassName = [
    "capture-photo-stage",
    previewUrl ? "capture-photo-stage-preview" : "",
    loading ? "capture-photo-stage-processing" : ""
  ].filter(Boolean).join(" ");

  return (
    <section className="capture-workflow">
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
      <input
        ref={cameraInputRef}
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

      <section className="capture-photo-card" aria-label="上传餐食照片">
        <button
          type="button"
          onClick={onPick}
          disabled={loading}
          aria-label={previewUrl ? "更换餐食照片" : "上传餐食照片"}
          className={photoStageClassName}
        >
          <span className="capture-frame-corner capture-frame-corner-tl" />
          <span className="capture-frame-corner capture-frame-corner-tr" />
          <span className="capture-frame-corner capture-frame-corner-bl" />
          <span className="capture-frame-corner capture-frame-corner-br" />
          {previewUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="待分析餐食" className="capture-preview-image" />
              <span className="capture-replace-pill">轻触更换</span>
              <span className="capture-file-meta">
                <small>{selectedFile?.name || "已选择图片"}</small>
                <small>{selectedFile ? `${(selectedFile.size / 1024 / 1024).toFixed(1)} MB` : ""}</small>
              </span>
            </>
          ) : (
            <>
              <span className="capture-scan-line" />
              <span className="capture-upload-art" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/illustrations/meal-lunch.webp" alt="" loading="lazy" decoding="async" />
                <span><Plus size={25} /></span>
              </span>
              <strong>上传餐食照片</strong>
              <small>支持高清拍照或从相册选择</small>
            </>
          )}
          {loading ? (
            <span className="capture-loading-layer">
              <CloudCog size={48} className="animate-pulse" />
              <strong>{loadingTitle}</strong>
              <small>{loadingText}</small>
            </span>
          ) : null}
        </button>
        <div className="capture-photo-actions">
          <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={loading}>
            <Camera size={18} />
            {previewUrl ? "重新拍照" : "拍照"}
          </button>
          <button type="button" onClick={onPick} disabled={loading}>
            <ImageIcon size={18} />
            {previewUrl ? "更换照片" : "从相册选择"}
          </button>
        </div>
      </section>

      <label className="capture-text-card">
        <span className="capture-block-title capture-block-title-row">
          <span className="capture-block-icon"><Pencil size={18} /></span>
          <span>
            <p>文字补充</p>
            <small>描述食材、烹饪方式、调味或进食感受（可选）</small>
          </span>
        </span>
        <textarea
          value={mealContext}
          onChange={(event) => onContext(event.target.value)}
          maxLength={contextLimit}
          rows={3}
          className="capture-textarea"
          placeholder="例如：清蒸鲈鱼，少油少盐；米饭一小碗，炒青菜适量。"
        />
        <span className="capture-text-count">{contextCount}/{contextLimit}</span>
      </label>

      <div className="capture-preference-card">
        <div className="capture-block-title capture-block-title-row">
          <span className="capture-block-icon"><SlidersHorizontal size={18} /></span>
          <span>
            <p>识别偏好</p>
            <small>为 AI 提供更多背景，提升识别准确度</small>
          </span>
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
                {mealPreferenceIcon(item.key)}
                <strong>{item.label}</strong>
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={onAnalyze}
        disabled={loading}
        className="capture-cta"
      >
        {loading ? <CloudCog size={23} className="animate-pulse" /> : <Sparkles size={26} />}
        <span>
          <strong>{actionTitle}</strong>
          <small>{actionHint}</small>
        </span>
      </button>
      {error ? <p className="capture-error">{error}</p> : null}
      {draftContent ? <div className="capture-draft-wrap">{draftContent}</div> : null}
    </section>
  );
}

function mealPreferenceIcon(preference: MealPreference) {
  if (preference === "light") return <Leaf size={18} />;
  if (preference === "takeout") return <ShoppingBag size={18} />;
  if (preference === "homemade") return <ChefHat size={18} />;
  return <Camera size={18} />;
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
        <img src="/illustrations/wellness-ingredients.webp" alt="" className="journal-weight-illustration" loading="lazy" decoding="async" />
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
  const [manualCreating, setManualCreating] = useState(false);
  const [manualPresetName, setManualPresetName] = useState("");
  const [manualItems, setManualItems] = useState<ManualPresetItem[]>(() => [emptyManualPresetItem()]);
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
  const manualBuilderRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!manualCreating || studioView !== "presets") return;
    const frame = window.requestAnimationFrame(() => {
      manualBuilderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [manualCreating, studioView]);

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

  function updateManualItem(itemId: string, patch: Partial<ManualPresetItem>) {
    setManualItems((current) => current.map((item) => (item.id === itemId ? { ...item, ...patch } : item)));
  }

  function resetManualPreset() {
    setManualPresetName("");
    setManualItems([emptyManualPresetItem()]);
  }

  async function saveManualPreset() {
    const selectedItems = manualItems.map((item) => {
      const source = nutritionSources.find((candidate) => candidate.id === item.nutritionSourceId);
      const gramsValue = parsePositiveGrams(item.grams);
      if (!source || gramsValue == null) return null;
      const kcal = Math.round((source.kcalPer100g * gramsValue) / 100);
      return {
        name: source.name,
        portion: `${gramsValue}g`,
        defaultGrams: gramsValue,
        kcal,
        confidence: source.confidence,
        calculationSource: "nutrition_label",
        nutritionSourceId: source.id
      };
    }).filter((item): item is {
      name: string;
      portion: string;
      defaultGrams: number;
      kcal: number;
      confidence: number | null;
      calculationSource: string;
      nutritionSourceId: string;
    } => Boolean(item));

    if (!nutritionSources.length) return onError("请先在营养库添加食物，再本地搭配模板");
    if (manualHasIncompleteRows) return onError("请补完整每一行的食物和克数，或删除未完成的行");
    if (!selectedItems.length) return onError("请选择营养库食物并填写克数");

    setSavingId("manual");
    const response = await fetch("/api/meal-presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: manualPresetName.trim() || selectedItems.map((item) => item.name).join("、").slice(0, 60) || "本地搭配模板",
        imageUrl: null,
        description: "本地营养库搭配",
        baseKcal: selectedItems.reduce((total, item) => total + item.kcal, 0),
        items: selectedItems
      })
    });
    const data = await response.json().catch(() => ({}));
    setSavingId(null);
    if (!response.ok) return onError(data.error || "本地模板保存失败");
    resetManualPreset();
    setManualCreating(false);
    await onReload();
  }

  const expandedPreset = presets.find((preset) => preset.id === expandedId) || null;
  const expandedItems = expandedPreset ? editableItems[expandedPreset.id] || expandedPreset.items : [];
  const favoritePreset = presets.reduce<MealPreset | null>((best, preset) => {
    if (!best) return preset;
    return preset.usageCount > best.usageCount ? preset : best;
  }, null);
  const hasCreateInput = Boolean(createFile || createDescription.trim());
  const manualRows = manualItems.map((item) => {
    const source = nutritionSources.find((candidate) => candidate.id === item.nutritionSourceId) || null;
    const gramsValue = parsePositiveGrams(item.grams);
    return {
      item,
      source,
      gramsValue,
      hasInput: Boolean(item.nutritionSourceId || item.grams.trim()),
      kcal: source && gramsValue != null ? Math.round((source.kcalPer100g * gramsValue) / 100) : 0
    };
  });
  const manualTotalKcal = manualRows.reduce((total, row) => total + row.kcal, 0);
  const manualHasIncompleteRows = manualRows.some((row) => row.hasInput && (!row.source || row.gramsValue == null));
  const manualValidItemCount = manualRows.filter((row) => row.source && row.gramsValue != null).length;
  const manualCanSave = Boolean(nutritionSources.length && manualValidItemCount && !manualHasIncompleteRows && manualTotalKcal > 0);

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
            <button type="button" onClick={() => setManualCreating((value) => !value)} className="plan-soft-button">
              <Plus size={15} />
              {manualCreating ? "收起" : "新建"}
            </button>
          </div>
          {manualCreating ? (
            <div ref={manualBuilderRef} className="plan-manual-builder">
              <div className="plan-new-preset-head">
                <div>
                  <p>LOCAL BUILDER</p>
                  <h3>本地搭配模板</h3>
                </div>
                <span>{manualTotalKcal} kcal</span>
              </div>
              {nutritionSources.length ? (
                <label className="plan-field">
                  <span>模板名称</span>
                  <input value={manualPresetName} onChange={(event) => setManualPresetName(event.target.value)} placeholder="例如：工作日早餐" />
                </label>
              ) : null}
              {nutritionSources.length ? (
                <div className="plan-manual-items">
                  {manualRows.map(({ item, source, gramsValue, kcal, hasInput }, index) => {
                    const incomplete = hasInput && (!source || gramsValue == null);
                    return (
                      <div key={item.id} className="plan-manual-item">
                        <label>
                          <span>营养库食物</span>
                          <select value={item.nutritionSourceId} onChange={(event) => updateManualItem(item.id, { nutritionSourceId: event.target.value })}>
                            <option value="">选择食物</option>
                            {nutritionSources.map((sourceItem) => (
                              <option key={sourceItem.id} value={sourceItem.id}>{sourceItem.name} · {sourceItem.kcalPer100g} kcal/100g</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>默认克数</span>
                          <input value={item.grams} onChange={(event) => updateManualItem(item.id, { grams: event.target.value })} inputMode="decimal" placeholder="例如 120" aria-invalid={incomplete && item.grams.trim() ? true : undefined} />
                        </label>
                        <div className="plan-manual-item-foot">
                          <small className={incomplete ? "plan-manual-warning" : undefined}>{incomplete ? "请选择食物并填写大于 0 的克数" : source ? `${source.name} · ${kcal} kcal` : "从营养库选择后自动换算热量"}</small>
                          <button type="button" onClick={() => setManualItems((current) => current.filter((candidate) => candidate.id !== item.id))} disabled={manualItems.length <= 1} aria-label={`删除第 ${index + 1} 项`}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="plan-manual-empty">
                  <Database size={18} />
                  <strong>先建立营养库</strong>
                  <span>本地创建会按照营养库食物和克数自动换算热量。</span>
                  <button type="button" onClick={() => setStudioView("library")} className="plan-secondary-action">去添加食物</button>
                </div>
              )}
              {nutritionSources.length ? (
                <div className="plan-manual-actions">
                  <button type="button" onClick={() => setManualItems((current) => [...current, emptyManualPresetItem()])} disabled={savingId === "manual"} className="plan-secondary-action">
                    <Plus size={15} />
                    添加食物
                  </button>
                  <button type="button" onClick={saveManualPreset} disabled={savingId === "manual" || !manualCanSave} className="plan-primary-action">
                    <Save size={15} />
                    {savingId === "manual" ? "保存中" : "保存模板"}
                  </button>
                </div>
              ) : null}
              {nutritionSources.length ? (
                <p className={manualHasIncompleteRows ? "plan-manual-helper plan-manual-warning" : "plan-manual-helper"}>
                  {manualHasIncompleteRows ? "有一行还没补完整，完善后即可保存。" : manualValidItemCount ? `${manualValidItemCount} 项食物，预计 ${manualTotalKcal} kcal。` : "从营养库选择食物，再填写默认克数。"}
                </p>
              ) : null}
              <button type="button" onClick={() => setStudioView("ai")} className="plan-ai-link">
                需要图片识别？切换到 AI 自动拆解
              </button>
            </div>
          ) : null}
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
          ) : manualCreating ? null : (
            <div className="plan-empty-card">
              <Sparkles size={18} />
              <strong>还没有常用餐食</strong>
              <span>优先从营养库本地搭配，也可以去 AI 新建自动拆解。</span>
              <button type="button" onClick={() => setManualCreating(true)} className="plan-primary-action">本地新建</button>
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
          <div className="bottom-sheet-stack">
            <p className="bottom-sheet-note">从个人营养库选择食物，或使用自定义名称。填写本次计入克数后，系统会按每 100g 热量精确换算。</p>
            {expandedItems.map((item, index) => (
              <div key={item.id} className="plan-edit-card">
                <PresetItemEditor item={item} nutritionSources={nutritionSources} onChange={(patch) => updateEditableItem(expandedPreset.id, index, patch)} onSelectSource={(source) => updateEditableItem(expandedPreset.id, index, bindNutritionSource(item, source, currentGrams(item)))} onDelete={() => setEditableItems((current) => ({ ...current, [expandedPreset.id]: expandedItems.filter((_, itemIndex) => itemIndex !== index) }))} />
                <div className="plan-edit-divider">
                  <label className="plan-edit-field">
                    <span>本次计入克数</span>
                    <GramsSelect value={currentGrams(item)} onChange={(value) => setCurrentGrams(item.id, value)} label={`${item.name} 本次克数`} />
                  </label>
                  <label className="plan-upload-inline">
                    <FileText size={14} />
                    {nutritionUploading === `${expandedPreset.id}-${index}` ? "识别中" : item.nutritionSource ? "替换成分表" : "上传成分表"}
                    <input type="file" accept="image/*" className="hidden" disabled={Boolean(nutritionUploading)} onChange={(event) => event.target.files?.[0] && analyzeNutrition(event.target.files[0], expandedPreset, index)} />
                  </label>
                </div>
                <p className="plan-source-note">
                  {item.nutritionSource ? `营养库：${item.nutritionSource.name} · ${item.nutritionSource.kcalPer100g} kcal/100g` : "未绑定成分表，修改克数时由 AI 复核"}
                </p>
              </div>
            ))}
            {nutritionReview ? (
              <NutritionReviewCard review={nutritionReview} onChange={(source) => setNutritionReview({ ...nutritionReview, source })} onCancel={() => setNutritionReview(null)} onSave={saveNutritionSource} />
            ) : null}
            <div className="plan-edit-actions">
              <button onClick={() => setEditableItems((current) => ({ ...current, [expandedPreset.id]: [...expandedItems, emptyPresetItem(expandedPreset.id)] }))} className="plan-secondary-action">
                <Plus size={14} /> 添加食物
              </button>
              <button onClick={() => savePresetItems(expandedPreset)} disabled={savingId === expandedPreset.id} className="plan-secondary-action plan-secondary-action-accent">
                <Save size={14} /> {savingId === expandedPreset.id ? "保存中" : "保存模板"}
              </button>
            </div>
            <button onClick={() => {
              onUse(expandedPreset, configuredItems(expandedPreset));
              setExpandedId(null);
            }} disabled={addingId === expandedPreset.id} className="plan-primary-action bottom-sheet-full-action">
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
    <div className={`plan-grams-select ${custom ? "plan-grams-select-custom" : ""}`}>
      <select value={custom ? "custom" : value} onChange={(event) => event.target.value === "custom" ? setCustom(true) : (setCustom(false), onChange(event.target.value))} className="plan-compact-control" aria-label={label}>
        <option value="">克数未填</option>
        {GRAMS_OPTIONS.slice(1, -1).map((grams) => <option key={grams} value={grams}>{grams}g</option>)}
        <option value="custom">自定义</option>
      </select>
      {custom ? <input value={value} onChange={(event) => onChange(event.target.value)} inputMode="decimal" placeholder="克数" className="plan-compact-control" aria-label={`${label}自定义`} /> : null}
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
    <div className={`plan-preset-item-editor ${showGrams ? "plan-preset-item-editor-with-grams" : ""}`}>
      <label className="plan-edit-field">
        <span>选择食物</span>
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
          className="plan-compact-control"
          aria-label={`${item.name} 选择食物`}
        >
          <option value="custom">自定义食物</option>
          {nutritionSources.map((source) => <option key={source.id} value={source.id}>{source.name} · {source.kcalPer100g} kcal/100g</option>)}
        </select>
        {!item.nutritionSourceId ? <input value={item.name} onChange={(event) => onChange({ name: event.target.value })} placeholder="填写自定义食物名称" className="plan-compact-control plan-compact-control-spaced" aria-label="自定义食物名称" /> : null}
      </label>
      {showGrams ? <label className="plan-edit-field">
        <span>计入克数</span>
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
      <button onClick={onDelete} className="plan-icon-danger plan-delete-action" aria-label={`删除 ${item.name}`}><Trash2 size={15} /></button>
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
    <div className="plan-nutrition-review">
      <div className="plan-nutrition-review-head">
        <div><p>确认营养成分表</p><span>AI 已换算为每 100g，请核对后保存到个人营养库。</span></div>
        <button onClick={onCancel} className="plan-icon-danger plan-delete-action" aria-label="关闭"><X size={17} /></button>
      </div>
      <div className="plan-nutrition-grid">
        <input value={source.name} onChange={(event) => onChange({ ...source, name: event.target.value })} className="plan-compact-control plan-nutrition-name" aria-label="食品名称" />
        <input value={source.kcalPer100g} onChange={(event) => onChange({ ...source, kcalPer100g: Number(event.target.value) })} inputMode="decimal" className="plan-compact-control" aria-label="每100克热量" />
        <input value={source.proteinPer100g ?? ""} onChange={(event) => onChange({ ...source, proteinPer100g: numberValue(event.target.value) })} inputMode="decimal" placeholder="蛋白质 g" className="plan-compact-control" />
        <input value={source.fatPer100g ?? ""} onChange={(event) => onChange({ ...source, fatPer100g: numberValue(event.target.value) })} inputMode="decimal" placeholder="脂肪 g" className="plan-compact-control" />
        <input value={source.carbsPer100g ?? ""} onChange={(event) => onChange({ ...source, carbsPer100g: numberValue(event.target.value) })} inputMode="decimal" placeholder="碳水 g" className="plan-compact-control" />
      </div>
      <p className="plan-source-note">热量：{source.kcalPer100g || 0} kcal / 100g{source.notes ? ` · ${source.notes}` : ""}</p>
      <button onClick={onSave} className="plan-primary-action plan-nutrition-save"><Save size={14} />保存并绑定</button>
    </div>
  );
}

function emptyPresetItem(presetId: string): MealPresetItem {
  return { id: `${presetId}-${Date.now()}`, name: "新食物", portion: null, defaultGrams: null, kcal: 0, confidence: null, calculationSource: null, nutritionSourceId: null, nutritionSource: null };
}

function emptyManualPresetItem(): ManualPresetItem {
  return { id: `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`, nutritionSourceId: "", grams: "" };
}

function parsePositiveGrams(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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
              <img src={slot.image} alt="" loading="lazy" decoding="async" />
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
      <img src={url} alt={label} className="h-full w-full object-cover" loading="lazy" decoding="async" />
    </div>
  );
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

function tabTransitionVariantFor(current: AppTab, next: AppTab): TabTransitionVariant {
  if (current === "capture" || next === "capture") return "capture";
  if (current === "more" || next === "more") return "panel";
  return "lateral";
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
  return MEAL_SLOTS.find((item) => item.key === slot)?.image || "/illustrations/meal-snack.webp";
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

function formatSyncDate(value: string | null | undefined) {
  if (!value) return "尚未同步";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "尚未同步";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
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
