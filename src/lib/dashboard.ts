import { JIN_KCAL } from "@/lib/config";
import { dateRange } from "@/lib/date";
import { prisma } from "@/lib/prisma";

export async function getDashboard(dateKey: string) {
  const dates = dateRange(dateKey, 7);
  const [meals, burns, activities, weights] = await Promise.all([
    prisma.mealEntry.findMany({
      where: { dateKey: { in: dates }, status: "confirmed" },
      include: { items: true },
      orderBy: { createdAt: "desc" }
    }),
    prisma.dailyBurn.findMany({ where: { dateKey: { in: dates } } }),
    prisma.trainingActivity.findMany({ where: { dateKey: { in: dates } }, orderBy: { startedAt: "desc" } }),
    prisma.weightEntry.findMany({ where: { dateKey: { in: dates } } })
  ]);

  const days = dates.map((key) => {
    const dayMeals = meals.filter((meal) => meal.dateKey === key);
    const intakeKcal = dayMeals.reduce((total, meal) => total + (meal.finalKcal || 0), 0);
    const burn = burns.find((item) => item.dateKey === key) || null;
    const deficitKcal = burn?.totalBurnKcal == null ? null : burn.totalBurnKcal - intakeKcal;
    return {
      dateKey: key,
      intakeKcal,
      weightKg: weights.find((item) => item.dateKey === key)?.weightKg ?? null,
      ouraRestingKcal: burn?.ouraRestingKcal ?? null,
      intervalsTrainingKcal: burn?.intervalsTrainingKcal ?? null,
      totalBurnKcal: burn?.totalBurnKcal ?? null,
      deficitKcal,
      meals: dayMeals,
      activities: activities.filter((activity) => activity.dateKey === key),
      sourceStatus: burn?.sourceStatus ?? "not_synced",
      syncedAt: burn?.syncedAt ?? null
    };
  });

  const target = days[days.length - 1];
  const sevenDayDeficitKcal = days.reduce((total, day) => total + (day.deficitKcal || 0), 0);

  return {
    dateKey,
    today: target,
    days,
    sevenDayDeficitKcal,
    predictedWeightLossJin: Math.max(0, sevenDayDeficitKcal / JIN_KCAL)
  };
}
