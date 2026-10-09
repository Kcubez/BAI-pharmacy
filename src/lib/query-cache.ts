import type { QueryClient, QueryKey } from "@tanstack/react-query";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function zeroStats(stats: unknown) {
  if (!isRecord(stats)) return stats;

  return Object.fromEntries(Object.keys(stats).map((key) => [key, 0]));
}

export function clearListQueryData(
  queryClient: QueryClient,
  queryKey: QueryKey,
  listKey: "records" | "customers",
) {
  queryClient.setQueriesData({ queryKey }, (data) => {
    if (!isRecord(data) || !Array.isArray(data[listKey])) return data;

    return {
      ...data,
      [listKey]: [],
      total: 0,
      totalPages: "totalPages" in data ? 1 : data.totalPages,
      stats: "stats" in data ? zeroStats(data.stats) : data.stats,
    };
  });
}

export function removeListItemQueryData(
  queryClient: QueryClient,
  queryKey: QueryKey,
  listKey: "records" | "customers",
  id: string,
) {
  queryClient.setQueriesData({ queryKey }, (data) => {
    if (!isRecord(data) || !Array.isArray(data[listKey])) return data;

    const nextItems = data[listKey].filter((item) => isRecord(item) && item.id !== id);
    const total = typeof data.total === "number" ? Math.max(0, data.total - 1) : data.total;

    return {
      ...data,
      [listKey]: nextItems,
      total,
    };
  });
}
