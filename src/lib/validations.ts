import * as z from "zod";

// ─── Auth Schemas ────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email({ message: "Valid email required" }),
  password: z.string().min(8, { message: "Password must be at least 8 characters" }),
});

export const registerSchema = z
  .object({
    name: z.string().min(2, { message: "Name must be at least 2 characters" }),
    email: z.string().email({ message: "Valid email required" }),
    password: z
      .string()
      .min(8, { message: "Password must be at least 8 characters" })
      .regex(/[A-Z]/, { message: "Must contain at least one uppercase letter" })
      .regex(/[0-9]/, { message: "Must contain at least one number" }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

// ─── Admin / User Management Schemas ────────────────────────────────────────

export const createUserSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters" }),
  email: z.string().email({ message: "Valid email required" }),
  password: z.string().min(8, { message: "Password must be at least 8 characters" }),
  role: z.enum(["user", "admin"]),
});

export const updateUserSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters" }),
  email: z.string().email({ message: "Valid email required" }),
  role: z.enum(["user", "admin"]),
});

// ─── Commerce Schemas ──────────────────────────────────────────────────────

export const expenseCategories = [
  "COGS",
  "MARKETING_AND_ADS",
  "LOGISTICS_AND_FULFILLMENT",
  "PLATFORM_AND_TRANSACTION_FEES",
  "STAFFING",
  "OPERATIONS_AND_OVERHEAD",
  "RETURNS_REFUNDS_AND_LOSS",
  "MISCELLANEOUS",
] as const;

export const dealStages = [
  "NEW_LEAD",
  "QUOTED",
  "FOLLOW_UP_NEEDED",
  "PENDING",
  "WON",
  "LOST",
] as const;

export const fulfillmentStatuses = [
  "NOT_APPLICABLE",
  "PENDING",
  "PROCESSING",
  "FULFILLED",
  "CANCELLED",
] as const;

const optionalText = z.string().trim().max(500).optional().nullable();

export const productSchema = z.object({
  name: z.string().trim().min(1, "Product name is required").max(200),
  sku: z.string().trim().min(1, "SKU is required").max(100),
  category: optionalText,
  unitCost: z.coerce.number().min(0).optional().nullable(),
  sellingPrice: z.coerce.number().min(0).optional().nullable(),
  stockQty: z.coerce.number().int().min(0).default(0),
  lowStockThreshold: z.coerce.number().int().min(0).default(0),
});

export const dealItemSchema = z.object({
  productId: z.string().cuid().optional().nullable(),
  productName: z.string().trim().min(1, "Product name is required").max(200),
  sku: z.string().trim().max(100).optional().nullable(),
  quantity: z.coerce.number().int().positive().default(1),
  unitPrice: z.coerce.number().min(0),
  unitCost: z.coerce.number().min(0).optional().nullable(),
});

export const dealSchema = z.object({
  customerId: z.string().cuid().optional().nullable(),
  stage: z.enum(dealStages).default("NEW_LEAD"),
  fulfillmentStatus: z.enum(fulfillmentStatuses).default("NOT_APPLICABLE"),
  source: z.string().trim().min(1).max(100).default("telegram"),
  sourceChannel: optionalText,
  quotedAmount: z.coerce.number().min(0).optional().nullable(),
  lastContactAt: z.coerce.date().optional().nullable(),
  wonAt: z.coerce.date().optional().nullable(),
  lostAt: z.coerce.date().optional().nullable(),
  lostReason: optionalText,
  note: z.string().trim().max(2000).optional().nullable(),
  items: z.array(dealItemSchema).max(100).default([]),
});

export const expenseSchema = z.object({
  category: z.enum(expenseCategories),
  subcategory: optionalText,
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  expenseDate: z.coerce.date(),
  vendor: optionalText,
  note: z.string().trim().max(2000).optional().nullable(),
});

export const marketingMetricSchema = z.object({
  metricDate: z.coerce.date(),
  channel: optionalText,
  spend: z.coerce.number().min(0).default(0),
  reach: z.coerce.number().int().min(0).optional().nullable(),
  impressions: z.coerce.number().int().min(0).optional().nullable(),
  adDrivenOrders: z.coerce.number().int().min(0).optional().nullable(),
  note: z.string().trim().max(2000).optional().nullable(),
});

export const expenseBudgetSchema = z.object({
  category: z.enum(expenseCategories),
  amount: z.coerce.number().min(0),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export const followUpNoteSchema = z.object({
  dealId: z.string().cuid(),
  messageId: z.string().cuid().optional().nullable(),
  aiDraftedText: z.string().trim().min(1).max(4000),
  ownerNote: z.string().trim().max(4000).optional().nullable(),
  intentDetected: optionalText,
  suggestedNextAction: z.string().trim().max(1000).optional().nullable(),
  suggestedFollowUpDate: z.coerce.date().optional().nullable(),
  status: z.enum(["DRAFT", "ACCEPTED", "EDITED", "DISMISSED"]).default("DRAFT"),
});

// ─── Pharmacy import ─────────────────────────────────────────────────────────

export const pharmacyImportSchema = z.object({
  stockYear: z.coerce.number().int().min(2000).max(2100).optional(),
  stockMonth: z.coerce.number().int().min(1).max(12).optional(),
  // Note: FormData delivers checkbox state as "on"/"true"/absent strings —
  // plain z.coerce.boolean() would turn the string "false" into true.
  overwrite: z.preprocess(
    (v) => v === true || v === "true" || v === "on" || v === "1",
    z.boolean().default(false),
  ),
  // Restrict an import/confirm to a single sheet kind (type picker).
  onlyKind: z.enum([
    "po", "invoice", "price_list", "stock", "receivable",
    "sales_maei", "sales_mega", "movement", "minmax", "expiry", "storein", "returns",
  ]).optional(),
});

export const pharmacyPageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(10),
});

// ─── Types ───────────────────────────────────────────────────────────────────

export type LoginFormValues = z.infer<typeof loginSchema>;
export type RegisterFormValues = z.infer<typeof registerSchema>;
export type CreateUserFormValues = z.infer<typeof createUserSchema>;
export type UpdateUserFormValues = z.infer<typeof updateUserSchema>;
export type ProductFormValues = z.infer<typeof productSchema>;
export type DealFormValues = z.infer<typeof dealSchema>;
export type ExpenseFormValues = z.infer<typeof expenseSchema>;
export type MarketingMetricFormValues = z.infer<typeof marketingMetricSchema>;
export type ExpenseBudgetFormValues = z.infer<typeof expenseBudgetSchema>;
export type FollowUpNoteFormValues = z.infer<typeof followUpNoteSchema>;
export type PharmacyImportValues = z.infer<typeof pharmacyImportSchema>;
export type PharmacyPageValues = z.infer<typeof pharmacyPageSchema>;
