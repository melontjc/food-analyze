import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { getDashboard } from "@/lib/dashboard";
import { todayKey } from "@/lib/date";
import { getMockDashboard } from "@/lib/mock-dashboard";
import { prisma } from "@/lib/prisma";
import { maybeRefreshDashboardData } from "@/lib/sync";
import DashboardTailAdminClient, { type DashboardPayload, type MealPresetPayload } from "@/components/dashboard-tailadmin-client";

export default async function Home() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const initialDate = todayKey();
  const useMockData = process.env.NODE_ENV !== "production" && process.env.LOCAL_MOCK_DATA === "true";
  if (!useMockData) {
    maybeRefreshDashboardData(initialDate).catch(() => undefined);
  }
  const [dashboard, presets] = await Promise.all([
    useMockData ? Promise.resolve(getMockDashboard(initialDate)) : getDashboard(initialDate),
    useMockData ? Promise.resolve([]) : getMealPresets()
  ]);

  return (
    <DashboardTailAdminClient
      initialDate={initialDate}
      initialDashboard={serialize<DashboardPayload>(dashboard)}
      initialPresets={serialize<MealPresetPayload[]>(presets)}
    />
  );
}

function getMealPresets() {
  return prisma.mealPreset.findMany({
    select: {
      id: true,
      name: true,
      imageUrl: true,
      description: true,
      baseKcal: true,
      usageCount: true,
      items: {
        select: {
          id: true,
          name: true,
          portion: true,
          defaultGrams: true,
          kcal: true,
          confidence: true,
          calculationSource: true,
          nutritionSourceId: true,
          nutritionSource: {
            select: {
              id: true,
              name: true,
              imageUrl: true,
              kcalPer100g: true,
              proteinPer100g: true,
              fatPer100g: true,
              carbsPer100g: true,
              confidence: true,
              notes: true
            }
          }
        }
      }
    },
    orderBy: [{ lastUsedAt: "desc" }, { createdAt: "desc" }]
  });
}

function serialize<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
