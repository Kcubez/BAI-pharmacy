"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sendersApi, settingsSendersApi } from "@/lib/api";
import { toast } from "sonner";

export const settingsSenderKeys = {
  all: ["settings-senders"] as const,
  lists: () => [...settingsSenderKeys.all, "list"] as const,
};

export function useSettingsSenders() {
  return useQuery({
    queryKey: settingsSenderKeys.lists(),
    queryFn: async () => {
      const data = await settingsSendersApi.list();
      return data.senders;
    },
  });
}

export function useUpdateSenderSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { isAuthorized?: boolean; allowedDepartments?: string[] };
    }) => settingsSendersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsSenderKeys.lists() });
      toast.success("Sender permissions updated successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message ?? "Failed to update sender permissions");
    },
  });
}

export function useCreateSenderSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { email: string; allowedDepartments: string[] }) =>
      settingsSendersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsSenderKeys.lists() });
      toast.success("Staff email pre-registered successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message ?? "Failed to pre-register staff email");
    },
  });
}

export function useDeleteSenderSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => settingsSendersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsSenderKeys.lists() });
      toast.success("Staff bot access removed successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message ?? "Failed to remove staff bot access");
    },
  });
}

export function useSenders() {
  return useQuery({
    queryKey: ["senders"],
    queryFn: () => sendersApi.list().then((res) => res.senders),
    refetchInterval: 10000, // Refresh every 10 seconds
  });
}
