"use client";

import {
  commerceCustomersApi,
  CommerceCustomerRecordInput,
  CommerceCustomersListParams,
  type Customer,
} from "@/lib/api";
import { customersApi } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { trashKeys } from "@/hooks/use-trash";
import { commerceDashboardKeys } from "@/hooks/use-commerce-dashboard";
import { removeListItemQueryData, clearListQueryData } from "@/lib/query-cache";

export const commerceCustomersKeys = {
  all: ["commerce-customers"] as const,
  directory: (params: CommerceCustomersListParams) => [...commerceCustomersKeys.all, "directory", params] as const,
  stats: (params: CommerceCustomersListParams) => [...commerceCustomersKeys.all, "stats", params] as const,
  analytics: (params: CommerceCustomersListParams) => [...commerceCustomersKeys.all, "analytics", params] as const,
  records: (params: CommerceCustomersListParams) => [...commerceCustomersKeys.all, "records", params] as const,
};

/** Invalidate everything that displays customer or purchase data. */
function invalidateCustomerData(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: commerceCustomersKeys.all });
  queryClient.invalidateQueries({ queryKey: commerceDashboardKeys.all });
  queryClient.invalidateQueries({ queryKey: ["customers"] });
  queryClient.invalidateQueries({ queryKey: ["demand-records"] });
  queryClient.invalidateQueries({ queryKey: ["demand-record-stats"] });
  queryClient.invalidateQueries({ queryKey: trashKeys.all });
}

export function useCommerceCustomerDirectory(params: CommerceCustomersListParams) {
  return useQuery({
    queryKey: commerceCustomersKeys.directory(params),
    queryFn: () => commerceCustomersApi.directory(params),
    placeholderData: (prev) => prev,
  });
}

export function useCommerceCustomerStats(params: CommerceCustomersListParams) {
  return useQuery({
    queryKey: commerceCustomersKeys.stats(params),
    queryFn: () => commerceCustomersApi.stats(params),
  });
}

export function useCommerceCustomerAnalytics(params: CommerceCustomersListParams) {
  return useQuery({
    queryKey: commerceCustomersKeys.analytics(params),
    queryFn: () => commerceCustomersApi.analytics(params),
  });
}

export function useCreateCommerceCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Customer>) => customersApi.create(data),
    onSuccess: () => {
      invalidateCustomerData(queryClient);
      toast.success("Customer created successfully");
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Failed to create customer");
    },
  });
}

export function useUpdateCommerceCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<Customer>) => customersApi.update(id, data),
    onSuccess: () => {
      invalidateCustomerData(queryClient);
      toast.success("Customer updated successfully");
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Failed to update customer");
    },
  });
}

export function useDeleteCommerceCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => customersApi.delete(id),
    onSuccess: (_res, id) => {
      removeListItemQueryData(queryClient, ["customers"], "customers", id);
      clearListQueryData(queryClient, commerceCustomersKeys.all, "customers");
      invalidateCustomerData(queryClient);
      toast.success("Customer moved to Trash");
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete customer");
    },
  });
}

export function useCommerceCustomerRecords(params: CommerceCustomersListParams) {
  return useQuery({
    queryKey: commerceCustomersKeys.records(params),
    queryFn: () => commerceCustomersApi.records(params),
    placeholderData: (prev) => prev,
  });
}

export function useCreateCommerceCustomerRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CommerceCustomerRecordInput) => commerceCustomersApi.createRecord(data),
    onSuccess: () => {
      invalidateCustomerData(queryClient);
      toast.success("Purchase record created successfully");
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Failed to create purchase record");
    },
  });
}

export function useUpdateCommerceCustomerRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<CommerceCustomerRecordInput>) =>
      commerceCustomersApi.updateRecord(id, data),
    onSuccess: () => {
      invalidateCustomerData(queryClient);
      toast.success("Purchase record updated successfully");
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Failed to update purchase record");
    },
  });
}

export function useDeleteCommerceCustomerRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => commerceCustomersApi.deleteRecord(id),
    onSuccess: (_res, id) => {
      removeListItemQueryData(queryClient, commerceCustomersKeys.all, "records", id);
      invalidateCustomerData(queryClient);
      toast.success("Record moved to Trash");
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete record");
    },
  });
}
