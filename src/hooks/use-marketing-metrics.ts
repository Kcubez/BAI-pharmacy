"use client";

import { useQuery } from "@tanstack/react-query";
import { marketingMetricsApi, type MarketingMetricsParams } from "@/lib/api";

export const marketingMetricKeys = {
  all: ["marketing-metrics"] as const,
  list: (params: MarketingMetricsParams = {}) =>
    [...marketingMetricKeys.all, params] as const,
};

/**
 * Period-scoped marketing metrics for the Marketing workspace table.
 * Same resilience rationale as useDeals: retries + a real error state
 * instead of a silent empty table.
 */
export function useMarketingMetrics(params: MarketingMetricsParams = {}) {
  const { dateFrom, dateTo, page, limit } = params;
  return useQuery({
    queryKey: marketingMetricKeys.list({ dateFrom, dateTo, page, limit }),
    queryFn: () => marketingMetricsApi.list({ dateFrom, dateTo, page, limit }),
  });
}
