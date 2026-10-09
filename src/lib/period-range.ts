// Shared period-range resolution for Commerce APIs.
// Mirrors BAI-service's URL-driven filter contract:
// overall | day | month | year | custom (+ from/to), Myanmar-time aware defaults.

export type PeriodMode = "overall" | "day" | "month" | "year" | "custom";

export type ResolvedPeriod = {
  period: PeriodMode;
  year: number;
  month: number;
  day: number;
  from: string | null;
  to: string | null;
};

const MIN_DATE = new Date(Date.UTC(1900, 0, 1));
const MAX_DATE = new Date(Date.UTC(9999, 11, 31, 23, 59, 59, 999));

function nowMyanmar(): Date {
  return new Date(Date.now() + 6.5 * 60 * 60 * 1000);
}

export function parsePeriodParams(searchParams: URLSearchParams): ResolvedPeriod {
  const raw = searchParams.get("period");
  const myanmarNow = nowMyanmar();
  const defaultYear = myanmarNow.getUTCFullYear();
  const defaultMonth = myanmarNow.getUTCMonth() + 1;
  const defaultDay = myanmarNow.getUTCDate();

  const period: PeriodMode =
    raw === "overall" || raw === "day" || raw === "year" || raw === "custom"
      ? raw
      : "month";

  const yearParam = Number(searchParams.get("year"));
  const monthParam = Number(searchParams.get("month"));
  const dayParam = Number(searchParams.get("day"));
  const year = Number.isInteger(yearParam) && yearParam >= 1900 && yearParam <= 2100 ? yearParam : defaultYear;
  const month = Number.isInteger(monthParam) && monthParam >= 1 && monthParam <= 12 ? monthParam : defaultMonth;
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Number.isInteger(dayParam) && dayParam >= 1 && dayParam <= lastDayOfMonth ? dayParam : Math.min(defaultDay, lastDayOfMonth);

  const isoDateOnly = /^\d{4}-\d{2}-\d{2}$/;
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const from = fromParam && isoDateOnly.test(fromParam) ? fromParam : null;
  const to = toParam && isoDateOnly.test(toParam) ? toParam : null;

  return { period, year, month, day, from, to };
}

/** Inclusive UTC start / exclusive UTC end for the selected period. */
export function resolvePeriodRange(period: ResolvedPeriod): { start: Date; end: Date } {
  const { period: mode, year, month, day, from, to } = period;

  if (mode === "overall") return { start: MIN_DATE, end: MAX_DATE };

  if (mode === "custom") {
    const start = from ? new Date(`${from}T00:00:00.000Z`) : new Date(Date.UTC(year, month - 1, 1));
    const endBase = to ? new Date(`${to}T00:00:00.000Z`) : new Date(Date.UTC(year, month, 0));
    return { start, end: new Date(endBase.getTime() + 24 * 60 * 60 * 1000) };
  }

  if (mode === "day") {
    return {
      start: new Date(Date.UTC(year, month - 1, day)),
      end: new Date(Date.UTC(year, month - 1, day + 1)),
    };
  }

  if (mode === "year") {
    return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year + 1, 0, 1)) };
  }

  return { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)) };
}

/**
 * Trend buckets for the selected range.
 * Day/month views bucket per calendar day; longer views bucket per month.
 */
export function buildTrendBuckets(period: ResolvedPeriod): {
  start: Date;
  labels: string[];
  bucketIndex: (date: Date) => number;
} {
  const { start, end } = resolvePeriodRange(period);
  const monthlyLabels: string[] = [];
  const monthCursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (monthCursor < end) {
    monthlyLabels.push(monthNames[monthCursor.getUTCMonth()]);
    monthCursor.setUTCMonth(monthCursor.getUTCMonth() + 1);
  }

  if (period.period === "day") {
    const label = `${String(period.month).padStart(2, "0")}-${String(period.day).padStart(2, "0")}`;
    return { start, labels: [label], bucketIndex: () => 0 };
  }

  if (period.period === "overall") {
    // For overall, display 12 months ending at current year/month
    const now = nowMyanmar();
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth();
    const labels: string[] = [];
    const bucketStartYear = currentMonth < 11 ? currentYear - 1 : currentYear;
    const bucketStartMonth = (currentMonth + 1) % 12;
    for (let i = 0; i < 12; i++) {
      const m = (bucketStartMonth + i) % 12;
      labels.push(monthNames[m]);
    }
    return {
      start,
      labels,
      bucketIndex: (date: Date) => {
        const diffMonths = (date.getUTCFullYear() - bucketStartYear) * 12 + date.getUTCMonth() - bucketStartMonth;
        return diffMonths >= 0 && diffMonths < 12 ? diffMonths : -1;
      },
    };
  }

  if (period.period === "year" || period.period === "custom") {
    // Monthly buckets; long custom ranges are capped at the first 24 months.
    const capped = monthlyLabels.slice(0, 24);
    return {
      start,
      labels: capped.length ? capped : monthNames.slice(start.getUTCMonth(), start.getUTCMonth() + 1),
      bucketIndex: (date: Date) => {
        const index = (date.getUTCFullYear() - start.getUTCFullYear()) * 12 + date.getUTCMonth() - start.getUTCMonth();
        return index >= 0 && index < capped.length ? index : -1;
      },
    };
  }

  // Daily buckets for a single-month view.
  const daysInMonth = new Date(Date.UTC(period.year, period.month, 0)).getUTCDate();
  const labels = Array.from({ length: daysInMonth }, (_, index) => String(index + 1));
  return {
    start,
    labels,
    bucketIndex: (date: Date) => {
      const dayOfMonth = date.getUTCDate();
      return dayOfMonth >= 1 && dayOfMonth <= daysInMonth ? dayOfMonth - 1 : -1;
    },
  };
}

export const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Ratio of the period that has elapsed up to now (capped at 1). */
export function elapsedRatio(start: Date, end: Date): number {
  const total = end.getTime() - start.getTime();
  if (total <= 0) return 1;
  const elapsed = Date.now() - start.getTime();
  return Math.max(0, Math.min(1, elapsed / total));
}

/** Anchor month/year used for target lookups of non-calendar periods. */
export function targetAnchor(period: ResolvedPeriod): { period: "month" | "year"; year: number; month: number } {
  const { start } = resolvePeriodRange(period);
  if (period.period === "year") return { period: "year", year: period.year, month: 0 };
  return { period: "month", year: start.getUTCFullYear(), month: start.getUTCMonth() + 1 };
}
