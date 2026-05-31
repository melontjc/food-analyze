import { JIN_KCAL } from "@/lib/config";
import { recentWeekRanges, weekRange } from "@/lib/date";
import { prisma } from "@/lib/prisma";

export async function getDashboard(dateKey: string) {
  const dates = weekRange(dateKey);
  const weekBuckets = recentWeekRanges(dateKey, 4);
  const allDates = Array.from(new Set([...dates, ...weekBuckets.flatMap((week) => week.dates)]));
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

  const buildDay = (key: string) => {
    const dayMeals = meals.filter((meal) => meal.dateKey === key);
    const intakeKcal = dayMeals.reduce((total, meal) => total + (meal.finalKcal || 0), 0);
    const burn = burns.find((item) => item.dateKey === key) || null;
    const totalBurnKcal = burn?.ouraTotalKcal ?? null;
    const deficitKcal = totalBurnKcal == null || dayMeals.length === 0 ? null : totalBurnKcal - intakeKcal;
    return {
      dateKey: key,
      intakeKcal,
      mealCount: dayMeals.length,
      weightKg: weights.find((item) => item.dateKey === key)?.weightKg ?? null,
      ouraRestingKcal: burn?.ouraRestingKcal ?? null,
      ouraTotalKcal: burn?.ouraTotalKcal ?? null,
      intervalsTrainingKcal: burn?.intervalsTrainingKcal ?? null,
      totalBurnKcal,
      deficitKcal,
      meals: dayMeals,
      activities: activities.filter((activity) => activity.dateKey === key),
      sourceStatus: burn?.sourceStatus ?? "not_synced",
      syncedAt: burn?.syncedAt ?? null
    };
  };

  const allDays = allDates.map(buildDay);
  const days = dates.map((key) => allDays.find((day) => day.dateKey === key) || buildDay(key));
  const target = allDays.find((day) => day.dateKey === dateKey) || days[days.length - 1];
  const weekDeficitKcal = days.reduce((total, day) => total + (day.deficitKcal || 0), 0);
  const weeks = weekBuckets.map((week) => {
    const weekDays = week.dates.map((key) => allDays.find((day) => day.dateKey === key) || buildDay(key));
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
    weeks,
    weekDeficitKcal,
    sevenDayDeficitKcal: weekDeficitKcal,
    fourWeekDeficitKcal,
    predictedWeightLossJin: Math.max(0, weekDeficitKcal / JIN_KCAL),
    predictedFourWeekWeightLossJin: Math.max(0, fourWeekDeficitKcal / JIN_KCAL)
  };
}
