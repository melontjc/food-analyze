import { APP_TIME_ZONE } from "@/lib/config";

export function todayKey() {
  return dateKey(new Date());
}

export function dateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function addDays(dateKeyValue: string, days: number) {
  const date = new Date(`${dateKeyValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dateRange(endDateKey: string, days: number) {
  return Array.from({ length: days }, (_, index) => addDays(endDateKey, index - days + 1));
}

export function isDateKey(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}
