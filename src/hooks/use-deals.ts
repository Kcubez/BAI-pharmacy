"use client";

import { useQuery } from "@tanstack/react-query";
import { dealsApi } from "@/lib/api";

export const dealsKeys = {
  all: ["deals"] as const,
  list: (params: { dateFrom?: string; dateTo?: string; stage?: string } = {}) =>
    [...dealsKeys.all, params] as const,
};

export type DealsListParams = {
  dateFrom?: string;
  dateTo?: string;
  stage?: string;
};

/**
 * Period-scoped deals for the Sales workspace table. TanStack Query gives us
 * automatic retries + refetch, so one failed request can no longer leave the
 * table permanently empty — the failure that caused the "No deals" ghost.
 */
export function useDeals(params: DealsListParams = {}) {
  const { dateFrom, dateTo, stage } = params;
  return useQuery({
    queryKey: dealsKeys.list({ dateFrom, dateTo, stage }),
    queryFn: () => dealsApi.list({ dateFrom, dateTo, stage }),
  });
}
