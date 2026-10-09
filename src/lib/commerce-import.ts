import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { DealStage, FulfillmentStatus } from "@/generated/prisma/enums";
import type { DealStage as DealStageValue, FulfillmentStatus as FulfillmentStatusValue } from "@/generated/prisma/enums";
import { parseExcelDate } from "@/lib/demand-parser";
import { restoreData } from "@/lib/soft-delete";
import { formatPhoneNumber } from "@/lib/utils";
import { convertBurmeseDigits, makeRowAccessor, normalizeHeaderKey, toNumber } from "@/lib/text-normalize";

// ─── Header helpers ──────────────────────────────────────────────────────────
// (normalizeHeaderKey / toNumber / makeRowAccessor live in text-normalize.)

export function isProductCatalogHeaders(headers: unknown[]): boolean {
  const h = headers.map(normalizeHeaderKey);
  const hasSku = h.includes("product code") || h.includes("sku") || h.includes("product sku");
  const hasCustomer = h.includes("customer name");
  if (!hasSku || hasCustomer) return false;
  return (
    h.includes("product name") ||
    h.includes("name") ||
    h.includes("selling price") ||
    h.includes("stock qty") ||
    h.includes("unit cost")
  );
}

export function isMarketingMetricsHeaders(headers: unknown[]): boolean {
  const h = headers.map(normalizeHeaderKey);
  const hasChannel = h.includes("channel") && !h.includes("customer name") && !h.includes("product name");
  if (!hasChannel) return false;
  return (
    h.includes("spend") ||
    h.includes("reach") ||
    h.includes("impressions") ||
    h.includes("ad driven orders")
  );
}

export function isSalesOrdersHeaders(headers: unknown[]): boolean {
  const h = headers.map(normalizeHeaderKey);
  const hasCustomer = h.includes("customer name");
  if (!hasCustomer) return false;
  return (
    h.includes("product name") ||
    (h.includes("quantity") && h.includes("unit price"))
  );
}

// CS sheets share "Customer Name" with sales sheets, so callers must check
// this BEFORE isSalesOrdersHeaders: a CS sheet with order columns would
// otherwise match sales and lose CSAT/follow-up data. Known tradeoff — a
// hybrid sheet (order columns + CSAT) routes to CS and drops quantity/price;
// pick the type manually in that case.
export function isCustomerServiceHeaders(headers: unknown[]): boolean {
  const h = headers.map(normalizeHeaderKey);
  if (!h.includes("customer name")) return false;
  return (
    h.includes("next follow up") ||
    h.includes("csat") ||
    h.includes("purchased product") ||
    h.includes("purchased service") ||
    h.includes("last contact note")
  );
}

// ─── Row parsing ─────────────────────────────────────────────────────────────

// (toNumber / makeRowAccessor live in text-normalize.)

function readWorkbookRows(fileBuffer: Buffer): Array<Record<string, unknown>[]> {
  const workbook = XLSX.read(fileBuffer, { type: "buffer", cellDates: true });
  const sheetRows: Array<Record<string, unknown>[]> = [];
  for (const sheetName of workbook.SheetNames) {
    sheetRows.push(
      XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { raw: true })
    );
  }
  return sheetRows;
}

// ─── Product catalog / inventory ─────────────────────────────────────────────

export type ParsedProductRow = {
  name: string;
  sku: string;
  category: string | null;
  unitCost: number | null;
  sellingPrice: number | null;
  stockQty: number;
  lowStockThreshold: number;
};

export function parseProductCatalogRows(fileBuffer: Buffer): ParsedProductRow[] {
  const parsed: ParsedProductRow[] = [];
  for (const rows of readWorkbookRows(fileBuffer)) {
    for (const row of rows) {
      const get = makeRowAccessor(row);
      const sku = String(get("Product Code", "SKU", "Product SKU") ?? "").trim();
      const name = String(get("Product Name", "Name") ?? "").trim() || sku;
      if (!sku) continue;
      parsed.push({
        name,
        sku,
        category: String(get("Category") ?? "").trim() || null,
        unitCost: toNumber(get("Unit Cost")),
        sellingPrice: toNumber(get("Selling Price", "Price")),
        stockQty: Math.max(0, Math.trunc(toNumber(get("Stock Qty", "Stock")) ?? 0)),
        lowStockThreshold: Math.max(0, Math.trunc(toNumber(get("Low Stock Threshold", "Low Stock")) ?? 0)),
      });
    }
  }
  return parsed;
}

export async function upsertProductsFromRows(
  rows: ParsedProductRow[],
  userId: string,
): Promise<ImportWriteResult> {
  if (rows.length === 0) return { imported: 0, duplicates: 0, restored: 0 };

  // Partition first so resurrected SKUs report as restored, not imported.
  const skus = Array.from(new Set(rows.map((p) => p.sku)));
  const existing = await prisma.product.findMany({
    where: { userId, sku: { in: skus } },
    select: { sku: true, deletedAt: true },
  });
  const stateBySku = new Map(existing.map((e) => [e.sku, e.deletedAt ? "deleted" : "live"] as const));
  let imported = 0;
  let duplicates = 0;
  let restored = 0;

  for (const product of rows) {
    const state = stateBySku.get(product.sku);
    if (state === "live") {
      // Refresh values in place; nothing new and nothing resurrected.
      await prisma.product.update({
        where: { userId_sku: { userId, sku: product.sku } },
        data: {
          ...(product.name ? { name: product.name } : {}),
          ...(product.category ? { category: product.category } : {}),
          ...(product.unitCost !== null ? { unitCost: product.unitCost } : {}),
          ...(product.sellingPrice !== null ? { sellingPrice: product.sellingPrice } : {}),
          stockQty: product.stockQty,
          lowStockThreshold: product.lowStockThreshold,
        },
      });
      duplicates += 1;
      continue;
    }
    await prisma.product.upsert({
      where: { userId_sku: { userId, sku: product.sku } },
      create: {
        userId,
        name: product.name,
        sku: product.sku,
        category: product.category,
        unitCost: product.unitCost,
        sellingPrice: product.sellingPrice,
        stockQty: product.stockQty,
        lowStockThreshold: product.lowStockThreshold,
      },
      update: {
        ...restoreData(userId),
        ...(product.name ? { name: product.name } : {}),
        ...(product.category ? { category: product.category } : {}),
        ...(product.unitCost !== null ? { unitCost: product.unitCost } : {}),
        ...(product.sellingPrice !== null ? { sellingPrice: product.sellingPrice } : {}),
        stockQty: product.stockQty,
        lowStockThreshold: product.lowStockThreshold,
      },
    });
    if (state === "deleted") restored += 1;
    else imported += 1;
    // A second row with the same SKU in this file is a duplicate, not new.
    stateBySku.set(product.sku, "live");
  }
  return { imported, duplicates, restored };
}

// ─── Inventory text records (Telegram text messages) ───────────────────────
// Mirrors parseFinanceTextRecord: `Field: value` lines. SKU is required since
// the catalog upserts by SKU — without it there is nothing to match.

export function parseInventoryTextRecord(text: string): ParsedProductRow | null {
  const cleaned = convertBurmeseDigits(text)
    .replace(/,/g, "");
  const field = (names: string[]) => {
    for (const name of names) {
      const match = cleaned.match(new RegExp(`${name}\\s*[:：]\\s*([^\\n]+)`, "i"));
      if (match?.[1]?.trim()) return match[1].trim();
    }
    return "";
  };
  const sku = field(["Product Code", "Product SKU", "SKU"]);
  if (!sku) return null;
  const num = (names: string[]) => {
    const raw = field(names);
    if (!raw) return null;
    return toNumber(raw);
  };
  const stock = num(["Stock Qty", "Stock"]);
  const threshold = num(["Low Stock Threshold", "Threshold", "Low Stock"]);
  return {
    name: field(["Product Name", "Name"]) || sku,
    sku,
    category: field(["Category"]) || null,
    unitCost: num(["Unit Cost", "Cost"]),
    sellingPrice: num(["Selling Price", "Price"]),
    stockQty: Math.max(0, Math.trunc(stock ?? 0)),
    lowStockThreshold: Math.max(0, Math.trunc(threshold ?? 0)),
  };
}

// ─── Marketing metrics ───────────────────────────────────────────────────────

export type ParsedMarketingRow = {
  metricDate: Date | null;
  channel: string | null;
  spend: number;
  reach: number | null;
  impressions: number | null;
  adDrivenOrders: number | null;
  note: string | null;
};

export function parseMarketingMetricsRows(fileBuffer: Buffer): ParsedMarketingRow[] {
  const parsed: ParsedMarketingRow[] = [];
  for (const rows of readWorkbookRows(fileBuffer)) {
    for (const row of rows) {
      const get = makeRowAccessor(row);
      const metricDate = parseExcelDate(get("Date"));
      const spend = toNumber(get("Spend")) ?? 0;
      // Skip fully empty rows (no date and nothing measurable).
      if (!metricDate && spend === 0 && get("Channel") == null && get("Reach") == null) continue;
      const intOrNull = (value: unknown) => {
        const n = toNumber(value);
        return n === null ? null : Math.trunc(n);
      };
      parsed.push({
        metricDate,
        channel: String(get("Channel") ?? "").trim() || null,
        spend,
        reach: intOrNull(get("Reach")),
        impressions: intOrNull(get("Impressions")),
        adDrivenOrders: intOrNull(get("Ad-driven Orders", "Ad Driven Orders")),
        note: String(get("Notes", "Note") ?? "").trim() || null,
      });
    }
  }
  return parsed;
}

export async function createMarketingMetricsFromRows(
  rows: ParsedMarketingRow[],
  userId: string,
  importKeys?: (string | null)[],
): Promise<ImportWriteResult> {
  if (rows.length === 0) return { imported: 0, duplicates: 0, restored: 0 };

  // Partition by key state: live rows are duplicates, trashed rows get
  // restored, only genuinely new rows are created.
  const keyedIdxs = rows.map((_, idx) => idx).filter((idx) => importKeys?.[idx]);
  const statuses = await Promise.all(
    keyedIdxs.map(async (idx) => ({
      idx,
      status: await findExistingImportKey("marketingMetric", userId, importKeys![idx] as string),
    })),
  );
  const liveKeys = new Set(statuses.filter((s) => s.status === "live").map((s) => s.idx));
  const deletedIdxs = statuses.filter((s) => s.status === "deleted").map((s) => s.idx);

  const duplicates = liveKeys.size;
  let restored = 0;
  // Failed restores (row vanished mid-flight) fall through to fresh creates.
  const retryIdxs: number[] = [];
  for (const idx of deletedIdxs) {
    const id = await restoreImportKey("marketingMetric", userId, importKeys![idx] as string);
    if (id) restored += 1;
    else retryIdxs.push(idx);
  }

  const newIdxs = rows
    .map((_, idx) => idx)
    .filter((idx) => !liveKeys.has(idx) && !deletedIdxs.includes(idx));
  const createIdxs = [...newIdxs, ...retryIdxs];
  if (createIdxs.length === 0) return { imported: 0, duplicates, restored };
  // Missing dates fall back to the import moment here at write time — never
  // in the parsed row — so fingerprints stay stable across re-imports.
  const now = new Date();
  const result = await prisma.marketingMetric.createMany({
    data: createIdxs.map((idx) => {
      const metric = rows[idx];
      return {
        userId,
        metricDate: metric.metricDate || now,
        channel: metric.channel,
        spend: metric.spend,
        reach: metric.reach,
        impressions: metric.impressions,
        adDrivenOrders: metric.adDrivenOrders,
        note: metric.note,
        importKey: importKeys?.[idx] ?? null,
      };
    }),
    // Race guard for concurrent confirms; key-less rows never conflict.
    skipDuplicates: true,
  });
  const created = result.count;
  return { imported: created, duplicates: duplicates + (createIdxs.length - created), restored };
}

// ─── Marketing text records (Telegram text messages) ───────────────────────
// Same fields as the spreadsheet parser. Returns null for fully empty
// messages so the caller can ask for the required fields instead.

export function parseMarketingTextRecord(text: string, fallbackDate: Date): ParsedMarketingRow | null {
  const cleaned = convertBurmeseDigits(text)
    .replace(/,/g, "");
  const field = (names: string[]) => {
    for (const name of names) {
      const match = cleaned.match(new RegExp(`${name}\\s*[:：]\\s*([^\\n]+)`, "i"));
      if (match?.[1]?.trim()) return match[1].trim();
    }
    return "";
  };
  const intOrNull = (raw: string) => {
    if (!raw) return null;
    const n = toNumber(raw);
    return n === null ? null : Math.trunc(n);
  };
  const channel = field(["Channel"]) || null;
  const spend = toNumber(field(["Spend"])) ?? 0;
  const reach = intOrNull(field(["Reach"]));
  // Skip fully empty messages (no date and nothing measurable).
  if (!parseExcelDate(field(["Date"])) && spend === 0 && channel == null && reach == null) return null;
  return {
    metricDate: parseExcelDate(field(["Date"])) || fallbackDate,
    channel,
    spend,
    reach,
    impressions: intOrNull(field(["Impressions"])),
    adDrivenOrders: intOrNull(field(["Ad-driven Orders", "Ad Driven Orders", "Orders"])),
    note: field(["Notes", "Note"]) || null,
  };
}

// ─── Sales orders ────────────────────────────────────────────────────────────

export type ParsedSalesOrderRow = {
  orderDate: Date | null;
  customerName: string | null;
  customerPhone: string | null;
  productName: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  stage: DealStageValue;
  fulfillmentStatus: FulfillmentStatusValue;
  notes: string | null;
};

export function mapDealStage(value: unknown): DealStageValue {
  const v = String(value ?? "").toLowerCase();
  if (/new|lead/.test(v)) return DealStage.NEW_LEAD;
  if (/quot/.test(v)) return DealStage.QUOTED;
  if (/follow/.test(v)) return DealStage.FOLLOW_UP_NEEDED;
  if (/pend/.test(v)) return DealStage.PENDING;
  if (/won|win|complete|success/.test(v)) return DealStage.WON;
  if (/lost|cancel/.test(v)) return DealStage.LOST;
  return DealStage.PENDING;
}

export function mapFulfillmentStatus(value: unknown): FulfillmentStatusValue {
  const v = String(value ?? "").toLowerCase();
  if (/process/.test(v)) return FulfillmentStatus.PROCESSING;
  if (/fulfil|ship|deliver|complete|done/.test(v)) return FulfillmentStatus.FULFILLED;
  if (/cancel/.test(v)) return FulfillmentStatus.CANCELLED;
  if (/pend/.test(v)) return FulfillmentStatus.PENDING;
  return FulfillmentStatus.NOT_APPLICABLE;
}

export function parseSalesOrderRows(fileBuffer: Buffer): ParsedSalesOrderRow[] {
  const parsed: ParsedSalesOrderRow[] = [];
  for (const rows of readWorkbookRows(fileBuffer)) {
    for (const row of rows) {
      const get = makeRowAccessor(row);
      const productName = String(get("Product Name", "Product") ?? "").trim();
      const quantity = Math.max(1, Math.trunc(toNumber(get("Quantity", "Qty")) ?? 1));
      const customerName = String(get("Customer Name", "Customer") ?? "").trim() || null;
      // Require at least a product or a customer so blank rows are skipped.
      if (!productName && !customerName) continue;
      parsed.push({
        orderDate: parseExcelDate(get("Date")),
        customerName,
        customerPhone: formatPhoneNumber(String(get("Phone", "Phone Number") ?? "")) || null,
        productName: productName || "Unknown product",
        sku: String(get("Product Code", "SKU") ?? "").trim() || null,
        quantity,
        unitPrice: toNumber(get("Unit Price", "Price")) ?? 0,
        stage: mapDealStage(get("Stage")),
        fulfillmentStatus: mapFulfillmentStatus(get("Fulfillment Status", "Fulfillment", "Status")),
        notes: String(get("Notes", "Note") ?? "").trim() || null,
      });
    }
  }
  return parsed;
}

async function resolveCustomerId(
  customerName: string,
  phone: string | null,
  userId: string,
  firstSeenDate?: Date
): Promise<string | null> {
  const nameNormalized = customerName.toLowerCase().replace(/\s+/g, " ").trim();
  const customer = await prisma.customer.upsert({
    where: { userId_nameNormalized: { userId, nameNormalized } },
    create: {
      userId,
      name: customerName,
      nameNormalized,
      phone,
      // Preserve the historical date instead of the import moment.
      ...(firstSeenDate ? { createdAt: firstSeenDate } : {}),
    },
    update: {
      ...restoreData(userId),
      ...(phone ? { phone } : {}),
      status: "active",
    },
    select: { id: true },
  });
  return customer.id;
}

export type ImportSource = {
  /** Deal `source` value, e.g. "telegram_sales_import" or "dashboard_import". */
  source: string;
  /** Human channel label stored on deals, e.g. "Telegram" or "Web". */
  sourceChannel: string;
  /** Prefix used in customer activity descriptions. */
  activityPrefix: string;
};

const TELEGRAM_SALES_SOURCE: ImportSource = {
  source: "telegram_sales_import",
  sourceChannel: "Telegram",
  activityPrefix: "Telegram sales import",
};

const TELEGRAM_CS_SOURCE: ImportSource = {
  source: "telegram_cs_import",
  sourceChannel: "Telegram",
  activityPrefix: "Telegram customer service import",
};

export const DASHBOARD_SALES_SOURCE: ImportSource = {
  source: "dashboard_import",
  sourceChannel: "Web",
  activityPrefix: "Web import",
};

export const DASHBOARD_CS_SOURCE: ImportSource = {
  source: "dashboard_cs_import",
  sourceChannel: "Web",
  activityPrefix: "Web customer service import",
};

export type ImportWriteResult = {
  imported: number;
  duplicates: number;
  restored: number;
};

/** Row state for an import key: live rows are duplicates, trashed rows get restored. */
export type ImportKeyStatus = "live" | "deleted" | "missing";

export function isPrismaUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Check-then-create for an import-keyed row. The pre-check makes the common
 * re-import case cheap; the P2002 catch keeps concurrent confirms safe.
 * Soft-deleted rows with the same key count as duplicates (they stay deleted).
 */
export async function findExistingImportKey(
  model: "deal" | "expense" | "financeEntry" | "marketingMetric",
  userId: string,
  importKey: string,
): Promise<ImportKeyStatus> {
  const where = { userId_importKey: { userId, importKey } };
  let row: { id: string; deletedAt: Date | null } | null = null;
  switch (model) {
    case "deal":
      row = await prisma.deal.findUnique({ where, select: { id: true, deletedAt: true } });
      break;
    case "expense":
      row = await prisma.expense.findUnique({ where, select: { id: true, deletedAt: true } });
      break;
    case "financeEntry":
      row = await prisma.financeEntry.findUnique({ where, select: { id: true, deletedAt: true } });
      break;
    case "marketingMetric":
      row = await prisma.marketingMetric.findUnique({ where, select: { id: true, deletedAt: true } });
      break;
  }
  if (!row) return "missing";
  return row.deletedAt ? "deleted" : "live";
}

/** Bring a soft-deleted import-keyed row back. Returns its id. */
export async function restoreImportKey(
  model: "deal" | "expense" | "financeEntry" | "marketingMetric",
  userId: string,
  importKey: string,
): Promise<string | null> {
  const where = { userId_importKey: { userId, importKey } };
  const data = restoreData(userId);
  switch (model) {
    case "deal": {
      const row = await prisma.deal.findUnique({ where, select: { id: true } });
      if (!row) return null;
      await prisma.deal.update({ where: { id: row.id }, data });
      return row.id;
    }
    case "expense": {
      const row = await prisma.expense.findUnique({ where, select: { id: true } });
      if (!row) return null;
      await prisma.expense.update({ where: { id: row.id }, data });
      return row.id;
    }
    case "financeEntry": {
      const row = await prisma.financeEntry.findUnique({ where, select: { id: true } });
      if (!row) return null;
      await prisma.financeEntry.update({ where: { id: row.id }, data });
      return row.id;
    }
    case "marketingMetric": {
      const row = await prisma.marketingMetric.findUnique({ where, select: { id: true } });
      if (!row) return null;
      await prisma.marketingMetric.update({ where: { id: row.id }, data });
      return row.id;
    }
  }
}

export async function createSalesOrdersFromRows(
  rows: ParsedSalesOrderRow[],
  userId: string,
  importSource: ImportSource = TELEGRAM_SALES_SOURCE,
  importKeys?: (string | null)[],
): Promise<ImportWriteResult> {
  let imported = 0;
  let duplicates = 0;
  let restored = 0;
  for (let idx = 0; idx < rows.length; idx++) {
    const order = rows[idx];
    const importKey = importKeys?.[idx] ?? null;
    if (importKey) {
      const status = await findExistingImportKey("deal", userId, importKey);
      if (status === "live") {
        duplicates += 1;
        continue;
      }
      if (status === "deleted") {
        // If the row vanished mid-flight, fall through and create fresh.
        if (await restoreImportKey("deal", userId, importKey)) {
          restored += 1;
          continue;
        }
      }
    }
    const dealDate = order.orderDate || new Date();
    const customerId = order.customerName ? await resolveCustomerId(order.customerName, order.customerPhone, userId, dealDate) : null;
    const amount = order.unitPrice * order.quantity;
    let deal: { id: string };
    try {
      deal = await prisma.deal.create({
        data: {
          userId,
          customerId,
          // Backdate so the deal lands in the order's month, not the import month.
          createdAt: dealDate,
          stage: order.stage,
          fulfillmentStatus: order.fulfillmentStatus,
          source: importSource.source,
          sourceChannel: importSource.sourceChannel,
          importKey,
          quotedAmount: amount > 0 ? amount : null,
          lastContactAt: dealDate,
          wonAt: order.stage === DealStage.WON ? dealDate : undefined,
          lostAt: order.stage === DealStage.LOST ? dealDate : undefined,
          note: [order.notes, order.orderDate ? `Order date: ${order.orderDate.toISOString().slice(0, 10)}` : ""]
            .filter(Boolean)
            .join(" · ") || null,
        items: {
          create: [{
            productName: order.productName,
            sku: order.sku,
            quantity: order.quantity,
            unitPrice: order.unitPrice,
          }],
        },
        },
        select: { id: true },
      });
    } catch (err) {
      if (isPrismaUniqueConstraintError(err)) {
        duplicates += 1;
        continue;
      }
      throw err;
    }
    if (customerId) {
      await prisma.customerActivity.create({
        data: {
          customerId,
          action: "demand_report",
          description: `${importSource.activityPrefix} · ${deal.id}`,
        },
      });
    }
    imported += 1;
  }
  return { imported, duplicates, restored };
}

// ─── Customer service records ────────────────────────────────────────────────

export type ParsedCustomerServiceRow = {
  contactDate: Date | null;
  customerName: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  purchasedProduct: string | null;
  purchaseAmount: number | null;
  status: string | null;
  nextFollowUp: Date | null;
  csat: string | null;
  lastContactNote: string | null;
};

export function parseCustomerServiceRows(fileBuffer: Buffer): ParsedCustomerServiceRow[] {
  const parsed: ParsedCustomerServiceRow[] = [];
  for (const rows of readWorkbookRows(fileBuffer)) {
    for (const row of rows) {
      const get = makeRowAccessor(row);
      const customerName = String(get("Customer Name", "Customer") ?? "").trim() || null;
      const purchasedProduct = String(get("Purchased Product", "Purchased Service") ?? "").trim() || null;
      const status = String(get("Status") ?? "").trim() || null;
      // Require a customer plus at least one CS signal so blank/other rows skip.
      if (!customerName || (!purchasedProduct && !status && get("Next Follow Up") == null && get("CSAT") == null)) continue;
      parsed.push({
        contactDate: parseExcelDate(get("Date")),
        customerName,
        company: String(get("Company") ?? "").trim() || null,
        phone: formatPhoneNumber(String(get("Phone", "Phone Number") ?? "")) || null,
        email: String(get("Email") ?? "").trim() || null,
        purchasedProduct,
        purchaseAmount: toNumber(get("Purchase Amount (MMK)", "Purchase Amount MMK", "Purchase Amount")),
        status,
        nextFollowUp: parseExcelDate(get("Next Follow Up", "Next Follow-Up")),
        csat: String(get("CSAT") ?? "").trim() || null,
        lastContactNote: String(get("Last Contact Note") ?? "").trim() || null,
      });
    }
  }
  return parsed;
}

function csStageFor(status: string | null, purchaseAmount: number | null): {
  stage: DealStageValue;
  fulfillmentStatus: FulfillmentStatusValue;
} {
  const v = (status ?? "").toLowerCase();
  if (/cancel|lost|refund/.test(v)) return { stage: DealStage.LOST, fulfillmentStatus: FulfillmentStatus.CANCELLED };
  if (/pend|follow|wait/.test(v)) return { stage: DealStage.PENDING, fulfillmentStatus: FulfillmentStatus.PENDING };
  if (/active|purchas|complet|won|deliver|done|closed/.test(v)) return { stage: DealStage.WON, fulfillmentStatus: FulfillmentStatus.FULFILLED };
  // No explicit status: treat rows with a purchase as completed sales.
  if (purchaseAmount && purchaseAmount > 0) return { stage: DealStage.WON, fulfillmentStatus: FulfillmentStatus.FULFILLED };
  return { stage: DealStage.FOLLOW_UP_NEEDED, fulfillmentStatus: FulfillmentStatus.NOT_APPLICABLE };
}

async function resolveCsCustomerId(
  row: ParsedCustomerServiceRow,
  userId: string
): Promise<string | null> {
  if (!row.customerName) return null;
  const nameNormalized = row.customerName.toLowerCase().replace(/\s+/g, " ").trim();
  const customer = await prisma.customer.upsert({
    where: { userId_nameNormalized: { userId, nameNormalized } },
    create: {
      userId,
      name: row.customerName,
      nameNormalized,
      phone: row.phone,
      email: row.email,
      company: row.company,
      ...(row.contactDate ? { createdAt: row.contactDate } : {}),
    },
    update: {
      ...restoreData(userId),
      ...(row.phone ? { phone: row.phone } : {}),
      ...(row.email ? { email: row.email } : {}),
      ...(row.company ? { company: row.company } : {}),
      status: "active",
    },
    select: { id: true },
  });
  return customer.id;
}

export async function createCustomerServiceRecordsFromRows(
  rows: ParsedCustomerServiceRow[],
  userId: string,
  importSource: ImportSource = TELEGRAM_CS_SOURCE,
  importKeys?: (string | null)[],
): Promise<ImportWriteResult> {
  let imported = 0;
  let duplicates = 0;
  let restored = 0;
  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const importKey = importKeys?.[idx] ?? null;
    if (importKey) {
      const status = await findExistingImportKey("deal", userId, importKey);
      if (status === "live") {
        duplicates += 1;
        continue;
      }
      if (status === "deleted") {
        // If the row vanished mid-flight, fall through and create fresh.
        if (await restoreImportKey("deal", userId, importKey)) {
          restored += 1;
          continue;
        }
      }
    }
    const customerId = await resolveCsCustomerId(row, userId);
    const contactDate = row.contactDate || new Date();
    const { stage, fulfillmentStatus } = csStageFor(row.status, row.purchaseAmount);
    const noteParts = [
      row.lastContactNote,
      row.csat ? `CSAT: ${row.csat}` : null,
      row.contactDate ? `Contact date: ${row.contactDate.toISOString().slice(0, 10)}` : "",
    ].filter(Boolean);

    let deal: { id: string };
    try {
      deal = await prisma.deal.create({
        data: {
          userId,
          customerId,
          // Backdate so the record lands in the contact's month.
          createdAt: contactDate,
          stage,
          fulfillmentStatus,
          source: importSource.source,
          sourceChannel: importSource.sourceChannel,
          importKey,
          quotedAmount: row.purchaseAmount && row.purchaseAmount > 0 ? row.purchaseAmount : null,
          lastContactAt: contactDate,
          wonAt: stage === DealStage.WON ? contactDate : undefined,
          lostAt: stage === DealStage.LOST ? contactDate : undefined,
          note: noteParts.join(" · ") || null,
          items: row.purchasedProduct
            ? {
                create: [{
                  productName: row.purchasedProduct,
                  sku: null,
                  quantity: 1,
                  unitPrice: row.purchaseAmount && row.purchaseAmount > 0 ? row.purchaseAmount : 0,
                }],
              }
            : undefined,
        },
        select: { id: true },
      });
    } catch (err) {
      if (isPrismaUniqueConstraintError(err)) {
        duplicates += 1;
        continue;
      }
      throw err;
    }

    if (row.nextFollowUp || row.lastContactNote) {
      await prisma.followUpNote.create({
        data: {
          dealId: deal.id,
          aiDraftedText: row.lastContactNote || "Imported customer service record",
          intentDetected: row.status || undefined,
          suggestedFollowUpDate: row.nextFollowUp || undefined,
        },
      });
    }
    if (customerId) {
      await prisma.customerActivity.create({
        data: {
          customerId,
          action: "customer_service",
          description: `${importSource.activityPrefix} · ${deal.id}`,
        },
      });
    }
    imported += 1;
  }
  return { imported, duplicates, restored };
}
