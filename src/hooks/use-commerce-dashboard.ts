"use client";

import {
  commerceDashboardApi,
  CommerceActionRecommendation,
  CommerceDashboardParams,
  SaveCommerceTargetsPayload,
} from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const commerceDashboardKeys = {
  all: ["commerce-dashboard"] as const,
  detail: (params: CommerceDashboardParams) => [...commerceDashboardKeys.all, params] as const,
  workspaces: (params: CommerceDashboardParams) => [...commerceDashboardKeys.all, "workspaces", params] as const,
  recommendations: (params: CommerceDashboardParams) => [...commerceDashboardKeys.all, "recommendations", params] as const,
};

export function useCommerceDashboard(params: CommerceDashboardParams, enabled = true) {
  return useQuery({
    queryKey: commerceDashboardKeys.detail(params),
    queryFn: () => commerceDashboardApi.get(params),
    enabled,
  });
}

export function useSaveCommerceTargets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SaveCommerceTargetsPayload) => commerceDashboardApi.saveTargets(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commerceDashboardKeys.all });
      toast.success("Targets saved");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to save targets");
    },
  });
}

export function useCommerceWorkspaces(params: CommerceDashboardParams, enabled = true) {
  return useQuery({
    queryKey: commerceDashboardKeys.workspaces(params),
    queryFn: () => commerceDashboardApi.workspaces(params),
    enabled,
  });
}

export function useCommerceRecommendations(params: CommerceDashboardParams, enabled = true) {
  return useQuery({
    queryKey: commerceDashboardKeys.recommendations(params),
    queryFn: async () => {
      const search = new URLSearchParams();
      search.set("period", params.period);
      if (params.period !== "overall") {
        search.set("year", String(params.year));
        if (params.period === "month" || params.period === "day") search.set("month", String(params.month));
        if (params.period === "day" && params.day) search.set("day", String(params.day));
        if (params.period === "custom") {
          if (params.from) search.set("from", params.from);
          if (params.to) search.set("to", params.to);
        }
      }
      const response = await fetch(`/api/dashboard/action-recommendations?${search.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load suggestions");
      return (await response.json()) as { recommendations: CommerceActionRecommendation[]; source: string };
    },
    enabled,
    staleTime: 60_000,
  });
}
