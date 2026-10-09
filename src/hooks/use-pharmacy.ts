"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const pharmacyKeys = {
  all: ["pharmacy"] as const,
  overview: (period: string) => [...pharmacyKeys.all, "overview", period] as const,
  sales: (period: string) => [...pharmacyKeys.all, "sales", period] as const,
  ar: (period: string, page = 1, limit = 10) => [...pharmacyKeys.all, "ar", period, page, limit] as const,
  inventory: (period: string, page = 1, limit = 10) => [...pharmacyKeys.all, "inventory", period, page, limit] as const,
  payables: (period: string, page = 1, limit = 10) => [...pharmacyKeys.all, "payables", period, page, limit] as const,
  team: (period: string) => [...pharmacyKeys.all, "team", period] as const,
};

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { cache: "no-store", signal });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { message?: string }).message ?? "Request failed");
  return (await res.json()) as T;
}

// Minimal shared shapes (APIs return more; pages pick what they need).
export interface PharmaKpi {
  current: number;
  target: number | null;
  expected: number | null;
  status: string;
  tone: "emerald" | "red" | "sky" | "amber" | "slate";
  progress: number;
}

export interface PharmaAlert {
  title: string;
  detail: string;
  tone: "red" | "amber" | "emerald";
  action?: { label: string; href: string };
}

export interface CompanyHealth {
  company: string;
  sales: number;
  prevSales: number;
  momPct: number;
  arOverdue: number;
}

export interface PharmacyOverview {
  period: string;
  anchor: { period: "month" | "year"; year: number; month: number; label: string };
  ratio: number;
  targets: {
    sales: number | null;
    collection: number | null;
    expense: number | null;
    arLimit: number | null;
    apLimit: number | null;
  };
  sales: { total: number; lines: number; target: number | null; kpi: PharmaKpi; momPct?: number };
  collection: { total: number; invoices: number; target: number | null; kpi: PharmaKpi };
  purchases: { total: number; invoices: number; target: number | null; kpi: PharmaKpi };
  ar: { outstanding: number; overdue: number; openCount: number; limit: number | null; kpi: PharmaKpi };
  ap: { outstanding: number; overdue: number; openCount: number; limit: number | null; kpi: PharmaKpi };
  stock: { value: number; skus: number; stockout?: number; expiring90?: number };
  cash: { net: number; label: string };
  alerts?: PharmaAlert[];
  companyHealth?: CompanyHealth[];
  collectionByBank?: Array<{ bank: string; amount: number; count: number }>;
  cashflow?: Array<{ month: string; collection: number; purchases: number }>;
  salesTrend?: Array<{ month: string; amount: number }>;
}

export interface KeyAmount { key: string; amount: number; lines?: number; qty?: number }

export interface PharmacySales {
  totals: { amount: number; qty: number; lines: number };
  byCompany: Array<KeyAmount & { qty: number }>;
  byProduct: Array<{ key: string; name: string; amount: number; qty: number; foc: number; ret: number }>;
  byCustomer: KeyAmount[];
  byChannel: KeyAmount[];
  trend: Array<{ month: string; amount: number }>;
}

export interface PharmacyArRow {
  id: string;
  companyName: string | null;
  customerName: string | null;
  region: string | null;
  invoiceNo: string;
  invoiceDate: string | null;
  dueDate: string | null;
  amount: number;
  overdueDays: number;
  priority: number;
  bucket: string;
}

export interface PharmacyAr {
  buckets: Array<{ bucket: string; count: number; amount: number }>;
  current: { count: number; amount: number };
  total: { count: number; amount: number };
  page: number;
  limit: number;
  totalPriority: number;
  priority: PharmacyArRow[];
}

export interface PharmacyInventoryRow {
  itemCode: string;
  itemName: string | null;
  qty: number;
  unitPrice: number | null;
  amount: number | null;
  avgDailySales: number;
  coverDays: number | null;
  lastSale: string | null;
  flag: "stockout" | "low" | "overstock" | "slow" | "ok";
  suggestedQty?: number;
  minQty?: number | null;
  maxQty?: number | null;
  principal?: string | null;
}

export interface ExpiryRow {
  itemCode: string;
  itemName: string | null;
  expDate: string | null;
  balance: number | null;
  daysToExpiry: number | null;
  bucket: string;
  source?: "lot" | "storein";
  batchNo?: string | null;
  supplierName?: string | null;
}

export interface PharmacyInventory {
  totals: { skus: number; value: number; stockout: number; belowMin?: number; overstock: number; slow: number; reorder: number; expired?: number; expiring90?: number };
  page: number;
  limit: number;
  filteredTotals?: { stockout: number; belowMin: number; overstock: number; slow: number; reorder: number };
  stockout: PharmacyInventoryRow[];
  belowMin?: PharmacyInventoryRow[];
  overstock: PharmacyInventoryRow[];
  slowMoving: PharmacyInventoryRow[];
  reorder: PharmacyInventoryRow[];
  expired?: ExpiryRow[];
  expiring?: ExpiryRow[];
}

export interface TeamMember {
  salesperson: string;
  collected: number;
  paidCount: number;
  outstanding: number;
  overdue: number;
  openCount: number;
  collectionRate: number;
}

export interface PharmacyTeam {
  period: string;
  bySalesperson: TeamMember[];
  byArea: Array<{ area: string; amount: number; lines: number }>;
}

export interface PharmacyPayableRow {
  id: string;
  supplierName: string | null;
  invoiceNumber: string;
  poNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  amount: number;
  overdue?: boolean;
  dueSoon?: boolean;
  discountAtRisk: number;
  priority: number;
}

export interface PharmacyPayables {
  totals: { outstanding: number; overdue: number; discountAtRisk: number; openCount: number };
  bySupplier: Array<{ supplier: string; outstanding: number; overdue: number; dueSoon: number; discountAtRisk: number; invoices: number }>;
  page: number;
  limit: number;
  totalPriority: number;
  priority: PharmacyPayableRow[];
}

export interface PharmaRecommendation {
  title: string;
  detail: string;
  link: string;
  priority: "high" | "medium" | "low";
}

export function usePharmacyRecommendations(periodKey?: string, enabled = true) {
  // Month-scoped MoM analysis; AR/AP/stock signals stay global (balances).
  const m = (periodKey ?? "").match(/^(\d{4})-(\d{2})/);
  const query = m ? `?year=${m[1]}&month=${Number(m[2])}` : "";
  return useQuery({
    queryKey: [...pharmacyKeys.all, "recommendations", periodKey ?? "current"] as const,
    queryFn: ({ signal }) =>
      getJson<{ recommendations: PharmaRecommendation[]; source: string; month?: string }>(
        `/api/pharmacy/recommendations${query}`,
        signal,
      ),
    staleTime: 60_000,
    enabled,
  });
}

export interface PharmaTargetsPayload {
  period: "month" | "year";
  year: number;
  month: number;
  targetSalesAmount: number | null;
  targetCollectionAmount: number | null;
  targetExpenseAmount: number | null;
  targetArLimit: number | null;
  targetApLimit: number | null;
}

export function useSavePharmacyTargets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: PharmaTargetsPayload) => {
      const res = await fetch("/api/settings/target", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(body.message ?? "Failed to save targets");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pharmacyKeys.all });
      toast.success("Targets saved");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to save targets");
    },
  });
}

export function periodQuery(period: string): string {
  // period like "overall" | "2026-08" (month) | "2026" (year) |
  // "2026-08-15" (day) | "custom:2026-06-01:2026-08-31"
  if (period === "overall") return "period=overall";
  const m = period.match(/^(\d{4})-(\d{2})$/);
  if (m) return `period=month&year=${m[1]}&month=${Number(m[2])}`;
  const d = period.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (d) return `period=day&year=${d[1]}&month=${Number(d[2])}&day=${Number(d[3])}`;
  const c = period.match(/^custom:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/);
  if (c) return `period=custom&from=${c[1]}&to=${c[2]}`;
  const y = period.match(/^(\d{4})$/);
  if (y) return `period=year&year=${y[1]}`;
  return "period=overall";
}

export function usePharmacyTeam(period: string, enabled = true) {
  return useQuery({
    queryKey: pharmacyKeys.team(period),
    queryFn: ({ signal }) => getJson<PharmacyTeam>(`/api/pharmacy/team?${periodQuery(period)}`, signal),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function usePharmacyOverview(period: string, enabled = true) {
  return useQuery({
    queryKey: pharmacyKeys.overview(period),
    queryFn: ({ signal }) => getJson<PharmacyOverview>(`/api/pharmacy/overview?${periodQuery(period)}`, signal),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function usePharmacySales(period: string, enabled = true) {
  return useQuery({
    queryKey: pharmacyKeys.sales(period),
    queryFn: ({ signal }) => getJson<PharmacySales>(`/api/pharmacy/sales-analysis?${periodQuery(period)}`, signal),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function usePharmacyAr(period: string, page = 1, limit = 10, search = "", enabled = true) {
  return useQuery({
    queryKey: [...pharmacyKeys.ar(period, page, limit), search] as const,
    queryFn: ({ signal }) => getJson<PharmacyAr>(`/api/pharmacy/ar-aging?${periodQuery(period)}&page=${page}&limit=${limit}&q=${encodeURIComponent(search)}`, signal),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function usePharmacyInventory(period: string, page = 1, limit = 10, search = "", enabled = true) {
  return useQuery({
    queryKey: [...pharmacyKeys.inventory(period, page, limit), search] as const,
    queryFn: ({ signal }) => getJson<PharmacyInventory>(`/api/pharmacy/inventory?${periodQuery(period)}&page=${page}&limit=${limit}&q=${encodeURIComponent(search)}`, signal),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function usePharmacyPayables(period: string, page = 1, limit = 10, search = "", enabled = true) {
  return useQuery({
    queryKey: [...pharmacyKeys.payables(period, page, limit), search] as const,
    queryFn: ({ signal }) => getJson<PharmacyPayables>(`/api/pharmacy/payables?${periodQuery(period)}&page=${page}&limit=${limit}&q=${encodeURIComponent(search)}`, signal),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function usePharmacyImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (form: FormData) => {
      const res = await fetch("/api/pharmacy/import", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(body.message ?? "Import failed");
      return body as {
        fileName: string; created: number; updated: number;
        sheets: Array<{ kind: string; sheetName: string; total: number; created: number; updated: number; skipped: number; errors: Array<{ row: number; reason: string }> }>;
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: pharmacyKeys.all });
      toast.success(`${data.fileName}: +${data.created} new, ${data.updated} updated`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Import failed");
    },
  });
}

export type PharmaDeleteScope = "purchase" | "sales" | "receivable" | "stock" | "levels" | "all";

export interface PharmaDeleteResult {
  success: boolean;
  scope: string;
  counts: Record<string, number>;
  total: number;
}

export function usePharmacyDeleteAll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (scope: PharmaDeleteScope) => {
      const res = await fetch(`/api/pharmacy/delete-all?scope=${scope}`, { method: "DELETE" });
      const body = (await res.json().catch(() => ({}))) as PharmaDeleteResult & { message?: string };
      if (!res.ok) throw new Error(body.message ?? "Delete failed");
      return body;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: pharmacyKeys.all });
      toast.success(`Deleted ${data.total} rows (${data.scope}) — restorable`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    },
  });
}

export function usePharmacyRestore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (scope: PharmaDeleteScope) => {
      const res = await fetch("/api/pharmacy/restore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const body = (await res.json().catch(() => ({}))) as PharmaDeleteResult & { message?: string };
      if (!res.ok) throw new Error(body.message ?? "Restore failed");
      return body;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: pharmacyKeys.all });
      toast.success(`Restored ${data.total} rows (${data.scope})`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Restore failed");
    },
  });
}
