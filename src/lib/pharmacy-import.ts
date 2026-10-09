import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { parseExcelDate } from "@/lib/demand-parser";
import { restoreData } from "@/lib/soft-delete";
import {
  makeRowAccessor,
  normalizeCode,
  normalizeHeaderKey,
  normalizeName,
  toNumber,
  toRate,
} from "@/lib/text-normalize";

// ─── Pharmacy Excel import ─────────────────────────────────────────────────
// Parses the distributor's monthly workbooks:
//   Purchase Order (June/July/August PO sheets) · Invoice (+weekly splits are
//   skipped — the main Invoice sheet holds all rows) · Price List · Stock
//   snapshots · Receivable sheets · MA EI + Mega sales-detail sheets ·
//   iStock POS exports (movement history, min/max levels, expiry lots,
//   return-in lines — sparse merged headers handled by deep header scan).
//
// Convention: every row gets a stable importKey
//   `ph:<source>:<userId>:<natural-key>` so re-imports upsert instead of
//   duplicating. Suppliers / products are auto-created as stubs and enriched
//   on later imports.

export type PharmaSheetKind =
  | "po"
  | "invoice"
  | "price_list"
  | "stock"
  | "receivable"
  | "sales_maei"
  | "sales_mega"
  | "movement"
  | "minmax"
  | "expiry"
  | "storein"
  | "returns"
  | "unknown";

export interface SheetRef {
  sheetName: string;
  rows: Record<string, unknown>[];
  /** Text above the header row (iStock titles like "Sales History" /
   *  "ReturnIn History") — disambiguates same-column layouts. */
  titleHint: string;
}

/** Read a workbook and return each sheet's rows with its real header row.
 *  Some sheets (MA EI) have title/blank rows above the header, so the first
 *  row containing a known anchor column is used as the header. */
export function readPharmacyWorkbook(fileBuffer: Buffer): SheetRef[] {
  const workbook = XLSX.read(fileBuffer, { type: "buffer", cellDates: true });
  const out: SheetRef[] = [];
  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: true,
      defval: null,
    }) as unknown[][];
    if (grid.length === 0) continue;
    // Find header row: first of the top 6 rows containing a known anchor
    // column. iStock POS exports (movement / min-max / expiry / returns)
    // have title + From/To + group rows above the header, so fall back to a
    // deep scan (top 12 rows) for a row with >=2 recognised columns.
    const FAST_ANCHORS = new Set([
      "po number", "invoice number", "item code", "invoice no.",
      "ref no", "order no",
    ]);
    const BROAD_ANCHORS = new Set([
      ...FAST_ANCHORS,
      "code", "product code", "description", "product name", "item name",
      "opening", "closing", "purchase", "sale", "exp date", "expire date",
      "max", "min", "balance", "physical (qty)",
      "date", "qty", "qty on hand", "quantity", "amount", "sale price",
      "unit price", "unit cost", "batch no", "packing size",
      "storein date", "mfg date", "supplier name",
    ]);
    let headerIdx = 0;
    let found = false;
    for (let i = 0; i < Math.min(6, grid.length); i++) {
      const keys = (grid[i] ?? []).map(normalizeHeaderKey);
      if (keys.some((k) => FAST_ANCHORS.has(k))) {
        headerIdx = i;
        found = true;
        break;
      }
    }
    if (!found) {
      for (let i = 0; i < Math.min(12, grid.length); i++) {
        const keys = (grid[i] ?? []).map(normalizeHeaderKey);
        if (keys.filter((k) => BROAD_ANCHORS.has(k)).length >= 2) {
          headerIdx = i;
          found = true;
          break;
        }
      }
    }
    if (!found) continue;
    const titleHint = grid
      .slice(0, headerIdx)
      .flatMap((r) => (r ?? []).map((c) => String(c ?? "").trim()).filter(Boolean))
      .join(" ")
      .toLowerCase();
    const headers = (grid[headerIdx] ?? []).map((h) =>
      h === null || h === undefined || h === "" ? `__col` : String(h),
    );
    const rows: Record<string, unknown>[] = [];
    for (let r = headerIdx + 1; r < grid.length; r++) {
      const line = grid[r] ?? [];
      const row: Record<string, unknown> = {};
      let nonEmpty = 0;
      headers.forEach((h, c) => {
        const v = line[c] ?? null;
        row[h] = v;
        if (v !== null && v !== "" && !String(h).startsWith("__col")) nonEmpty++;
      });
      if (nonEmpty > 0) rows.push(row);
    }
    out.push({ sheetName, rows, titleHint });
  }
  return out;
}

export function detectPharmaSheetKind(sheet: SheetRef): PharmaSheetKind {
  const name = sheet.sheetName.trim().toLowerCase();
  const first = sheet.rows[0] ?? {};
  const h = Object.keys(first).map(normalizeHeaderKey);

  // Name-based fast path for the known workbook layouts.
  if (/^(june|july|august) po$/.test(name) || name === "auguest po") return "po";
  if (name === "invoice") return "invoice";
  if (name === "price list") return "price_list";
  if (/^(june|july|august)$/.test(name) && h.includes("item code") && h.includes("qty"))
    return "stock";
  if (/^(june|july|august)$/.test(name) && h.includes("invoice no.")) return "receivable";
  if (name.startsWith("ma ei")) return "sales_maei";
  if (name.startsWith("mega")) return "sales_mega";

  // Header-based fallback.
  if (h.includes("po number") && h.includes("quantity ordered")) return "po";
  if (h.includes("invoice number") && h.includes("credit term")) return "invoice";
  if (h.includes("item code") && h.includes("old price")) return "price_list";
  if (h.includes("invoice no.") && h.includes("payment status")) return "receivable";
  if (h.includes("ref no") && h.includes("tsp(area)")) return "sales_maei";
  if (h.includes("order no") && h.includes("confirmed qty")) return "sales_mega";
  if (h.includes("item code") && h.includes("qty") && h.includes("unit price"))
    return "stock";
  // iStock POS-export family (sparse merged headers, picked up by deep scan).
  if (
    (h.includes("opening") || h.includes("opening qty")) &&
    (h.includes("closing") || h.includes("closing qty"))
  ) return "movement";
  // "Expire Date (DD-MMM-YYYY)" (Mega file) normalizes with the suffix —
  // match by prefix.
  const hasExpDate = h.includes("exp date") || h.some((k) => k.startsWith("expire date"));
  if (hasExpDate) {
    // Store-in lists carry batches (no item codes) — separate kind.
    if (h.includes("batch no")) return "storein";
    return "expiry";
  }
  if (h.includes("max") && h.includes("min")) return "minmax";
  if (h.includes("sale price") && h.includes("code") && h.includes("date")) {
    // Same columns as the iStock Sales History report — only ReturnIn
    // History is returns; sales history stays skipped (MA EI/Mega cover it).
    return /return/.test(sheet.titleHint) ? "returns" : "unknown";
  }
  return "unknown";
}

// ─── Supplier / product resolvers (per-import cached) ────────────────────────

export interface ImportCtx {
  userId: string;
  sourceFileName: string;
  sheetName: string;
  overwrite: boolean;
  restore: Record<string, unknown>;
  supplierCache: Map<string, string | null>;
  productCache: Map<string, string | null>;
}

export function createImportCtx(
  userId: string,
  sourceFileName: string,
  sheetName: string,
  overwrite = false,
): ImportCtx {
  return {
    userId, sourceFileName, sheetName, overwrite,
    restore: restoreData(userId),
    supplierCache: new Map(),
    productCache: new Map(),
  };
}

async function resolveSupplierId(
  ctx: ImportCtx,
  name: unknown,
  extra?: { creditTermDays?: number | null; dealerCommRate?: number | null; inTimeDiscRate?: number | null },
): Promise<string | null> {
  const nameNormalized = normalizeName(name);
  if (!nameNormalized) return null;
  const cached = ctx.supplierCache.get(nameNormalized);
  if (cached !== undefined) return cached;
  const display = String(name ?? "").trim();
  const row = await prisma.supplier.upsert({
    where: { userId_nameNormalized: { userId: ctx.userId, nameNormalized } },
    update: {
      ...(extra?.creditTermDays != null ? { creditTermDays: extra.creditTermDays } : {}),
      ...(extra?.dealerCommRate != null ? { dealerCommRate: extra.dealerCommRate } : {}),
      ...(extra?.inTimeDiscRate != null ? { inTimeDiscRate: extra.inTimeDiscRate } : {}),
      ...ctx.restore,
    },
    create: {
      userId: ctx.userId,
      name: display,
      nameNormalized,
      creditTermDays: extra?.creditTermDays ?? null,
      dealerCommRate: extra?.dealerCommRate ?? null,
      inTimeDiscRate: extra?.inTimeDiscRate ?? null,
    },
    select: { id: true },
  });
  ctx.supplierCache.set(nameNormalized, row.id);
  return row.id;
}

async function resolveProductId(
  ctx: ImportCtx,
  itemCode: unknown,
  itemName?: unknown,
  extra?: { principal?: string | null; unitPrice?: number | null },
): Promise<string | null> {
  const itemCodeNormalized = normalizeCode(itemCode);
  if (!itemCodeNormalized) return null;
  const cached = ctx.productCache.get(itemCodeNormalized);
  if (cached !== undefined) return cached;
  const row = await prisma.pharmaProduct.upsert({
    where: { userId_itemCodeNormalized: { userId: ctx.userId, itemCodeNormalized } },
    update: {
      ...(itemName ? { itemName: String(itemName).trim() } : {}),
      ...(extra?.principal ? { principal: String(extra.principal).trim() } : {}),
      ...(extra?.unitPrice != null ? { unitPrice: extra.unitPrice } : {}),
      ...ctx.restore,
    },
    create: {
      userId: ctx.userId,
      itemCode: String(itemCode ?? "").trim(),
      itemCodeNormalized,
      itemName: itemName ? String(itemName).trim() : String(itemCode ?? "").trim(),
      principal: extra?.principal ? String(extra.principal).trim() : null,
      unitPrice: extra?.unitPrice ?? null,
    },
    select: { id: true },
  });
  ctx.productCache.set(itemCodeNormalized, row.id);
  return row.id;
}

/** Bulk-create missing products in one shot (first import of a sheet is
 *  then ~3 queries instead of ~1500 upserts). Existing products are left
 *  untouched unless overwrite=true (per-row enrichment, opt-in slow path). */
async function bulkEnsureProducts(
  ctx: ImportCtx,
  items: Array<{ code: unknown; name?: unknown; principal?: string | null; unitPrice?: number | null }>,
  overwrite: boolean,
): Promise<void> {
  const byCode = new Map<string, { name?: unknown; principal?: string | null; unitPrice?: number | null }>();
  for (const it of items) {
    const code = normalizeCode(it.code);
    if (!code || ctx.productCache.has(code)) continue;
    if (!byCode.has(code)) byCode.set(code, it);
  }
  const codes = [...byCode.keys()];
  if (codes.length === 0) return;
  // Insert genuinely-new products in bulk (skipDuplicates guards races).
  const toCreate = [];
  for (let i = 0; i < codes.length; i += 1000) {
    const chunk = codes.slice(i, i + 1000);
    const found = await prisma.pharmaProduct.findMany({
      where: { userId: ctx.userId, itemCodeNormalized: { in: chunk } },
      select: { id: true, itemCodeNormalized: true },
    });
    const have = new Set(found.map((f) => f.itemCodeNormalized));
    for (const f of found) if (f.itemCodeNormalized) ctx.productCache.set(f.itemCodeNormalized, f.id);
    for (const code of chunk) {
      if (have.has(code)) continue;
      const it = byCode.get(code);
      if (!it) continue;
      toCreate.push({
        userId: ctx.userId,
        itemCode: code,
        itemCodeNormalized: code,
        itemName: it.name ? String(it.name).trim() : code,
        principal: it.principal ? String(it.principal).trim() : null,
        unitPrice: it.unitPrice ?? null,
      });
    }
  }
  for (let i = 0; i < toCreate.length; i += 500) {
    await prisma.pharmaProduct.createMany({
      data: toCreate.slice(i, i + 500),
      skipDuplicates: true,
    });
  }
  if (toCreate.length > 0) {
    // Refill cache ids for the just-created rows.
    for (let i = 0; i < codes.length; i += 1000) {
      const chunk = codes.slice(i, i + 1000);
      const found = await prisma.pharmaProduct.findMany({
        where: { userId: ctx.userId, itemCodeNormalized: { in: chunk } },
        select: { id: true, itemCodeNormalized: true },
      });
      for (const f of found) if (f.itemCodeNormalized) ctx.productCache.set(f.itemCodeNormalized, f.id);
    }
  }
  if (overwrite) {
    const enrich: Array<{ id: string; name: string | null; principal: string | null; unitPrice: number | null }> = [];
    for (const [code, it] of byCode) {
      const id = ctx.productCache.get(code);
      if (!id) continue;
      enrich.push({
        id,
        name: it.name ? String(it.name).trim() : code,
        principal: it.principal ? String(it.principal).trim() : null,
        unitPrice: it.unitPrice ?? null,
      });
    }
    await bulkEnrichProducts(ctx, enrich);
  }
}

/** Bulk enrichment for products: one UPDATE...FROM(VALUES) per 500 rows
 *  instead of per-row updates (~2s vs ~70s for 2k rows over the pooler).
 *  Values are parameterised via Prisma.join — no string interpolation. */
async function bulkEnrichProducts(
  ctx: ImportCtx,
  rows: Array<{ id: string; name: string | null; principal: string | null; unitPrice: number | null }>,
): Promise<number> {
  let n = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    if (chunk.length === 0) break;
    const values = Prisma.join(
      chunk.map((r) => Prisma.sql`(${r.id}::TEXT, ${r.name}::TEXT, ${r.principal}::TEXT, ${r.unitPrice}::DOUBLE PRECISION)`),
    );
    n += await prisma.$executeRaw`
      UPDATE pharma_product AS p SET
        item_name = v.name,
        principal = v.principal,
        unit_price = v.unit_price,
        updated_at = NOW(),
        deleted_at = NULL,
        deleted_by_user_id = NULL,
        deleted_reason = NULL,
        restored_at = NOW(),
        restored_by_user_id = ${ctx.userId}
      FROM (VALUES ${values}) AS v(id, name, principal, unit_price)
      WHERE p.id = v.id AND p.user_id = ${ctx.userId}`;
  }
  return Number(n);
}

/** Bulk-load existing supplier/product ids into the ctx caches so the
 *  per-row resolvers only hit the DB on cache miss (new records). */
async function prewarmCaches(
  ctx: ImportCtx,
  supplierNames: unknown[],
  itemCodes: unknown[],
): Promise<void> {
  const supKeys = [...new Set(
    supplierNames.map((n) => normalizeName(n)).filter((k): k is string => !!k),
  )].filter((k) => !ctx.supplierCache.has(k));
  if (supKeys.length > 0) {
    for (let i = 0; i < supKeys.length; i += 1000) {
      const chunk = supKeys.slice(i, i + 1000);
      const rows = await prisma.supplier.findMany({
        where: { userId: ctx.userId, nameNormalized: { in: chunk } },
        select: { id: true, nameNormalized: true },
      });
      for (const r of rows) if (r.nameNormalized) ctx.supplierCache.set(r.nameNormalized, r.id);
    }
  }
  const codeKeys = [...new Set(
    itemCodes.map((c) => normalizeCode(c)).filter((k): k is string => !!k),
  )].filter((k) => !ctx.productCache.has(k));
  if (codeKeys.length > 0) {
    for (let i = 0; i < codeKeys.length; i += 1000) {
      const chunk = codeKeys.slice(i, i + 1000);
      const rows = await prisma.pharmaProduct.findMany({
        where: { userId: ctx.userId, itemCodeNormalized: { in: chunk } },
        select: { id: true, itemCodeNormalized: true },
      });
      for (const r of rows) if (r.itemCodeNormalized) ctx.productCache.set(r.itemCodeNormalized, r.id);
    }
  }
}

// ─── Row parsers (pure — no DB) ──────────────────────────────────────────────

export interface ParsedPO {
  importKey: string;
  supplierName: string | null;
  companyName: string | null;
  assignedStaff: string | null;
  poNumber: string;
  poDate: Date | null;
  itemCode: string | null;
  itemName: string | null;
  qtyOrdered: number | null;
  qtyDelivered: number | null;
  focQty: number | null;
  discountRate: number | null;
  discountAmount: number | null;
  unitPrice: number | null;
  netAmount: number | null;
}

export function parsePOSheet(sheet: SheetRef, userId: string): ParsedPO[] {
  return sheet.rows.flatMap((row) => {
    const get = makeRowAccessor(row);
    const poNumber = String(get("po number") ?? "").trim();
    if (!poNumber) return [];
    const itemCode = get("item code") ? String(get("item code")).trim() : null;
    return [
      {
        importKey: `ph:po:${userId}:${poNumber}:${itemCode ?? "noline"}`,
        supplierName: get("supplier name") ? String(get("supplier name")).trim() : null,
        companyName: get("company name") ? String(get("company name")).trim() : null,
        assignedStaff: get("assigned staff") ? String(get("assigned staff")).trim() : null,
        poNumber,
        poDate: parseExcelDate(get("po date")),
        itemCode,
        itemName: get("item name") ? String(get("item name")).trim() : null,
        qtyOrdered: toNumber(get("quantity ordered")),
        qtyDelivered: toNumber(get("quantity delivered")),
        focQty: toNumber(get("foc")),
        discountRate: toRate(get("discount")),
        discountAmount: toNumber(get("discount amount")),
        unitPrice: toNumber(get("unit price")),
        netAmount: toNumber(get("net amount", "gross amount")),
      },
    ];
  });
}

export interface ParsedInvoice {
  importKey: string;
  supplierName: string | null;
  poNumber: string | null;
  invoiceNumber: string;
  creditTermDays: number | null;
  invoiceDate: Date | null;
  arrivalDate: Date | null;
  dueDate: Date | null;
  amount: number | null;
  dealerCommRate: number | null;
  dealerCommAmt: number | null;
  inTimeDiscRate: number | null;
  inTimeDiscAmt: number | null;
  taxAmount: number | null;
  netAmount: number | null;
  creditNote: number | null;
  status: string | null;
  overdueDays: number | null;
  paidDate: Date | null;
}

function mapInvoiceStatus(raw: unknown): string {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s.includes("paid") && !s.includes("unpaid")) return "paid";
  if (s.includes("overdue")) return "overdue";
  if (s.includes("partial")) return "partial";
  return "unpaid";
}

export function parseInvoiceSheet(sheet: SheetRef, userId: string): ParsedInvoice[] {
  return sheet.rows.flatMap((row) => {
    const get = makeRowAccessor(row);
    const invoiceNumber = String(get("invoice number") ?? "").trim();
    if (!invoiceNumber) return [];
    const supplierName = get("company name") ? String(get("company name")).trim() : null;
    const keyBase = `${supplierName ?? "nosup"}:${invoiceNumber}`;
    return [
      {
        importKey: `ph:inv:${userId}:${keyBase}`,
        supplierName,
        poNumber: get("purchase order") ? String(get("purchase order")).trim() : null,
        invoiceNumber,
        creditTermDays: toNumber(get("credit term")),
        invoiceDate: parseExcelDate(get("invoice date")),
        arrivalDate: parseExcelDate(get("arrival date")),
        dueDate: parseExcelDate(get("due date")),
        amount: toNumber(get("amount")),
        dealerCommRate: toRate(get("dealer comm:")),
        dealerCommAmt: toNumber(get("comm: amount")),
        inTimeDiscRate: toRate(get("in time payment percent")),
        inTimeDiscAmt: toNumber(get("in time payment amount")),
        taxAmount: toNumber(get("tax")),
        netAmount: toNumber(get("amount after dealer comm", "total(amount after dealer+in tiime)")),
        creditNote: toNumber(get("credit note")),
        status: mapInvoiceStatus(get("status")),
        overdueDays: toNumber(get("overdue days")),
        paidDate: parseExcelDate(get("paid date")),
      },
    ];
  });
}

export interface ParsedPriceRow {
  importKey: string;
  companyName: string | null;
  itemName: string;
  itemCode: string | null;
  unitPrice: number | null;
  oldPrice: number | null;
}

export function parsePriceListSheet(sheet: SheetRef, userId: string): ParsedPriceRow[] {
  return sheet.rows.flatMap((row) => {
    const get = makeRowAccessor(row);
    const itemCode = get("item code") ? String(get("item code")).trim() : null;
    const itemName = get("item name") ? String(get("item name")).trim() : null;
    if (!itemCode && !itemName) return [];
    return [
      {
        importKey: `ph:price:${userId}:${itemCode ?? itemName}`,
        companyName: get("company name") ? String(get("company name")).trim() : null,
        itemName: itemName ?? itemCode ?? "",
        itemCode,
        unitPrice: toNumber(get("unit price")),
        oldPrice: toNumber(get("old price")),
      },
    ];
  });
}

export interface ParsedStock {
  importKey: string;
  itemCode: string;
  itemName: string | null;
  qty: number;
  unitPrice: number | null;
  amount: number | null;
}

export function parseStockSheet(
  sheet: SheetRef,
  userId: string,
  year: number,
  month: number,
): ParsedStock[] {
  return sheet.rows.flatMap((row) => {
    const get = makeRowAccessor(row);
    const itemCode = get("item code") ? String(get("item code")).trim() : null;
    if (!itemCode) return [];
    return [
      {
        importKey: `ph:stock:${userId}:${year}-${month}:${itemCode}`,
        itemCode,
        itemName: get("item name") ? String(get("item name")).trim() : null,
        qty: toNumber(get("qty")) ?? 0,
        unitPrice: toNumber(get("unit price")),
        amount: toNumber(get("amount")),
      },
    ];
  });
}

export interface ParsedReceivable {
  importKey: string;
  companyName: string | null;
  customerName: string | null;
  region: string | null;
  salesperson: string | null;
  invoiceNo: string;
  invoiceDate: Date | null;
  dueDate: Date | null;
  creditTerms: number | null;
  amount: number | null;
  returnAmount: number | null;
  netAmount: number | null;
  paidDate: Date | null;
  paymentStatus: string | null;
  overdueDays: number | null;
  bank: string | null;
}

export function parseReceivableSheet(sheet: SheetRef, userId: string): ParsedReceivable[] {
  return sheet.rows.flatMap((row) => {
    const get = makeRowAccessor(row);
    const invoiceNo = String(get("invoice no.") ?? "").trim();
    if (!invoiceNo) return [];
    const customerName = get("customer name") ? String(get("customer name")).trim() : null;
    const rawStatus = String(get("payment status") ?? "").trim().toLowerCase();
    const paymentStatus = rawStatus.includes("paid") && !rawStatus.includes("unpaid")
      ? "paid"
      : rawStatus.includes("overdue")
        ? "overdue"
        : rawStatus || "pending";
    return [
      {
        importKey: `ph:ar:${userId}:${customerName ?? "nocust"}:${invoiceNo}`,
        companyName: get("company name") ? String(get("company name")).trim() : null,
        customerName,
        region: get("region") ? String(get("region")).trim() : null,
        salesperson: get("person") ? String(get("person")).trim() : null,
        invoiceNo,
        invoiceDate: parseExcelDate(get("invoice date")),
        dueDate: parseExcelDate(get("due date")),
        creditTerms: toNumber(get("credit terms")),
        amount: toNumber(get("amount")),
        returnAmount: toNumber(get("return amount")),
        netAmount: toNumber(get("net amount", "amount")),
        paidDate: parseExcelDate(get("paid date")),
        paymentStatus,
        overdueDays: toNumber(get("overdue days")),
        bank: get("bank") ? String(get("bank")).trim() : null,
      },
    ];
  });
}

export interface ParsedSale {
  importKey: string;
  channel: "MAEI" | "MEGA";
  saleDate: Date | null;
  customerName: string | null;
  refNo: string | null;
  itemCode: string | null;
  itemName: string | null;
  saleQty: number | null;
  focQty: number | null;
  returnQty: number | null;
  unitPrice: number | null;
  amount: number | null;
  discountRate: number | null;
  principal: string | null;
  tspArea: string | null;
}

export function parseMaEiSheet(sheet: SheetRef, userId: string): ParsedSale[] {
  return sheet.rows.flatMap((row, idx) => {
    const get = makeRowAccessor(row);
    const itemName = get("item description") ? String(get("item description")).trim() : null;
    const refNo = get("ref no") ? String(get("ref no")).trim() : null;
    if (!itemName && !refNo) return [];
    return [
      {
        importKey: `ph:sale-maei:${userId}:${refNo ?? `row${idx}`}:${itemName ?? "noitem"}`,
        channel: "MAEI" as const,
        saleDate: parseExcelDate(get("date")),
        customerName: get("customer name") ? String(get("customer name")).trim() : null,
        refNo,
        itemCode: null, // MA EI has no item code — matched to products by name later
        itemName,
        saleQty: toNumber(get("sale qty")),
        focQty: toNumber(get("foc qty")),
        returnQty: toNumber(get("return qty")),
        unitPrice: toNumber(get("unit price")),
        amount: toNumber(get("amount")),
        discountRate: toRate(get("trade discount")),
        principal: get("principal(supplier)") ? String(get("principal(supplier)")).trim() : null,
        tspArea: get("tsp(area)") ? String(get("tsp(area)")).trim() : null,
      },
    ];
  });
}

export function parseMegaSheet(sheet: SheetRef, userId: string): ParsedSale[] {
  return sheet.rows.flatMap((row, idx) => {
    const get = makeRowAccessor(row);
    const orderNo = get("order no") ? String(get("order no")).trim() : null;
    const itemCode = get("item code") ? String(get("item code")).trim() : null;
    if (!orderNo && !itemCode) return [];
    return [
      {
        importKey: `ph:sale-mega:${userId}:${orderNo ?? `row${idx}`}:${itemCode ?? "noline"}`,
        channel: "MEGA" as const,
        saleDate: parseExcelDate(get("order date")),
        customerName: get("customer name") ? String(get("customer name")).trim() : null,
        refNo: orderNo,
        itemCode,
        itemName: get("item name") ? String(get("item name")).trim() : null,
        saleQty: toNumber(get("confirmed qty", "ordered qty")),
        focQty: toNumber(get("bonus qty")),
        returnQty: toNumber(get("discount qty")),
        unitPrice: null, // derived: amount / confirmedQty when needed
        amount: toNumber(get("amount")),
        discountRate: null,
        principal: null,
        tspArea: null,
      },
    ];
  });
}

// ─── iStock POS-export parsers ─────────────────────────────────────────────
// Sparse merged headers (Code=A, Description=D/E…), title + From/To + group
// rows ("Class : X", supplier banners) mixed into the data. Group rows never
// have BOTH a real code and a description, so parsers require both.

/** True for iStock group/banner rows that must be skipped. */
function isIStockGroupRow(itemCode: string | null, itemName: string | null): boolean {
  if (!itemCode || !itemName) return true;
  return /^(class|category)\s*:/i.test(itemCode) || /^(class|category)\s*:/i.test(itemName);
}

export interface ParsedMovement {
  importKey: string;
  itemCode: string;
  itemName: string;
  unit: string | null;
  openingQty: number | null;
  purchaseQty: number | null;
  saleQty: number | null;
  closingQty: number | null;
}

export function parseMovementSheet(
  sheet: SheetRef,
  userId: string,
  year: number,
  month: number,
): ParsedMovement[] {
  return sheet.rows.flatMap((row) => {
    const get = makeRowAccessor(row);
    const itemCode = get("code", "item code") ? String(get("code", "item code")).trim() : null;
    const itemName = get("description", "item name") ? String(get("description", "item name")).trim() : null;
    if (isIStockGroupRow(itemCode, itemName)) return [];
    const openingQty = toNumber(get("opening", "opening qty"));
    const purchaseQty = toNumber(get("purchase", "purchase qty"));
    const saleQty = toNumber(get("sale", "sale qty"));
    const closingQty = toNumber(get("closing", "closing qty"));
    if (openingQty == null && purchaseQty == null && saleQty == null && closingQty == null) return [];
    return [
      {
        importKey: `ph:movement:${userId}:${year}-${month}:${normalizeCode(itemCode)}`,
        itemCode: itemCode!,
        itemName: itemName!,
        unit: get("unit") ? String(get("unit")).trim() : null,
        openingQty, purchaseQty, saleQty, closingQty,
      },
    ];
  });
}

export interface ParsedMinMax {
  importKey: string;
  itemCode: string;
  itemName: string;
  minQty: number | null;
  maxQty: number | null;
  balance: number | null;
}

export function parseMinMaxSheet(sheet: SheetRef, userId: string): ParsedMinMax[] {
  return sheet.rows.flatMap((row) => {
    const get = makeRowAccessor(row);
    const itemCode = get("code") ? String(get("code")).trim() : null;
    const itemName = get("description") ? String(get("description")).trim() : null;
    if (isIStockGroupRow(itemCode, itemName)) return [];
    const balance = toNumber(get("balance"));
    const minQty = toNumber(get("min"));
    const maxQty = toNumber(get("max"));
    if (balance == null && minQty == null && maxQty == null) return [];
    return [
      {
        importKey: `ph:minmax:${userId}:${normalizeCode(itemCode)}`,
        itemCode: itemCode!,
        itemName: itemName!,
        minQty, maxQty, balance,
      },
    ];
  });
}

export interface ParsedExpiry {
  importKey: string;
  itemCode: string;
  itemName: string;
  expDate: Date | null;
  balance: number | null;
}

export function parseExpirySheet(sheet: SheetRef, userId: string): ParsedExpiry[] {
  // Mega file header "Expire Date (DD-MMM-YYYY)" keeps its suffix after
  // normalization — resolve the real key once per sheet.
  const expKey = Object.keys(sheet.rows[0] ?? {}).find((k) => {
    const n = normalizeHeaderKey(k);
    return n === "exp date" || n.startsWith("expire date");
  });
  return sheet.rows.flatMap((row) => {
    const get = makeRowAccessor(row);
    // Mega Exp-Date file uses Product Code / Product Name / Expire Date /
    // Physical (Qty) headers — same grain (code + exp date).
    const itemCode = (get("code", "product code") ? String(get("code", "product code")).trim() : null);
    const itemName = (get("description", "product name") ? String(get("description", "product name")).trim() : null);
    if (isIStockGroupRow(itemCode, itemName)) return [];
    const rawExp = get("exp date") ?? (expKey ? row[expKey] : null);
    const expDate = parseExcelDate(rawExp);
    const balance = toNumber(get("balance", "physical (qty)"));
    if (expDate == null && (balance == null || balance === 0)) return [];
    const stamp = expDate
      ? `${expDate.getFullYear()}-${String(expDate.getMonth() + 1).padStart(2, "0")}-${String(expDate.getDate()).padStart(2, "0")}`
      : "nodate";
    return [
      {
        importKey: `ph:expiry:${userId}:${normalizeCode(itemCode)}:${stamp}`,
        itemCode: itemCode!,
        itemName: itemName!,
        expDate, balance,
      },
    ];
  });
}

export interface ParsedReturn {
  importKey: string;
  itemCode: string;
  itemName: string;
  returnDate: Date | null;
  qty: number | null;
  unitPrice: number | null;
  amount: number | null;
}

export function parseReturnsSheet(sheet: SheetRef, userId: string): ParsedReturn[] {
  return sheet.rows.flatMap((row, idx) => {
    const get = makeRowAccessor(row);
    const returnDate = parseExcelDate(get("date"));
    // Group banners ("Giant Wave") and the Currency sub-header have no date.
    if (returnDate == null) return [];
    const itemCode = get("code") ? String(get("code")).trim() : null;
    const itemName = get("description") ? String(get("description")).trim() : null;
    if (!itemCode || !itemName || /^(currency)$/i.test(itemCode)) return [];
    const stamp = `${returnDate.getFullYear()}-${String(returnDate.getMonth() + 1).padStart(2, "0")}-${String(returnDate.getDate()).padStart(2, "0")}`;
    return [
      {
        importKey: `ph:return:${userId}:${stamp}:${normalizeCode(itemCode)}:${idx}`,
        itemCode, itemName, returnDate,
        qty: toNumber(get("qty")),
        unitPrice: toNumber(get("sale price")),
        amount: toNumber(get("amount")),
      },
    ];
  });
}

export interface ParsedStoreIn {
  importKey: string;
  itemName: string;
  batchNo: string | null;
  packing: string | null;
  qtyOnHand: number | null;
  unitPrice: number | null;
  unitCost: number | null;
  storeinDate: Date | null;
  mfgDate: Date | null;
  expDate: Date | null;
  supplierName: string | null;
}

export function parseStoreInSheet(sheet: SheetRef, userId: string): ParsedStoreIn[] {
  return sheet.rows.flatMap((row, idx) => {
    const get = makeRowAccessor(row);
    const itemName = get("item name") ? String(get("item name")).trim() : null;
    if (!itemName || /^(class|category)\s*:/i.test(itemName)) return [];
    const batchNo = get("batch no") ? String(get("batch no")).trim() : null;
    const expDate = parseExcelDate(get("exp date"));
    const stamp = expDate
      ? `${expDate.getFullYear()}-${String(expDate.getMonth() + 1).padStart(2, "0")}-${String(expDate.getDate()).padStart(2, "0")}`
      : `row${idx}`;
    return [
      {
        importKey: `ph:storein:${userId}:${normalizeName(itemName)}:${batchNo ?? "nobatch"}:${stamp}`,
        itemName, batchNo,
        packing: get("packing size", "packing") ? String(get("packing size", "packing")).trim() : null,
        qtyOnHand: toNumber(get("qty on hand", "qty")),
        unitPrice: toNumber(get("unit price")),
        unitCost: toNumber(get("unit cost")),
        storeinDate: parseExcelDate(get("storein date")),
        mfgDate: parseExcelDate(get("mfg date")),
        expDate,
        supplierName: get("supplier name") ? String(get("supplier name")).trim() : null,
      },
    ];
  });
}

// ─── Importers (DB writes, idempotent via importKey) ─────────────────────────

export interface ImportError {
  row: number;
  reason: string;
}

const MAX_IMPORT_ERRORS = 50;

export interface ImportSummary {
  kind: PharmaSheetKind;
  sheetName: string;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: ImportError[];
}

function collectError(errors: ImportError[], row: number, e: unknown): void {
  if (errors.length >= MAX_IMPORT_ERRORS) return;
  errors.push({ row, reason: e instanceof Error ? e.message.slice(0, 200) : "Unknown error" });
}

function emptySummary(kind: PharmaSheetKind, sheetName: string, total: number): ImportSummary {
  return { kind, sheetName, total, created: 0, updated: 0, skipped: total, errors: [] };
}

// ─── Bulk write engine ───────────────────────────────────────────────────────
// One keys pre-check + createMany chunks for new rows; per-row updates only
// when overwrite=true (opt-in). Keeps a 3k-row sheet to a handful of queries.

interface BulkEntry<TCreate, TUpdate> {
  rowIdx: number;
  importKey: string;
  create: TCreate;
  update: TUpdate;
}

interface BulkOps<TCreate, TUpdate> {
  findExisting(keys: string[]): Promise<Map<string, string>>;
  createMany(rows: TCreate[]): Promise<number>;
  updateOne(id: string, data: TUpdate): Promise<void>;
}

function opsFor<TCreate, TUpdate>(userId: string, delegate: {
  findMany(args: {
    where: { userId: string; importKey: { in: string[] } };
    select: { id: boolean; importKey: boolean };
  }): Promise<Array<{ id: string; importKey: string | null }>>;
  createMany(args: { data: TCreate[]; skipDuplicates: boolean }): Promise<{ count: number }>;
  update(args: { where: { id: string }; data: TUpdate }): Promise<unknown>;
}): BulkOps<TCreate, TUpdate> {
  return {
    findExisting: async (keys: string[]) => {
      const map = new Map<string, string>();
      for (let i = 0; i < keys.length; i += 1000) {
        const chunk = keys.slice(i, i + 1000);
        if (chunk.length === 0) break;
        const rows = await delegate.findMany({
          where: { userId, importKey: { in: chunk } },
          select: { id: true, importKey: true },
        });
        for (const r of rows) if (r.importKey) map.set(r.importKey, r.id);
      }
      return map;
    },
    createMany: async (rows: TCreate[]) => {
      let n = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        if (chunk.length === 0) break;
        n += (await delegate.createMany({ data: chunk, skipDuplicates: true })).count;
      }
      return n;
    },
    updateOne: async (id: string, data: TUpdate) => {
      await delegate.update({ where: { id }, data });
    },
  };
}

async function bulkWrite<TCreate, TUpdate>(
  ctx: ImportCtx,
  kind: PharmaSheetKind,
  total: number,
  entries: Array<BulkEntry<TCreate, TUpdate>>,
  ops: BulkOps<TCreate, TUpdate>,
): Promise<ImportSummary> {
  const errors: ImportError[] = [];
  let created = 0, updated = 0, skipped = 0;
  const existing = await ops.findExisting(entries.map((e) => e.importKey));
  const fresh = entries.filter((e) => !existing.has(e.importKey));
  const dups = entries.filter((e) => existing.has(e.importKey));
  try {
    created += await ops.createMany(fresh.map((e) => e.create));
  } catch {
    // Fall back to per-row creates for error attribution.
    for (const e of fresh) {
      try {
        created += await ops.createMany([e.create]);
      } catch (err) { skipped++; collectError(errors, e.rowIdx, err); }
    }
  }
  if (ctx.overwrite) {
    for (const e of dups) {
      try {
        const id = existing.get(e.importKey);
        if (!id) { skipped++; continue; }
        await ops.updateOne(id, e.update);
        updated++;
      } catch (err) { skipped++; collectError(errors, e.rowIdx, err); }
    }
  } else {
    skipped += dups.length;
  }
  return { kind, sheetName: ctx.sheetName, total, created, updated, skipped, errors };
}

export async function importPOSheet(
  userId: string,
  sheet: SheetRef,
  sourceFileName: string,
  opts?: { overwrite?: boolean },
): Promise<ImportSummary> {
  const rows = parsePOSheet(sheet, userId);
  const ctx = createImportCtx(userId, sourceFileName, sheet.sheetName, opts?.overwrite);
  await prewarmCaches(
    ctx,
    rows.map((r) => r.supplierName ?? r.companyName),
    [],
  );
  await bulkEnsureProducts(
    ctx,
    rows.map((r) => ({ code: r.itemCode, name: r.itemName })),
    ctx.overwrite,
  );
  const entries: Array<BulkEntry<Prisma.PurchaseOrderCreateManyInput, Prisma.PurchaseOrderUpdateInput>> = [];
  for (const [rowIdx, r] of rows.entries()) {
    const supplierId = await resolveSupplierId(ctx, r.supplierName ?? r.companyName);
    const productId = await resolveProductId(ctx, r.itemCode, r.itemName);
    const data = {
      supplierId, supplierName: r.supplierName, companyName: r.companyName,
      assignedStaff: r.assignedStaff, poNumber: r.poNumber, poDate: r.poDate,
      productId, itemCode: r.itemCode, itemName: r.itemName,
      qtyOrdered: r.qtyOrdered, qtyDelivered: r.qtyDelivered, focQty: r.focQty,
      discountRate: r.discountRate, discountAmount: r.discountAmount,
      unitPrice: r.unitPrice, netAmount: r.netAmount,
      sourceFileName, sourceSheet: sheet.sheetName,
    };
    entries.push({
      rowIdx, importKey: r.importKey,
      create: { ...data, userId, importKey: r.importKey },
      update: data,
    });
  }
  return bulkWrite(ctx, "po", rows.length, entries,
    opsFor(userId, prisma.purchaseOrder));
}

export async function importInvoiceSheet(
  userId: string,
  sheet: SheetRef,
  sourceFileName: string,
  asOf: Date = new Date(),
  opts?: { overwrite?: boolean },
): Promise<ImportSummary> {
  const rows = parseInvoiceSheet(sheet, userId);
  const ctx = createImportCtx(userId, sourceFileName, sheet.sheetName, opts?.overwrite);
  await prewarmCaches(ctx, rows.map((r) => r.supplierName), []);
  const entries: Array<BulkEntry<Prisma.PurchaseInvoiceCreateManyInput, Prisma.PurchaseInvoiceUpdateInput>> = [];
  for (const [rowIdx, r] of rows.entries()) {
    const supplierId = await resolveSupplierId(ctx, r.supplierName, {
      creditTermDays: r.creditTermDays,
      dealerCommRate: r.dealerCommRate,
      inTimeDiscRate: r.inTimeDiscRate,
    });
    // Recompute overdue from dueDate when the sheet leaves it blank.
    let status = r.status;
    let overdueDays = r.overdueDays;
    if (r.dueDate && status !== "paid") {
      const diff = Math.floor((asOf.getTime() - r.dueDate.getTime()) / 86400000);
      if (diff > 0) {
        status = "overdue";
        if (overdueDays == null) overdueDays = diff;
      }
    }
    const data = {
      supplierId, supplierName: r.supplierName, companyName: r.supplierName,
      poNumber: r.poNumber, invoiceNumber: r.invoiceNumber,
      creditTermDays: r.creditTermDays, invoiceDate: r.invoiceDate,
      arrivalDate: r.arrivalDate, dueDate: r.dueDate, amount: r.amount,
      dealerCommRate: r.dealerCommRate, dealerCommAmt: r.dealerCommAmt,
      inTimeDiscRate: r.inTimeDiscRate, inTimeDiscAmt: r.inTimeDiscAmt,
      taxAmount: r.taxAmount, netAmount: r.netAmount, creditNote: r.creditNote,
      status: status ?? "unpaid", sourceFileName, sourceSheet: sheet.sheetName,
    };
    entries.push({
      rowIdx, importKey: r.importKey,
      create: { ...data, userId, importKey: r.importKey },
      update: data,
    });
  }
  return bulkWrite(ctx, "invoice", rows.length, entries,
    opsFor(userId, prisma.purchaseInvoice));
}

export async function importPriceListSheet(
  userId: string,
  sheet: SheetRef,
  sourceFileName: string,
): Promise<ImportSummary> {
  void sourceFileName;
  const rows = parsePriceListSheet(sheet, userId);
  const ctx = createImportCtx(userId, sourceFileName, sheet.sheetName, true);
  const errors: ImportError[] = [];
  let created = 0, updated = 0, skipped = 0;
  await bulkEnsureProducts(
    ctx,
    rows.map((r) => ({ code: r.itemCode ?? r.itemName, name: r.itemName, principal: r.companyName, unitPrice: r.unitPrice })),
    true, // price list is the product master — always enrich
  );
  // Bulk pre-check for accurate created/updated counts.
  const keyOf = (r: { itemCode: string | null; itemName: string }) =>
    normalizeCode(r.itemCode ?? r.itemName) ?? "";
  const keys = [...new Set(rows.map(keyOf).filter(Boolean))];
  const known = new Set<string>();
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    if (!chunk.length) break;
    const found = await prisma.pharmaProduct.findMany({
      where: { userId, itemCodeNormalized: { in: chunk } },
      select: { itemCodeNormalized: true },
    });
    for (const f of found) if (f.itemCodeNormalized) known.add(f.itemCodeNormalized);
  }
  for (const [rowIdx, r] of rows.entries()) {
    if (!r.itemCode && !r.itemName) { skipped++; continue; }
    try {
      const id = ctx.productCache.get(keyOf(r));
      if (!id) throw new Error(`product not ensured: ${keyOf(r)}`);
      if (known.has(keyOf(r))) updated++; else { created++; known.add(keyOf(r)); }
    } catch (e) { skipped++; collectError(errors, rowIdx, e); }
  }
  return { kind: "price_list", sheetName: sheet.sheetName, total: rows.length, created, updated, skipped, errors };
}

export async function importStockSheet(
  userId: string,
  sheet: SheetRef,
  sourceFileName: string,
  year: number,
  month: number,
  opts?: { overwrite?: boolean },
): Promise<ImportSummary> {
  const rows = parseStockSheet(sheet, userId, year, month);
  const ctx = createImportCtx(userId, sourceFileName, sheet.sheetName, opts?.overwrite);
  await bulkEnsureProducts(
    ctx,
    rows.map((r) => ({ code: r.itemCode, name: r.itemName, unitPrice: r.unitPrice })),
    ctx.overwrite,
  );
  const entries: Array<BulkEntry<Prisma.StockSnapshotCreateManyInput, Prisma.StockSnapshotUpdateInput>> = [];
  for (const [rowIdx, r] of rows.entries()) {
    const productId = await resolveProductId(ctx, r.itemCode, r.itemName, {
      unitPrice: r.unitPrice,
    });
    const data = {
      year, month, productId, itemCode: r.itemCode, itemName: r.itemName,
      qty: r.qty, unitPrice: r.unitPrice, amount: r.amount, sourceFileName,
    };
    entries.push({
      rowIdx, importKey: r.importKey,
      create: { ...data, userId, importKey: r.importKey },
      update: data,
    });
  }
  return bulkWrite(ctx, "stock", rows.length, entries,
    opsFor(userId, prisma.stockSnapshot));
}

export async function importReceivableSheet(
  userId: string,
  sheet: SheetRef,
  sourceFileName: string,
  asOf: Date = new Date(),
  opts?: { overwrite?: boolean },
): Promise<ImportSummary> {
  const rows = parseReceivableSheet(sheet, userId);
  const ctx = createImportCtx(userId, sourceFileName, sheet.sheetName, opts?.overwrite);
  const entries: Array<BulkEntry<Prisma.ReceivableCreateManyInput, Prisma.ReceivableUpdateInput>> = [];
  for (const [rowIdx, r] of rows.entries()) {
    let { paymentStatus, overdueDays } = r;
    if (r.dueDate && paymentStatus !== "paid") {
      const diff = Math.floor((asOf.getTime() - r.dueDate.getTime()) / 86400000);
      if (diff > 0) {
        paymentStatus = "overdue";
        if (overdueDays == null) overdueDays = diff;
      }
    }
    const data = {
      companyName: r.companyName, customerName: r.customerName, region: r.region,
      salesperson: r.salesperson, invoiceNo: r.invoiceNo, invoiceDate: r.invoiceDate,
      dueDate: r.dueDate, creditTerms: r.creditTerms, amount: r.amount,
      returnAmount: r.returnAmount, netAmount: r.netAmount, paidDate: r.paidDate,
      paymentStatus, overdueDays, bank: r.bank,
      sourceFileName, sourceSheet: sheet.sheetName,
    };
    entries.push({
      rowIdx, importKey: r.importKey,
      create: { ...data, userId, importKey: r.importKey },
      update: data,
    });
  }
  return bulkWrite(ctx, "receivable", rows.length, entries,
    opsFor(userId, prisma.receivable));
}

export async function importSalesSheet(
  userId: string,
  sheet: SheetRef,
  sourceFileName: string,
  channel: "MAEI" | "MEGA",
  opts?: { overwrite?: boolean },
): Promise<ImportSummary> {
  const rows = channel === "MAEI" ? parseMaEiSheet(sheet, userId) : parseMegaSheet(sheet, userId);
  const ctx = createImportCtx(userId, sourceFileName, sheet.sheetName, opts?.overwrite);
  await bulkEnsureProducts(
    ctx,
    rows.filter((r) => r.itemCode).map((r) => ({ code: r.itemCode, name: r.itemName, principal: r.principal })),
    ctx.overwrite,
  );
  const entries: Array<BulkEntry<Prisma.SalesLineCreateManyInput, Prisma.SalesLineUpdateInput>> = [];
  for (const [rowIdx, r] of rows.entries()) {
    const productId = r.itemCode
      ? await resolveProductId(ctx, r.itemCode, r.itemName, { principal: r.principal })
      : null;
    const data = {
      channel: r.channel, saleDate: r.saleDate, customerName: r.customerName,
      refNo: r.refNo, productId, itemCode: r.itemCode, itemName: r.itemName,
      saleQty: r.saleQty, focQty: r.focQty, returnQty: r.returnQty,
      unitPrice: r.unitPrice, amount: r.amount, discountRate: r.discountRate,
      principal: r.principal, tspArea: r.tspArea,
      sourceFileName, sourceSheet: sheet.sheetName,
    };
    entries.push({
      rowIdx, importKey: r.importKey,
      create: { ...data, userId, importKey: r.importKey },
      update: data,
    });
  }
  return bulkWrite(
    ctx,
    channel === "MAEI" ? "sales_maei" : "sales_mega",
    rows.length,
    entries,
    opsFor(userId, prisma.salesLine),
  );
}

/** Bulk-set product min/max levels: one UPDATE...FROM(VALUES) per 500 rows
 *  (STOCK BY PRICE enrichment without per-row updates). */
async function bulkSetMinMax(
  ctx: ImportCtx,
  rows: Array<{ id: string; minQty: number | null; maxQty: number | null }>,
): Promise<number> {
  let n = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    if (chunk.length === 0) break;
    const values = Prisma.join(
      chunk.map((r) => Prisma.sql`(${r.id}::TEXT, ${r.minQty}::DOUBLE PRECISION, ${r.maxQty}::DOUBLE PRECISION)`),
    );
    n += await prisma.$executeRaw`
      UPDATE pharma_product AS p SET
        min_qty = v.min_qty,
        max_qty = v.max_qty,
        updated_at = NOW(),
        deleted_at = NULL,
        deleted_by_user_id = NULL,
        deleted_reason = NULL,
        restored_at = NOW(),
        restored_by_user_id = ${ctx.userId}
      FROM (VALUES ${values}) AS v(id, min_qty, max_qty)
      WHERE p.id = v.id AND p.user_id = ${ctx.userId}`;
  }
  return Number(n);
}

export async function importMovementSheet(
  userId: string,
  sheet: SheetRef,
  sourceFileName: string,
  year: number,
  month: number,
  opts?: { overwrite?: boolean },
): Promise<ImportSummary> {
  const rows = parseMovementSheet(sheet, userId, year, month);
  const ctx = createImportCtx(userId, sourceFileName, sheet.sheetName, opts?.overwrite);
  await bulkEnsureProducts(
    ctx,
    rows.map((r) => ({ code: r.itemCode, name: r.itemName })),
    ctx.overwrite,
  );
  const entries: Array<BulkEntry<Prisma.StockMovementCreateManyInput, Prisma.StockMovementUpdateInput>> = [];
  for (const [rowIdx, r] of rows.entries()) {
    const productId = await resolveProductId(ctx, r.itemCode, r.itemName);
    const data = {
      year, month, productId, itemCode: r.itemCode, itemName: r.itemName,
      unit: r.unit, openingQty: r.openingQty, purchaseQty: r.purchaseQty,
      saleQty: r.saleQty, closingQty: r.closingQty, sourceFileName,
    };
    entries.push({
      rowIdx, importKey: r.importKey,
      create: { ...data, userId, importKey: r.importKey },
      update: data,
    });
  }
  return bulkWrite(ctx, "movement", rows.length, entries,
    opsFor(userId, prisma.stockMovement));
}

export async function importMinMaxSheet(
  userId: string,
  sheet: SheetRef,
  sourceFileName: string,
  opts?: { overwrite?: boolean },
): Promise<ImportSummary> {
  const rows = parseMinMaxSheet(sheet, userId);
  const ctx = createImportCtx(userId, sourceFileName, sheet.sheetName, opts?.overwrite);
  await bulkEnsureProducts(
    ctx,
    rows.map((r) => ({ code: r.itemCode, name: r.itemName })),
    false,
  );
  // Min/max levels live on the product itself — set in bulk. No snapshot
  // rows: these would pollute the latest-stock valuation.
  const levels: Array<{ id: string; minQty: number | null; maxQty: number | null }> = [];
  for (const r of rows) {
    const code = normalizeCode(r.itemCode);
    const id = code ? ctx.productCache.get(code) : undefined;
    if (id) levels.push({ id, minQty: r.minQty, maxQty: r.maxQty });
  }
  const enriched = levels.length > 0 ? await bulkSetMinMax(ctx, levels) : 0;
  return {
    kind: "minmax", sheetName: ctx.sheetName, total: rows.length,
    created: enriched, updated: 0, skipped: rows.length - levels.length, errors: [],
  };
}

export async function importExpirySheet(
  userId: string,
  sheet: SheetRef,
  sourceFileName: string,
  opts?: { overwrite?: boolean },
): Promise<ImportSummary> {
  const rows = parseExpirySheet(sheet, userId);
  const ctx = createImportCtx(userId, sourceFileName, sheet.sheetName, opts?.overwrite);
  await bulkEnsureProducts(
    ctx,
    rows.map((r) => ({ code: r.itemCode, name: r.itemName })),
    ctx.overwrite,
  );
  const entries: Array<BulkEntry<Prisma.ExpiryLotCreateManyInput, Prisma.ExpiryLotUpdateInput>> = [];
  for (const [rowIdx, r] of rows.entries()) {
    const productId = await resolveProductId(ctx, r.itemCode, r.itemName);
    const data = {
      productId, itemCode: r.itemCode, itemName: r.itemName,
      expDate: r.expDate, balance: r.balance, sourceFileName,
    };
    entries.push({
      rowIdx, importKey: r.importKey,
      create: { ...data, userId, importKey: r.importKey },
      update: data,
    });
  }
  return bulkWrite(ctx, "expiry", rows.length, entries,
    opsFor(userId, prisma.expiryLot));
}

export async function importReturnsSheet(
  userId: string,
  sheet: SheetRef,
  sourceFileName: string,
  opts?: { overwrite?: boolean },
): Promise<ImportSummary> {
  const rows = parseReturnsSheet(sheet, userId);
  const ctx = createImportCtx(userId, sourceFileName, sheet.sheetName, opts?.overwrite);
  await bulkEnsureProducts(
    ctx,
    rows.map((r) => ({ code: r.itemCode, name: r.itemName })),
    ctx.overwrite,
  );
  const entries: Array<BulkEntry<Prisma.StockReturnCreateManyInput, Prisma.StockReturnUpdateInput>> = [];
  for (const [rowIdx, r] of rows.entries()) {
    const productId = await resolveProductId(ctx, r.itemCode, r.itemName);
    const data = {
      returnDate: r.returnDate, productId, itemCode: r.itemCode, itemName: r.itemName,
      qty: r.qty, unitPrice: r.unitPrice, amount: r.amount, sourceFileName,
    };
    entries.push({
      rowIdx, importKey: r.importKey,
      create: { ...data, userId, importKey: r.importKey },
      update: data,
    });
  }
  return bulkWrite(ctx, "returns", rows.length, entries,
    opsFor(userId, prisma.stockReturn));
}

export async function importStoreInSheet(
  userId: string,
  sheet: SheetRef,
  sourceFileName: string,
  opts?: { overwrite?: boolean },
): Promise<ImportSummary> {
  const rows = parseStoreInSheet(sheet, userId);
  const ctx = createImportCtx(userId, sourceFileName, sheet.sheetName, opts?.overwrite);
  const entries: Array<BulkEntry<Prisma.StoreInLotCreateManyInput, Prisma.StoreInLotUpdateInput>> = [];
  for (const [rowIdx, r] of rows.entries()) {
    const data = {
      itemName: r.itemName, batchNo: r.batchNo, packing: r.packing,
      qtyOnHand: r.qtyOnHand, unitPrice: r.unitPrice, unitCost: r.unitCost,
      storeinDate: r.storeinDate, mfgDate: r.mfgDate, expDate: r.expDate,
      supplierName: r.supplierName, sourceFileName,
    };
    entries.push({
      rowIdx, importKey: r.importKey,
      create: { ...data, userId, importKey: r.importKey },
      update: data,
    });
  }
  return bulkWrite(ctx, "storein", rows.length, entries,
    opsFor(userId, prisma.storeInLot));
}

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** Infer (year, month) for a stock sheet: explicit opts win, otherwise the
 *  sheet name (June/July/August…), otherwise the file name; year falls back
 *  to the current year. Returns null when no month can be determined. */
export function detectStockPeriod(
  sheetName: string,
  sourceFileName: string,
  opts?: { stockYear?: number; stockMonth?: number },
): { year: number; month: number } | null {
  if (opts?.stockYear && opts?.stockMonth) {
    return { year: opts.stockYear, month: opts.stockMonth };
  }
  const haystacks = [sheetName.toLowerCase(), sourceFileName.toLowerCase()];
  let month: number | null = null;
  for (const h of haystacks) {
    const idx = MONTH_NAMES.findIndex((m) => h.includes(m));
    if (idx >= 0) { month = idx + 1; break; }
  }
  if (month == null) return null;
  const yearMatch = `${sheetName} ${sourceFileName}`.match(/(19|20)\d{2}/);
  return { year: yearMatch ? Number(yearMatch[0]) : new Date().getFullYear(), month };
}

/** Route every sheet of an uploaded workbook to the right importer. */
export async function importPharmacyWorkbook(
  userId: string,
  fileBuffer: Buffer,
  sourceFileName: string,
  opts?: { stockYear?: number; stockMonth?: number; asOf?: Date; overwrite?: boolean; onlyKind?: PharmaSheetKind },
): Promise<ImportSummary[]> {
  const overwrite = opts?.overwrite ?? false;
  const sheets = readPharmacyWorkbook(fileBuffer);
  const summaries: ImportSummary[] = [];
  for (const sheet of sheets) {
    const kind = detectPharmaSheetKind(sheet);
    if (opts?.onlyKind && kind !== opts.onlyKind) {
      summaries.push(emptySummary(kind, sheet.sheetName, sheet.rows.length));
      continue;
    }
    const started = Date.now();
    const push = (s: Promise<ImportSummary>) =>
      s.then((r) => {
        console.log(
          `[pharmacy-import] ${sourceFileName} :: ${r.sheetName} [${r.kind}] ` +
            `total=${r.total} created=${r.created} updated=${r.updated} skipped=${r.skipped} ` +
            `errors=${r.errors.length} in ${Date.now() - started}ms`,
        );
        summaries.push(r);
      });
    switch (kind) {
      case "po":
        await push(importPOSheet(userId, sheet, sourceFileName, { overwrite }));
        break;
      case "invoice":
        await push(importInvoiceSheet(userId, sheet, sourceFileName, opts?.asOf, { overwrite }));
        break;
      case "price_list":
        await push(importPriceListSheet(userId, sheet, sourceFileName));
        break;
      case "stock": {
        const period = detectStockPeriod(sheet.sheetName, sourceFileName, opts);
        if (period) {
          await push(
            importStockSheet(userId, sheet, sourceFileName, period.year, period.month, { overwrite }),
          );
        } else {
          summaries.push(emptySummary(kind, sheet.sheetName, sheet.rows.length));
        }
        break;
      }
      case "receivable":
        await push(importReceivableSheet(userId, sheet, sourceFileName, opts?.asOf, { overwrite }));
        break;
      case "sales_maei":
        await push(importSalesSheet(userId, sheet, sourceFileName, "MAEI", { overwrite }));
        break;
      case "sales_mega":
        await push(importSalesSheet(userId, sheet, sourceFileName, "MEGA", { overwrite }));
        break;
      case "movement": {
        const period = detectStockPeriod(sheet.sheetName, sourceFileName, opts);
        if (period) {
          await push(
            importMovementSheet(userId, sheet, sourceFileName, period.year, period.month, { overwrite }),
          );
        } else {
          summaries.push(emptySummary(kind, sheet.sheetName, sheet.rows.length));
        }
        break;
      }
      case "minmax":
        await push(importMinMaxSheet(userId, sheet, sourceFileName, { overwrite }));
        break;
      case "expiry":
        await push(importExpirySheet(userId, sheet, sourceFileName, { overwrite }));
        break;
      case "returns":
        await push(importReturnsSheet(userId, sheet, sourceFileName, { overwrite }));
        break;
      case "storein":
        await push(importStoreInSheet(userId, sheet, sourceFileName, { overwrite }));
        break;
      default:
        summaries.push(emptySummary("unknown", sheet.sheetName, sheet.rows.length));
    }
  }
  return summaries;
}
