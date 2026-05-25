import { DailyBurn, TrainingActivity } from "@prisma/client";
import { addDays, dateRange } from "@/lib/date";
import { getConnection, getIntervalsConfig, OuraTokenData, saveConnection } from "@/lib/connections";
import { env } from "@/lib/config";
import { prisma } from "@/lib/prisma";

const OURA_BASE_URL = "https://api.ouraring.com/v2/usercollection";
const OURA_TOKEN_URL = "https://api.ouraring.com/oauth/token";
const INTERVALS_BASE_URL = "https://intervals.icu/api/v1";

type SyncResult = {
  dateKeys: string[];
  burns: DailyBurn[];
  activities: TrainingActivity[];
  errors: string[];
};

export async function syncRecentDays(endDateKey: string, days = 8): Promise<SyncResult> {
  const run = await prisma.syncRun.create({ data: { source: "all", status: "running" } });
  const dateKeys = dateRange(endDateKey, days);
  const errors: string[] = [];
  const burns: DailyBurn[] = [];
  let activities: TrainingActivity[] = [];

  try {
    const [ouraByDate, intervals] = await Promise.all([
      fetchOuraActivityRange(dateKeys[0], dateKeys[dateKeys.length - 1]).catch((error) => {
        errors.push(error.message);
        return new Map<string, OuraDailyActivity>();
      }),
      fetchIntervalsActivities(dateKeys[0], dateKeys[dateKeys.length - 1]).catch((error) => {
        errors.push(error.message);
        return [];
      })
    ]);

    activities = await upsertTrainingActivities(intervals);
    for (const key of dateKeys) {
      const dayActivities = activities.filter((activity) => activity.dateKey === key);
      const trainingKcal = sum(dayActivities.map((activity) => activity.calories));
      const oura = ouraByDate.get(key) || null;
      const restingKcal = oura ? restingCalories(oura) : null;
      const activeKcal = numberValue(oura?.active_calories);
      const totalKcal = numberValue(oura?.total_calories);
      const totalBurnKcal = totalKcal;
      const status = [
        oura ? "oura:ok" : "oura:missing",
        intervals.length ? "intervals:reference" : "intervals:missing"
      ].join(",");

      burns.push(
        await prisma.dailyBurn.upsert({
          where: { dateKey: key },
          update: {
            ouraRestingKcal: restingKcal,
            ouraActiveKcal: activeKcal,
            ouraTotalKcal: totalKcal,
            intervalsTrainingKcal: trainingKcal,
            totalBurnKcal,
            sourceStatus: status,
            syncedAt: new Date()
          },
          create: {
            dateKey: key,
            ouraRestingKcal: restingKcal,
            ouraActiveKcal: activeKcal,
            ouraTotalKcal: totalKcal,
            intervalsTrainingKcal: trainingKcal,
            totalBurnKcal,
            sourceStatus: status,
            syncedAt: new Date()
          }
        })
      );
    }

    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: errors.length ? "partial" : "success", message: errors.join("; ") || null, endedAt: new Date() }
    });
    return { dateKeys, burns, activities, errors };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    await prisma.syncRun.update({ where: { id: run.id }, data: { status: "failed", message, endedAt: new Date() } });
    throw error;
  }
}

export async function maybeRefreshDashboardData(dateKey: string) {
  const burn = await prisma.dailyBurn.findUnique({ where: { dateKey } });
  if (!burn?.syncedAt || Date.now() - burn.syncedAt.getTime() > 2 * 60 * 60 * 1000) {
    syncRecentDays(dateKey).catch(() => undefined);
  }
}

type OuraDailyActivity = Record<string, unknown> & {
  day?: string;
  active_calories?: number;
  total_calories?: number;
};

async function fetchOuraActivityRange(startDate: string, endDate: string) {
  const token = await getOuraAccessToken();
  if (!token) return new Map<string, OuraDailyActivity>();
  const response = await fetch(`${OURA_BASE_URL}/daily_activity?start_date=${startDate}&end_date=${endDate}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Oura ${response.status}: ${body.slice(0, 220)}`);
  }
  const data = (await response.json()) as { data?: OuraDailyActivity[] };
  return new Map((data.data || []).map((item) => [String(item.day), item]));
}

async function getOuraAccessToken() {
  const tokenData = await getConnection<OuraTokenData>("oura");
  if (!tokenData) return null;
  if (Date.now() < tokenData.expiresAt - 5 * 60 * 1000) return tokenData.accessToken;

  const credentials = Buffer.from(`${env("OURA_CLIENT_ID")}:${env("OURA_CLIENT_SECRET")}`).toString("base64");
  const response = await fetch(OURA_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokenData.refreshToken
    })
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Oura refresh ${response.status}: ${body.slice(0, 220)}`);
  }
  const refreshed = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  const next: OuraTokenData = {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token || tokenData.refreshToken,
    expiresAt: Date.now() + (refreshed.expires_in || 86400) * 1000,
    scope: refreshed.scope || tokenData.scope
  };
  await saveConnection("oura", next);
  return next.accessToken;
}

type IntervalsActivity = Record<string, unknown> & {
  id?: string;
  icu_id?: string;
  name?: string;
  type?: string;
  sport?: string;
  start_date_local?: string;
  start_date?: string;
  date?: string;
  moving_time?: number;
  elapsed_time?: number;
  duration?: number;
  calories?: number;
  kcal?: number;
};

async function fetchIntervalsActivities(startDate: string, endDate: string) {
  const config = await getIntervalsConfig();
  if (!config) return [];
  const response = await fetch(
    `${INTERVALS_BASE_URL}/athlete/${config.athleteId || "0"}/activities?oldest=${startDate}&newest=${addDays(endDate, 1)}`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`API_KEY:${config.apiKey}`).toString("base64")}`,
        Accept: "application/json"
      }
    }
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Intervals.icu ${response.status}: ${body.slice(0, 220)}`);
  }
  const data = (await response.json()) as unknown;
  return Array.isArray(data) ? (data as IntervalsActivity[]) : [];
}

async function upsertTrainingActivities(activities: IntervalsActivity[]) {
  const saved: TrainingActivity[] = [];
  for (const activity of activities) {
    const id = String(activity.id || activity.icu_id || "");
    if (!id) continue;
    const key = activityDateKey(activity);
    const calories = numberValue(activity.calories) ?? numberValue(activity.kcal);
    saved.push(
      await prisma.trainingActivity.upsert({
        where: { intervalsId: id },
        update: {
          dateKey: key,
          name: activity.name || activity.type || "训练",
          type: String(activity.type || activity.sport || "activity"),
          durationSec: numberValue(activity.moving_time) ?? numberValue(activity.elapsed_time) ?? numberValue(activity.duration),
          calories,
          startedAt: activity.start_date ? new Date(String(activity.start_date)) : null,
          raw: JSON.stringify(activity)
        },
        create: {
          intervalsId: id,
          dateKey: key,
          name: activity.name || activity.type || "训练",
          type: String(activity.type || activity.sport || "activity"),
          durationSec: numberValue(activity.moving_time) ?? numberValue(activity.elapsed_time) ?? numberValue(activity.duration),
          calories,
          startedAt: activity.start_date ? new Date(String(activity.start_date)) : null,
          raw: JSON.stringify(activity)
        }
      })
    );
  }
  return saved;
}

function restingCalories(activity: OuraDailyActivity) {
  return (
    numberValue(activity.resting_calories) ??
    numberValue(activity.basal_metabolic_rate) ??
    numberValue(activity.non_active_calories) ??
    difference(numberValue(activity.total_calories), numberValue(activity.active_calories))
  );
}

function difference(total: number | null, active: number | null) {
  if (total == null || active == null) return null;
  return Math.max(0, Math.round(total - active));
}

function numberValue(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function sum(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return valid.length ? valid.reduce((total, value) => total + value, 0) : null;
}

function activityDateKey(activity: IntervalsActivity) {
  return String(activity.start_date_local || activity.date || activity.start_date || new Date().toISOString()).slice(0, 10);
}
