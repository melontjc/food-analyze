import { JIN_KCAL } from "@/lib/config";
import { recentWeekRanges, weekRange } from "@/lib/date";

function seedFor(value: string) {
  return [...value].reduce((total, character) => (total * 31 + character.charCodeAt(0)) % 100000, 7);
}

function mockMeal(dateKey: string, index: number, kcal: number) {
  const options = [
    { name: "空气炸锅烤红薯", portion: "200g" },
    { name: "燕麦牛奶早餐", portion: "燕麦 45g · 牛奶 250g" },
    { name: "鸡胸肉蔬菜碗", portion: "鸡胸肉 160g · 时蔬 220g" }
  ];
  const meal = options[index % options.length];
  return {
    id: `mock-meal-${dateKey}-${index}`,
    dateKey,
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
  const mealKcal = [380 + (seed % 80), 560 + (seed % 140), 420 + (seed % 110)];
  const mealCount = 2 + (seed % 2);
  const meals = mealKcal.slice(0, mealCount).map((kcal, index) => mockMeal(dateKey, index, kcal));
  const intakeKcal = meals.reduce((total, meal) => total + (meal.finalKcal || 0), 0);
  const totalBurnKcal = 2050 + (seed % 420);
  return {
    dateKey,
    intakeKcal,
    mealCount,
    weightKg: Number((75.8 - (seed % 10) / 10).toFixed(1)),
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
  const allDates = Array.from(new Set([...dates, ...weekBuckets.flatMap((week) => week.dates)]));
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
    weeks,
    weekDeficitKcal,
    sevenDayDeficitKcal: weekDeficitKcal,
    fourWeekDeficitKcal,
    predictedWeightLossJin: Math.max(0, weekDeficitKcal / JIN_KCAL),
    predictedFourWeekWeightLossJin: Math.max(0, fourWeekDeficitKcal / JIN_KCAL)
  };
}
