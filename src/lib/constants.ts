/**
 * Shared domain constants. Import these instead of hardcoding
 * status/department strings across API routes and libs.
 */

/** DemandRecord statuses considered terminal — excluded from "open" queries. */
export const CLOSED_DEMAND_STATUSES: string[] = ["closed", "completed"];

/** Receivable rows considered still open (unpaid). */
export const OPEN_AR_STATUSES: string[] = ["pending", "overdue"];

/** Purchase-invoice rows considered still open (unpaid). */
export const OPEN_AP_STATUSES: string[] = ["unpaid", "overdue", "partial"];

/** AR aging bucket labels, in order. */
export const AR_BUCKETS = ["0-7", "8-15", "16-30", "31-60", "61-90", "90+"] as const;
export type ArBucket = (typeof AR_BUCKETS)[number];

/** Pharmacy workbook sheet kinds produced by detectPharmaSheetKind. */
export const PHARMA_SHEET_KINDS = [
  "po",
  "invoice",
  "price_list",
  "stock",
  "receivable",
  "sales_maei",
  "sales_mega",
  "unknown",
] as const;
export type PharmaSheetKindValue = (typeof PHARMA_SHEET_KINDS)[number];
