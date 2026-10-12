import { resolvePeriodRange, type ResolvedPeriod } from "@/lib/period-range";

/** Calendar periods compare with calendar periods; overall uses equal 30-day windows. */
export function comparisonRange(period: ResolvedPeriod, now = new Date()) {
  const { start, end } = resolvePeriodRange(period);
  if (period.period === "overall") {
    const currentEnd = now;
    const currentStart = new Date(now.getTime() - 30 * 86400000);
    return { currentStart, currentEnd, previousStart: new Date(now.getTime() - 60 * 86400000), previousEnd: currentStart, label: "30d change" };
  }
  const previousStart = period.period === "month"
    ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth()-1, 1))
    : period.period === "year" ? new Date(Date.UTC(start.getUTCFullYear()-1, 0, 1))
    : new Date(start.getTime() - (end.getTime()-start.getTime()));
  return { currentStart: start, currentEnd: end, previousStart, previousEnd: start,
    label: period.period === "month" ? "MoM" : period.period === "year" ? "YoY" : "Period change" };
}

/** No percentage exists when the baseline is zero; avoid invented 0%/100% growth. */
export function growthPercent(current: number, previous: number): number | null {
  return previous > 0 ? Math.round((current-previous)/previous*100) : null;
}

export function collectionPurchaseDifference(collections: number, purchases: number) {
  return collections-purchases;
}
