import * as XLSX from "xlsx";
import { createHash } from "node:crypto";
import {
  isCustomerServiceHeaders,
  isMarketingMetricsHeaders,
  isProductCatalogHeaders,
  isSalesOrdersHeaders,
  parseCustomerServiceRows,
  parseMarketingMetricsRows,
  parseProductCatalogRows,
  parseSalesOrderRows,
  type ParsedCustomerServiceRow,
  type ParsedMarketingRow,
  type ParsedProductRow,
  type ParsedSalesOrderRow,
} from "@/lib/commerce-import";
import {
  isFinanceRecordsHeaders,
  parseFinanceRecordsSpreadsheet,
  type FinanceRecord,
} from "@/lib/finance-import";

// ─── Web data import (dashboard file upload, Excel/CSV only) ─────────────────
// Shared by POST /api/imports/preview and POST /api/imports/confirm.

import type { DataImportKind } from "@/lib/import-kinds";
export { DATA_IMPORT_KINDS, IMPORT_KIND_META as DATA_IMPORT_META, isDataImportKind } from "@/lib/import-kinds";
export type { DataImportKind, ImportKindMeta } from "@/lib/import-kinds";

export type PreviewCell = string | number | null;
export type PreviewRow = Record<string, PreviewCell>;

function formatDate(value: Date | null | undefined): string | null {
  if (!value || !(value instanceof Date) || isNaN(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}

function readHeaderRow(buffer: Buffer): string[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  if (workbook.SheetNames.length === 0) return [];
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1 });
  if (rows.length === 0 || !Array.isArray(rows[0])) return [];
  return rows[0].map((h) => String(h ?? ""));
}

/** Sniff the first sheet's header row — most-specific first. CS wins over sales
 *  (a CS sheet with order columns would otherwise match sales and lose
 *  CSAT/follow-up data); finance stays last as the least-specific fallback so
 *  minimal finance sheets (Date/Description/Type/Amount) still detect. */
export function detectDataImportKind(buffer: Buffer): DataImportKind | null {
  try {
    const headers = readHeaderRow(buffer);
    if (headers.length === 0) return null;
    if (isCustomerServiceHeaders(headers)) return "customer_service";
    if (isSalesOrdersHeaders(headers)) return "sales_orders";
    if (isMarketingMetricsHeaders(headers)) return "marketing_metrics";
    if (isProductCatalogHeaders(headers)) return "product_catalog";
    if (isFinanceRecordsHeaders(headers)) return "finance";
    return null;
  } catch {
    return null;
  }
}

export type ParsedImportData =
  | { kind: "sales_orders"; rows: ParsedSalesOrderRow[] }
  | { kind: "customer_service"; rows: ParsedCustomerServiceRow[] }
  | { kind: "finance"; rows: FinanceRecord[] }
  | { kind: "product_catalog"; rows: ParsedProductRow[] }
  | { kind: "marketing_metrics"; rows: ParsedMarketingRow[] };

export function parseDataImportBuffer(buffer: Buffer, kind: DataImportKind): ParsedImportData {
  switch (kind) {
    case "sales_orders":
      return { kind, rows: parseSalesOrderRows(buffer) };
    case "customer_service":
      return { kind, rows: parseCustomerServiceRows(buffer) };
    case "finance":
      return { kind, rows: parseFinanceRecordsSpreadsheet(buffer) };
    case "product_catalog":
      return { kind, rows: parseProductCatalogRows(buffer) };
    case "marketing_metrics":
      return { kind, rows: parseMarketingMetricsRows(buffer) };
  }
}

export function parsedImportRowCount(data: ParsedImportData): number {
  return data.rows.length;
}

/** Flatten a parsed row into displayable preview cells keyed by template columns. */
export function toPreviewRow(kind: DataImportKind, row: ParsedImportData["rows"][number]): PreviewRow {
  switch (kind) {
    case "sales_orders": {
      const r = row as ParsedSalesOrderRow;
      return {
        "Date": formatDate(r.orderDate),
        "Customer Name": r.customerName,
        "Phone": r.customerPhone,
        "Product Name": r.productName,
        "Product Code": r.sku,
        "Quantity": r.quantity,
        "Unit Price": r.unitPrice,
        "Stage": r.stage,
        "Fulfillment Status": r.fulfillmentStatus,
        "Notes": r.notes,
      };
    }
    case "customer_service": {
      const r = row as ParsedCustomerServiceRow;
      return {
        "Date": formatDate(r.contactDate),
        "Customer Name": r.customerName,
        "Company": r.company,
        "Phone": r.phone,
        "Email": r.email,
        "Purchased Product": r.purchasedProduct,
        "Purchase Amount (MMK)": r.purchaseAmount,
        "Status": r.status,
        "Next Follow Up": formatDate(r.nextFollowUp),
        "CSAT": r.csat,
        "Last Contact Note": r.lastContactNote,
      };
    }
    case "finance": {
      const r = row as FinanceRecord;
      return {
        "Date": formatDate(r.date),
        "Description": r.description || null,
        "Category": r.category || null,
        "Type": r.type || null,
        "Amount (MMK)": r.amount,
        "Payment Method": r.paymentMethod || null,
        "Reference": r.reference || null,
        "Notes": r.notes || null,
      };
    }
    case "product_catalog": {
      const r = row as ParsedProductRow;
      return {
        "Product Code": r.sku,
        "Product Name": r.name,
        "Category": r.category,
        "Unit Cost": r.unitCost,
        "Selling Price": r.sellingPrice,
        "Stock Qty": r.stockQty,
        "Low Stock Threshold": r.lowStockThreshold,
      };
    }
    case "marketing_metrics": {
      const r = row as ParsedMarketingRow;
      return {
        "Date": formatDate(r.metricDate),
        "Channel": r.channel,
        "Spend": r.spend,
        "Reach": r.reach,
        "Impressions": r.impressions,
        "Ad-driven Orders": r.adDrivenOrders,
        "Notes": r.note,
      };
    }
  }
}

export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024; // 10MB, same as Telegram

export function validateImportFile(file: File): string | null {
  const lower = file.name.toLowerCase();
  if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls") && !lower.endsWith(".csv")) {
    return "Only .xlsx, .xls, and .csv files are supported";
  }
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return "File is too large (max 10MB)";
  }
  if (file.size === 0) {
    return "File is empty";
  }
  return null;
}

// ─── Import fingerprints (idempotency) ───────────────────────────────────────

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function stableValue(value: unknown): unknown {
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = stableValue((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value ?? null;
}

/**
 * Build one stable import key per row: `<channel>:<ref>:<kind>:<index>:<row-hash>`.
 * - `channel`/`ref` isolate sources (`web:<file-sha>` vs `telegram:<message-id>`),
 *   so the same file via both channels imports once each — repeats within a
 *   channel are skipped.
 * - Row index is included so two identical rows in one file both import.
 * - Row-content hash means a corrected file (different content) imports fresh.
 */
export function fingerprintImportRows({
  channel,
  channelRef,
  kind,
  rows,
}: {
  channel: "web" | "telegram";
  channelRef: string;
  kind: DataImportKind;
  rows: unknown[];
}): string[] {
  return rows.map((row, idx) => {
    const rowHash = sha256Hex(JSON.stringify(stableValue(row))).slice(0, 16);
    return `${channel}:${channelRef}:${kind}:${idx}:${rowHash}`;
  });
}
