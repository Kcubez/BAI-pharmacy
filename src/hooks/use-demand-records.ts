import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { demandRecordsApi, type DemandRecordsParams, type UpdateDemandRecordPayload } from "@/lib/api";
import { clearListQueryData, removeListItemQueryData } from "@/lib/query-cache";
import { toast } from "sonner";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function useDemandRecords(params: DemandRecordsParams = {}) {
  return useQuery({
    queryKey: ["demand-records", params],
    queryFn: () => demandRecordsApi.list(params),
    refetchInterval: 5000,
  });
}

export function useDemandRecordStats(params: { dateFrom?: string; dateTo?: string } = {}) {
  return useQuery({
    queryKey: ["demand-record-stats", params.dateFrom, params.dateTo],
    queryFn: () => demandRecordsApi.stats(params),
    refetchInterval: 10000,
  });
}

export function useDemandRecordRecommendations() {
  return useQuery({
    queryKey: ["demand-record-recommendations"],
    queryFn: () => demandRecordsApi.recommendations(),
    // AI calls are costly — fetch once on mount, then only on manual refresh.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useDeleteAllDemandRecords() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { dateFrom?: string; dateTo?: string } = {}) => demandRecordsApi.deleteAll(params),
    onSuccess: (res) => {
      clearListQueryData(queryClient, ["demand-records"], "records");
      queryClient.invalidateQueries({ queryKey: ["demand-records"] });
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      queryClient.invalidateQueries({ queryKey: ["demand-record-stats"] });
      queryClient.invalidateQueries({ queryKey: ["demand-record-recommendations"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success(`Deleted ${res.count} demand record(s)`);
    },
    onError: (error: unknown) => {
      toast.error(errorMessage(error, "Failed to delete records"));
    },
  });
}

export function useUpdateDemandRecord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateDemandRecordPayload) =>
      demandRecordsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["demand-records"] });
      queryClient.invalidateQueries({ queryKey: ["demand-record-stats"] });
      toast.success("Record updated successfully");
    },
    onError: (error: unknown) => {
      toast.error(errorMessage(error, "Failed to update record"));
    },
  });
}

export function useCreateDemandRecord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Parameters<typeof demandRecordsApi.create>[0]) => demandRecordsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["demand-records"] });
      queryClient.invalidateQueries({ queryKey: ["demand-record-stats"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Lead created successfully");
    },
    onError: (error: unknown) => {
      toast.error(errorMessage(error, "Failed to create lead"));
    },
  });
}

export function useDeleteDemandRecord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => demandRecordsApi.delete(id),
    onSuccess: (_res, id) => {
      removeListItemQueryData(queryClient, ["demand-records"], "records", id);
      queryClient.invalidateQueries({ queryKey: ["demand-records"] });
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      queryClient.invalidateQueries({ queryKey: ["demand-record-stats"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Lead deleted successfully");
    },
    onError: (error: unknown) => {
      toast.error(errorMessage(error, "Failed to delete lead"));
    },
  });
}
