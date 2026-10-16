"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useState, useEffect, useCallback, useMemo, useTransition } from "react";

export type PeriodMode = "overall" | "day" | "month" | "year" | "custom";

export type DateFilterOptions = {
  /** Used on a new tab when this page has no saved filter. */
  defaultPeriod?: PeriodMode;
  /** Set false for a deliberately ephemeral filter. */
  persist?: boolean;
};

type FilterState = {
  period: PeriodMode;
  year: number;
  month: number;
  day: number;
  customFrom: string;
  customTo: string;
};

const PERIODS = new Set<PeriodMode>(["overall", "day", "month", "year", "custom"]);
const FILTER_PARAMS = ["period", "year", "month", "day", "from", "to"] as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toFiniteInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

function defaults(now: Date, period: PeriodMode): FilterState {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const customFrom = `${year}-${String(month).padStart(2, "0")}-01`;
  const customTo = `${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
  return { period, year, month, day, customFrom, customTo };
}

function fromUrl(params: URLSearchParams, fallback: FilterState): FilterState {
  const candidate = params.get("period");
  const period = candidate && PERIODS.has(candidate as PeriodMode) ? (candidate as PeriodMode) : fallback.period;
  const year = toFiniteInt(params.get("year"), fallback.year);
  const month = clamp(toFiniteInt(params.get("month"), fallback.month), 1, 12);
  const day = clamp(toFiniteInt(params.get("day"), fallback.day), 1, new Date(year, month, 0).getDate());
  return { period, year, month, day, customFrom: params.get("from") ?? fallback.customFrom, customTo: params.get("to") ?? fallback.customTo };
}

function readStoredFilter(storageKey: string): FilterState | null {
  try {
    const raw = sessionStorage.getItem(`${storageKey}:filter`);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<FilterState>;
    if (!value.period || !PERIODS.has(value.period) || !Number.isInteger(value.year) || !Number.isInteger(value.month) || !Number.isInteger(value.day)) return null;
    if (value.period === "custom" && (!isDate(value.customFrom ?? "") || !isDate(value.customTo ?? "") || value.customFrom! > value.customTo!)) return null;
    const year = value.year as number;
    const month = clamp(value.month as number, 1, 12);
    const day = value.day as number;
    return { period: value.period, year, month, day: clamp(day, 1, new Date(year, month, 0).getDate()), customFrom: value.customFrom ?? "", customTo: value.customTo ?? "" };
  } catch {
    return null;
  }
}

function canonicalParams(current: URLSearchParams, state: FilterState) {
  const params = new URLSearchParams(current.toString());
  const desired = new URLSearchParams({ period: state.period });
  if (state.period === "custom") {
    desired.set("from", state.customFrom);
    desired.set("to", state.customTo);
  } else if (state.period !== "overall") {
    desired.set("year", String(state.year));
    if (state.period !== "year") desired.set("month", String(state.month));
    if (state.period === "day") desired.set("day", String(state.day));
  }
  // Preserve existing parameter positions. Deleting and re-appending the date
  // keys makes a nuqs tab/page update look like a date change and starts a
  // competing server navigation with an older URL snapshot.
  FILTER_PARAMS.forEach((key) => {
    const value = desired.get(key);
    if (value === null) params.delete(key);
    else params.set(key, value);
  });
  return params;
}

/**
 * URL-first date filter with optional per-page session persistence.
 * Explicit URLs always win; a bare URL restores only this page's saved filter.
 */
export function useDateFilter(storageKey: string, options: DateFilterOptions = {}) {
  const now = useMemo(() => new Date(), []);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const defaultPeriod = options.defaultPeriod ?? "month";
  const persist = options.persist ?? true;
  const fallback = useMemo(() => defaults(now, defaultPeriod), [now, defaultPeriod]);
  const hasExplicitPeriod = searchParams.has("period");
  const state = fromUrl(searchParams, fallback);
  const [isReady, setIsReady] = useState(false);

  // Kept for existing planning/customer workspace controls. Pharmacy views use
  // the canonical values above and never use these temporary mirrors as data input.
  const [localPeriod, setLocalPeriod] = useState<PeriodMode>(state.period);
  const [localMonth, setLocalMonth] = useState(String(state.month));
  const [localYear, setLocalYear] = useState(String(state.year));
  const [localDay, setLocalDay] = useState(String(state.day));
  const stateKey = `${state.period}:${state.year}:${state.month}:${state.day}:${state.customFrom}:${state.customTo}`;
  const [lastStateKey, setLastStateKey] = useState(stateKey);
  if (lastStateKey !== stateKey) {
    setLastStateKey(stateKey);
    setLocalPeriod(state.period);
    setLocalMonth(String(state.month));
    setLocalYear(String(state.year));
    setLocalDay(String(state.day));
  }

  useEffect(() => {
    const desired = hasExplicitPeriod || !persist ? state : readStoredFilter(storageKey) ?? state;
    const next = canonicalParams(searchParams, desired);
    if (next.toString() === searchParams.toString()) {
      // This synchronises readiness with the URL navigation above; no data
      // query may start until that external navigation is settled.
      setIsReady(true);
      return;
    }
    setIsReady(false);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
    // The URL state is represented by stateKey; including the object would
    // rerun this synchronisation on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasExplicitPeriod, pathname, persist, router, searchParams, stateKey, storageKey]);

  useEffect(() => {
    if (!persist || !isReady) return;
    try {
      sessionStorage.setItem(`${storageKey}:filter`, JSON.stringify(state));
    } catch {
      // Storage can be unavailable in private browsing; filtering still works.
    }
    // stateKey fully identifies the persisted filter value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, persist, stateKey, storageKey]);

  const updatePeriod = useCallback((next: Partial<{
    period: PeriodMode; month: number; day: number; year: number; customFrom: string; customTo: string;
  }>) => {
    const nextPeriod = next.period ?? state.period;
    const year = clamp(next.year ?? state.year, 2000, 9999);
    const month = clamp(next.month ?? state.month, 1, 12);
    const day = clamp(next.day ?? state.day, 1, new Date(year, month, 0).getDate());
    const customFrom = next.customFrom ?? state.customFrom;
    const customTo = next.customTo ?? state.customTo;
    if (nextPeriod === "custom" && (!isDate(customFrom) || !isDate(customTo) || customFrom > customTo)) return;
    setIsReady(false);
    const params = canonicalParams(searchParams, { period: nextPeriod, year, month, day, customFrom, customTo });
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  }, [pathname, router, searchParams, state]);

  const { dateFrom, dateTo } = getPeriodRange(state.period, state.month, state.year, state.day, state.customFrom, state.customTo);
  const years = Array.from({ length: 5 }, (_, index) => now.getFullYear() - 2 + index);
  return {
    period: state.period, month: state.month, day: state.day, customFrom: state.customFrom, customTo: state.customTo, year: state.year,
    dateFrom, dateTo, localPeriod, localMonth, localYear, localDay,
    setLocalPeriod, setLocalMonth, setLocalYear, setLocalDay, updatePeriod, isPending, isReady, years,
  };
}

/** Convert period+month+year → ISO date strings. */
export function getPeriodRange(period: PeriodMode, month: number, year: number, day = 1, customFrom = "", customTo = "") {
  if (period === "custom") return { dateFrom: customFrom, dateTo: customTo };
  if (period === "day") {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return { dateFrom: date, dateTo: date };
  }
  if (period === "overall") return { dateFrom: "", dateTo: "" };
  if (period === "year") return { dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` };
  const mm = String(month).padStart(2, "0");
  return { dateFrom: `${year}-${mm}-01`, dateTo: `${year}-${mm}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}` };
}
