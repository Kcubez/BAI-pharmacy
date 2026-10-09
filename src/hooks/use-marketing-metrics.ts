"use client";

import { useQuery } from "@tanstack/react-query";
import { marketingMetricsApi } from "@/lib/api";

export const marketingMetricKeys = {
  all: ["marketing-metrics"] as const,
  list: (params: { dateFrom?: string; dateTo?: string } = {}) =>
    [...marketingMetricKeys.all, params] as const,
};

/**
 * Period-scoped marketing metrics for the Marketing workspace table.
 * Same resilience rationale as useDeals: retries + a real error state
 * instead of a silent empty table.
 */
export function useMarketingMetrics(params: { dateFrom?: string; dateTo?: string } = {}) {
  const { dateFrom, dateTo } = params;
  return useQuery({
    queryKey: marketingMetricKeys.list({ dateFrom, dateTo }),
    queryFn: () => marketingMetricsApi.list({ dateFrom, dateTo }),
  });
}
