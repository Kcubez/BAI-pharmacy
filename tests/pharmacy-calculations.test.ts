import { expect, it } from "vitest";
import { comparisonRange, growthPercent, collectionPurchaseDifference } from "@/lib/pharmacy-calculations";
import { parsePeriodParams } from "@/lib/period-range";
it("compares July with June rather than including May 31", () => {
  const range = comparisonRange(parsePeriodParams(new URLSearchParams("period=month&year=2026&month=7")));
  expect(range.previousStart.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  expect(range.previousEnd.toISOString()).toBe("2026-07-01T00:00:00.000Z");
});
it("handles January rollover and leap-year comparisons", () => {
  const january = comparisonRange(parsePeriodParams(new URLSearchParams("period=month&year=2026&month=1")));
  expect(january.previousStart.toISOString()).toBe("2025-12-01T00:00:00.000Z");
  const year = comparisonRange(parsePeriodParams(new URLSearchParams("period=year&year=2024")));
  expect(year.previousStart.toISOString()).toBe("2023-01-01T00:00:00.000Z");
  expect(year.previousEnd.toISOString()).toBe("2024-01-01T00:00:00.000Z");
});
it("uses two equal 30-day windows for overall growth", () => {
  const range = comparisonRange(parsePeriodParams(new URLSearchParams("period=overall")), new Date("2026-10-12"));
  expect(range.currentEnd.getTime()-range.currentStart.getTime()).toBe(30*86400000);
  expect(range.previousEnd.getTime()-range.previousStart.getTime()).toBe(30*86400000);
  expect(range.previousEnd).toEqual(range.currentStart);
});
it("does not invent a percentage when there is no baseline", () => {
  expect(growthPercent(100,0)).toBeNull();
  expect(growthPercent(0,0)).toBeNull();
  expect(growthPercent(90,100)).toBe(-10);
});
it("uses the same invoice comparison in every period", () => {
  expect(collectionPurchaseDifference(100,80)).toBe(20);
});
