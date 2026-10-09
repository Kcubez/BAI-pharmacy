/**
 * Single source of truth for web data-import kinds.
 * Client-safe: no xlsx / prisma imports, so both server routes
 * (`lib/data-import`, `api/imports/*`) and browser code
 * (`lib/api`, `components/data-import-view`) share these.
 */

export const DATA_IMPORT_KINDS = [
  "sales_orders",
  "customer_service",
  "finance",
  "product_catalog",
  "marketing_metrics",
] as const;

export type DataImportKind = (typeof DATA_IMPORT_KINDS)[number];

export function isDataImportKind(value: string | null | undefined): value is DataImportKind {
  return (
    value === "sales_orders" ||
    value === "customer_service" ||
    value === "finance" ||
    value === "product_catalog" ||
    value === "marketing_metrics"
  );
}

export type ImportKindMeta = {
  value: DataImportKind;
  label: string;
  icon: string;
  description: string;
  columns: string[];
};

export const IMPORT_KIND_META: Record<DataImportKind, ImportKindMeta> = {
  sales_orders: {
    value: "sales_orders",
    label: "Sales Orders",
    icon: "🛒",
    description: "Customer orders → Sales pipeline (deals + customers)",
    columns: ["Date", "Customer Name", "Phone", "Product Name", "Product Code", "Quantity", "Unit Price", "Stage", "Fulfillment Status", "Notes"],
  },
  customer_service: {
    value: "customer_service",
    label: "Customer Service",
    icon: "🎧",
    description: "Post-purchase follow-ups → Customer Service records",
    columns: ["Date", "Customer Name", "Company", "Phone", "Email", "Purchased Product", "Purchase Amount (MMK)", "Status", "Next Follow Up", "CSAT", "Last Contact Note"],
  },
  finance: {
    value: "finance",
    label: "Finance Transactions",
    icon: "💳",
    description: "Income / expense rows → Finance ledger + expenses",
    columns: ["Date", "Description", "Category", "Type", "Amount (MMK)", "Payment Method", "Reference", "Notes"],
  },
  product_catalog: {
    value: "product_catalog",
    label: "Inventory / Products",
    icon: "📦",
    description: "Product catalog rows → Inventory (upsert by SKU)",
    columns: ["Product Code", "Product Name", "Category", "Unit Cost", "Selling Price", "Stock Qty", "Low Stock Threshold"],
  },
  marketing_metrics: {
    value: "marketing_metrics",
    label: "Marketing Metrics",
    icon: "📣",
    description: "Ad spend / reach rows → Marketing metrics",
    columns: ["Date", "Channel", "Spend", "Reach", "Impressions", "Ad-driven Orders", "Notes"],
  },
};

export const IMPORT_KIND_LIST: ImportKindMeta[] = DATA_IMPORT_KINDS.map((kind) => IMPORT_KIND_META[kind]);
