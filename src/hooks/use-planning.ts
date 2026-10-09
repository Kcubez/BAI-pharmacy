"use client";

import { planningApi } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

export const planningKeys = {
  all: ["planning"] as const,
  insights: (params: { dateFrom?: string; dateTo?: string }) =>
    [...planningKeys.all, "insights", params] as const,
};

export function usePlanningInsights(
  params: { dateFrom?: string; dateTo?: string },
  enabled: boolean,
) {
  return useQuery({
    queryKey: planningKeys.insights(params),
    queryFn: () => planningApi.insights(params),
    enabled,
    staleTime: 1000 * 60 * 5,
  });
}
