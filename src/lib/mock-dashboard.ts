import { DAILY_DEFICIT_TARGET_KCAL, JIN_KCAL } from "@/lib/config";
import { dateRange, recentWeekRanges, weekRange } from "@/lib/date";

function seedFor(value: string) {
  return [...value].reduce((total, character) => (total * 31 + character.charCodeAt(0)) % 100000, 7);
}

function mockMeal(dateKey: string, index: number, kcal: number) {
  const options = [
    { name: "燕麦牛奶早餐", portion: "燕麦 45g · 牛奶 250g", mealSlot: "breakfast" },
    { name: "鸡胸肉蔬菜碗", portion: "鸡胸肉 160g · 时蔬 220g", mealSlot: "lunch" },
    { name: "香煎三文鱼", portion: "三文鱼 160g · 时蔬 180g", mealSlot: "dinner" },
    { name: "莓果酸奶", portion: "酸奶 180g · 莓果 60g", mealSlot: "snack" }
  ];
  const meal = options[index % options.length];
  return {
    id: `mock-meal-${dateKey}-${index}`,
    dateKey,
    mealSlot: meal.mealSlot,
    status: "confirmed",
    imageUrl: null,
    compressedImageUrl: null,
    userDescription: meal.portion,
    finalKcal: kcal,
    modelKcal: kcal,
    confidence: 0.9,
    uncertainty: null,
    notes: "本地演示数据",
    originalBytes: null,
    compressedBytes: null,
    createdAt: new Date(`${dateKey}T${String(8 + index * 4).padStart(2, "0")}:00:00+08:00`).toISOString(),
    items: [
      {
        id: `mock-item-${dateKey}-${index}`,
        name: meal.name,
        portion: meal.portion,
        grams: null,
        kcal,
        confidence: 0.9,
        calculationSource: "mock"
      }
    ]
  };
}

function mockDay(dateKey: string) {
  const seed = seedFor(dateKey);
  const dayIndex = Math.floor(seed / 97) % 28;
  const dinnerWave = Math.round(Math.sin(dayIndex / 2.1) * 90);
  const mealKcal = [
    380 + (seed % 52),
    545 + (seed % 118),
    430 + dinnerWave + (seed % 58),
    120 + (seed % 48)
  ];
  const mealCount = 3 + (seed % 2);
  const meals = mealKcal.slice(0, mealCount).map((kcal, index) => mockMeal(dateKey, index, kcal));
  const intakeKcal = meals.reduce((total, meal) => total + (meal.finalKcal || 0), 0);
  const totalBurnKcal = 2050 + (seed % 420);
  const dinnerKcal = mealKcal[2];
  const weightTrend = 75.8 - dayIndex * 0.035;
  const dinnerImpact = Math.max(-0.18, Math.min(0.26, (dinnerKcal - 470) / 620));
  const weightKg = Number((weightTrend + dinnerImpact + Math.sin(dayIndex / 1.7) * 0.06).toFixed(1));
  return {
    dateKey,
    intakeKcal,
    mealCount,
    weightKg,
    weightRecordedAt: new Date(`${dateKey}T07:30:00+08:00`).toISOString(),
    previousWeightKg: Number((weightKg + 0.1).toFixed(1)),
    ouraRestingKcal: totalBurnKcal - 420,
    ouraTotalKcal: totalBurnKcal,
    intervalsTrainingKcal: 280 + (seed % 260),
    totalBurnKcal,
    deficitKcal: totalBurnKcal - intakeKcal,
    meals,
    activities: [],
    sourceStatus: "mock",
    syncedAt: new Date(`${dateKey}T22:00:00+08:00`).toISOString()
  };
}

export function getMockDashboard(dateKey: string) {
  const dates = weekRange(dateKey);
  const weekBuckets = recentWeekRanges(dateKey, 4);
  const analysisDates = dateRange(dateKey, 28);
  const allDates = Array.from(new Set([...dates, ...analysisDates, ...weekBuckets.flatMap((week) => week.dates)]));
  const allDays = allDates.map(mockDay);
  const dayFor = (key: string) => allDays.find((day) => day.dateKey === key) || mockDay(key);
  const days = dates.map(dayFor);
  const today = dayFor(dateKey);
  const weekDeficitKcal = days.reduce((total, day) => total + day.deficitKcal, 0);
  const weeks = weekBuckets.map((week) => {
    const weekDays = week.dates.map(dayFor);
    return {
      startDateKey: week.startDateKey,
      endDateKey: week.endDateKey,
      label: week.label,
      intakeKcal: weekDays.reduce((total, day) => total + day.intakeKcal, 0),
      deficitKcal: weekDays.reduce((total, day) => total + day.deficitKcal, 0),
      averageWeightKg: weekDays.reduce((total, day) => total + (day.weightKg || 0), 0) / weekDays.length
    };
  });
  const fourWeekDeficitKcal = weeks.reduce((total, week) => total + week.deficitKcal, 0);

  return {
    dateKey,
    today,
    days,
    analysisDays: analysisDates.map(dayFor),
    weeks,
    weekDeficitKcal,
    sevenDayDeficitKcal: weekDeficitKcal,
    fourWeekDeficitKcal,
    predictedWeightLossJin: Math.max(0, weekDeficitKcal / JIN_KCAL),
    predictedFourWeekWeightLossJin: Math.max(0, fourWeekDeficitKcal / JIN_KCAL),
    dailyDeficitTargetKcal: DAILY_DEFICIT_TARGET_KCAL
  };
}
