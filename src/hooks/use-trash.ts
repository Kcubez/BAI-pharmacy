import { trashApi, type TrashParams, type TrashRecordType } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const trashKeys = {
  all: ["trash"] as const,
  list: (params: TrashParams) => [...trashKeys.all, "list", params] as const,
};

function invalidateBusinessData(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: trashKeys.all });
  queryClient.invalidateQueries({ queryKey: ["customers"] });
  queryClient.invalidateQueries({ queryKey: ["demand-records"] });
  queryClient.invalidateQueries({ queryKey: ["business-reports"] });
  queryClient.invalidateQueries({ queryKey: ["products"] });
  queryClient.invalidateQueries({ queryKey: ["deals"] });
  queryClient.invalidateQueries({ queryKey: ["expenses"] });
  queryClient.invalidateQueries({ queryKey: ["marketing-metrics"] });
  queryClient.invalidateQueries({ queryKey: ["project-expiries"] });
  queryClient.invalidateQueries({ queryKey: ["website-updates"] });
  queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
  // Commerce workspaces read from these keys (dashboard KPIs + customer
  // directory). Without them, restoring from Trash leaves Sales / Marketing /
  // Customers tables stale until a manual refresh. String literals avoid a
  // circular import with use-commerce-dashboard / use-commerce-customers.
  queryClient.invalidateQueries({ queryKey: ["commerce-dashboard"] });
  queryClient.invalidateQueries({ queryKey: ["commerce-customers"] });
}

export function useTrash(params: TrashParams = {}) {
  return useQuery({
    queryKey: trashKeys.list(params),
    queryFn: () => trashApi.list(params),
  });
}

export function useRestoreTrashRecord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ type, id }: { type: TrashRecordType; id: string }) =>
      trashApi.restore(type, id),
    onSuccess: (res) => {
      invalidateBusinessData(queryClient);
      toast.success(res.restored ? "Record restored" : "Record was already restored");
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Failed to restore record");
    },
  });
}

export function useRequestTrashRestore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ type, id }: { type: TrashRecordType; id: string }) =>
      trashApi.requestRestore(type, id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: trashKeys.all });
      toast.success(res.message || "Restore request sent");
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Failed to request restore");
    },
  });
}

export function useRequestRestoreAllTrash() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ type, dateFrom, dateTo }: { type: string; dateFrom?: string; dateTo?: string }) =>
      trashApi.requestRestoreAll(type, dateFrom, dateTo),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: trashKeys.all });
      toast.success(res.message || "Restore request sent for all matching records");
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Failed to request bulk restore");
    },
  });
}

export function usePermanentDeleteTrashRecord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ type, id }: { type: TrashRecordType; id: string }) =>
      trashApi.permanentDelete(type, id, "PERMANENT DELETE"),
    onSuccess: (res) => {
      invalidateBusinessData(queryClient);
      toast.success(res.deleted ? "Record permanently deleted" : "Record was already removed");
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Failed to permanently delete record");
    },
  });
}

export function useRestoreAllTrash() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ type, dateFrom, dateTo }: { type: string; dateFrom?: string; dateTo?: string }) =>
      trashApi.restoreAll(type, dateFrom, dateTo),
    onSuccess: (res) => {
      invalidateBusinessData(queryClient);
      toast.success(res.message || "All matching records restored");
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Failed to restore records");
    },
  });
}

export function usePermanentDeleteAllTrash() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ type, dateFrom, dateTo }: { type: string; dateFrom?: string; dateTo?: string }) =>
      trashApi.permanentDeleteAll(type, "PERMANENT DELETE ALL", dateFrom, dateTo),
    onSuccess: (res) => {
      invalidateBusinessData(queryClient);
      toast.success(res.message || "All matching records permanently deleted");
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Failed to permanently delete records");
    },
  });
}
