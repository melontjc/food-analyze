import { DAILY_DEFICIT_TARGET_KCAL, JIN_KCAL } from "@/lib/config";
import { addDays, dateRange, recentWeekRanges, weekRange } from "@/lib/date";
import { prisma } from "@/lib/prisma";

export async function getDashboard(dateKey: string) {
  const dates = weekRange(dateKey);
  const weekBuckets = recentWeekRanges(dateKey, 4);
  const analysisDates = dateRange(dateKey, 28);
  const summaryDates = [...dates, ...analysisDates, ...weekBuckets.flatMap((week) => week.dates)];
  const allDates = Array.from(new Set([...summaryDates, ...summaryDates.map((key) => addDays(key, -1))]));
  const [meals, burns, activities, weights] = await Promise.all([
    prisma.mealEntry.findMany({
      where: { dateKey: { in: allDates }, status: "confirmed" },
      include: { items: true },
      orderBy: { createdAt: "desc" }
    }),
    prisma.dailyBurn.findMany({ where: { dateKey: { in: allDates } } }),
    prisma.trainingActivity.findMany({ where: { dateKey: { in: allDates } }, orderBy: { startedAt: "desc" } }),
    prisma.weightEntry.findMany({ where: { dateKey: { in: allDates } } })
  ]);

  const mealsByDate = groupByDate(meals);
  const activitiesByDate = groupByDate(activities);
  const burnsByDate = new Map(burns.map((item) => [item.dateKey, item]));
  const weightsByDate = new Map(weights.map((item) => [item.dateKey, item]));

  const buildDay = (key: string) => {
    const dayMeals = mealsByDate.get(key) || [];
    const intakeKcal = dayMeals.reduce((total, meal) => total + (meal.finalKcal || 0), 0);
    const burn = burnsByDate.get(key) || null;
    const weight = weightsByDate.get(key) || null;
    const previousWeight = weightsByDate.get(addDays(key, -1)) || null;
    const totalBurnKcal = burn?.ouraTotalKcal ?? null;
    const deficitKcal = totalBurnKcal == null || dayMeals.length === 0 ? null : totalBurnKcal - intakeKcal;
    return {
      dateKey: key,
      intakeKcal,
      mealCount: dayMeals.length,
      weightKg: weight?.weightKg ?? null,
      weightRecordedAt: weight?.updatedAt ?? null,
      previousWeightKg: previousWeight?.weightKg ?? null,
      ouraRestingKcal: burn?.ouraRestingKcal ?? null,
      ouraTotalKcal: burn?.ouraTotalKcal ?? null,
      intervalsTrainingKcal: burn?.intervalsTrainingKcal ?? null,
      totalBurnKcal,
      deficitKcal,
      meals: dayMeals,
      activities: activitiesByDate.get(key) || [],
      sourceStatus: burn?.sourceStatus ?? "not_synced",
      syncedAt: burn?.syncedAt ?? null
    };
  };

  const allDays = new Map(allDates.map((key) => [key, buildDay(key)]));
  const dayFor = (key: string) => allDays.get(key) || buildDay(key);
  const days = dates.map(dayFor);
  const target = dayFor(dateKey) || days[days.length - 1];
  const weekDeficitKcal = days.reduce((total, day) => total + (day.deficitKcal || 0), 0);
  const weeks = weekBuckets.map((week) => {
    const weekDays = week.dates.map(dayFor);
    const weekWeights = weekDays.map((day) => day.weightKg).filter((weight): weight is number => weight != null);
    return {
      startDateKey: week.startDateKey,
      endDateKey: week.endDateKey,
      label: week.label,
      intakeKcal: weekDays.reduce((total, day) => total + day.intakeKcal, 0),
      deficitKcal: weekDays.reduce((total, day) => total + (day.deficitKcal || 0), 0),
      averageWeightKg: weekWeights.length ? weekWeights.reduce((total, weight) => total + weight, 0) / weekWeights.length : null
    };
  });
  const fourWeekDeficitKcal = weeks.reduce((total, week) => total + week.deficitKcal, 0);

  return {
    dateKey,
    today: target,
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

function groupByDate<T extends { dateKey: string }>(items: T[]) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(item.dateKey);
    if (group) group.push(item);
    else groups.set(item.dateKey, [item]);
  }
  return groups;
}
