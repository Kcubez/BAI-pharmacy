"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usersApi, type AdminUser, type CreateUserPayload, type UpdateUserPayload } from "@/lib/api";
import { toast } from "sonner";

// ─── Query Keys ──────────────────────────────────────────────────────────────

export const userKeys = {
  all: ["users"] as const,
  lists: () => [...userKeys.all, "list"] as const,
  detail: (id: string) => [...userKeys.all, "detail", id] as const,
};

// ─── Queries ─────────────────────────────────────────────────────────────────

export function useUsers() {
  return useQuery({
    queryKey: userKeys.lists(),
    queryFn: async () => {
      const data = await usersApi.list();
      return data.users;
    },
  });
}

// ─── Mutations ─────────────────────────────────────────────────────────────────

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateUserPayload) => usersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      toast.success("User created successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message ?? "Failed to create user");
    },
  });
}

export function useUpdateUser(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateUserPayload) => usersApi.update(id, data),
    onSuccess: (updated: AdminUser) => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      queryClient.setQueryData(userKeys.detail(id), updated);
      toast.success("User updated successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message ?? "Failed to update user");
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      toast.success("User deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message ?? "Failed to delete user");
    },
  });
}

export function useBanUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      usersApi.ban(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      toast.success("User banned");
    },
    onError: (error: Error) => {
      toast.error(error.message ?? "Failed to ban user");
    },
  });
}

export function useUnbanUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => usersApi.unban(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      toast.success("User unbanned");
    },
    onError: (error: Error) => {
      toast.error(error.message ?? "Failed to unban user");
    },
  });
}
