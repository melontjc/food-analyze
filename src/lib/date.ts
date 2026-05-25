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

export function weekStart(dateKeyValue: string) {
  const date = new Date(`${dateKeyValue}T00:00:00.000Z`);
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + mondayOffset);
  return date.toISOString().slice(0, 10);
}

export function weekRange(dateKeyValue: string) {
  const start = weekStart(dateKeyValue);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function recentWeekRanges(dateKeyValue: string, weeks: number) {
  const currentStart = weekStart(dateKeyValue);
  return Array.from({ length: weeks }, (_, index) => {
    const start = addDays(currentStart, (index - weeks + 1) * 7);
    const dates = Array.from({ length: 7 }, (_, dayIndex) => addDays(start, dayIndex));
    return {
      startDateKey: start,
      endDateKey: dates[dates.length - 1],
      label: `${start.slice(5)}-${dates[dates.length - 1].slice(5)}`,
      dates
    };
  });
}

export function isDateKey(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}
