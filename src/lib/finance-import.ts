import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { parseExcelDate } from "@/lib/demand-parser";
import { findExistingImportKey, isPrismaUniqueConstraintError, restoreImportKey } from "@/lib/commerce-import";
import { ExpenseCategory, type ExpenseCategory as ExpenseCategoryValue } from "@/generated/prisma/enums";

// ─── Finance transaction import (shared by Telegram webhook + web import) ────

export type FinanceRecord = {
  date: Date | null;
  description: string;
  category: string;
  type: string;
  amount: number;
  paymentMethod: string;
  reference: string;
  notes: string;
  accountingType: string;
  status: string;
  counterparty: string;
  dueDate: Date | null;
};

export function normalizeFinanceCategory(category: string | null | undefined): ExpenseCategoryValue {
  const value = (category || "").toLowerCase();
  if (/marketing|ad|ads|facebook|google|campaign/.test(value)) return ExpenseCategory.MARKETING_AND_ADS;
  if (/logistic|delivery|fulfillment|shipping|courier/.test(value)) return ExpenseCategory.LOGISTICS_AND_FULFILLMENT;
  if (/platform|transaction|fee|payment|kpay|bank/.test(value)) return ExpenseCategory.PLATFORM_AND_TRANSACTION_FEES;
  if (/staff|salary|payroll|wage/.test(value)) return ExpenseCategory.STAFFING;
  if (/cogs|cost|inventory|stock|product|purchase|supplier/.test(value)) return ExpenseCategory.COGS;
  if (/return|refund|loss|damage/.test(value)) return ExpenseCategory.RETURNS_REFUNDS_AND_LOSS;
  if (/operation|admin|office|rent|utility|overhead/.test(value)) return ExpenseCategory.OPERATIONS_AND_OVERHEAD;
  return ExpenseCategory.MISCELLANEOUS;
}

export function normalizeCashType(value: string | null | undefined): "Income" | "Expense" {
  const v = (value || "").trim().toLowerCase();
  if (/income|revenue|incoming|receiv|voucher|capital|investment|ဝင်ငွေ|ရောင်း|\bsales?\b/.test(v)) {
    return "Income";
  }
  return "Expense";
}

export function normalizeAccountingType(value: string | null | undefined, cashType: string) {
  const raw = (value || "").toLowerCase();
  if (/salary|payroll|wage/.test(raw)) return "salary";
  if (/cogs|cost of goods|inventory/.test(raw)) return "cogs";
  if (/receiv/.test(raw)) return "receivable";
  if (/debt|loan|liabilit/.test(raw)) return "debt";
  if (/voucher/.test(raw)) return "voucher";
  if (/capital|investment/.test(raw)) return "owner_capital";
  if (/payment/.test(raw)) return "payment";
  return cashType.toLowerCase() === "income" ? "payment" : "operating_expense";
}

export function parseFinanceTextRecord(text: string, fallbackDate: Date): FinanceRecord {
  const cleaned = text.replace(/[၀-၉]/g, (digit) => String("၀၁၂၃၄၅၆၇၈၉".indexOf(digit))).replace(/,/g, "");
  const field = (names: string[]) => {
    for (const name of names) {
      const match = cleaned.match(new RegExp(`${name}\\s*[:：]\\s*([^\\n]+)`, "i"));
      if (match?.[1]?.trim()) return match[1].trim();
    }
    return "";
  };
  const rawDate = field(["Date", "ရက်စွဲ"]);
  const rawType = field(["Type", "အမျိုးအစား"]);
  const rawAmount = field(["Amount \\(MMK\\)", "Amount", "ငွေပမာဏ"]);
  const amount = Number(rawAmount.match(/\d+(?:\.\d+)?/)?.[0] || 0);
  const lower = cleaned.toLowerCase();
  const inferredType = rawType || (/income|revenue|sale|ရောင်း|ဝင်ငွေ/.test(lower) ? "Income" : "Expense");

  return {
    date: parseExcelDate(rawDate) || fallbackDate,
    description: field(["Description", "အကြောင်းအရာ"]) || text.slice(0, 120),
    category: field(["Category", "အမျိုးအစား"]) || "Miscellaneous",
    type: normalizeCashType(inferredType),
    amount: Number.isFinite(amount) ? amount : 0,
    paymentMethod: field(["Payment Method", "Method"]) || "Unknown",
    reference: field(["Reference", "Ref"]) || "",
    notes: field(["Notes", "Note", "မှတ်ချက်"]) || "",
    accountingType: field(["Accounting Type", "Account Type"]) || "",
    status: field(["Status"]) || "recorded",
    counterparty: field(["Counterparty", "Vendor"]) || "",
    dueDate: parseExcelDate(field(["Due Date"])) || null,
  };
}

export type FinanceImportOutcome = "expense" | "ledger" | "skipped" | "duplicate" | "restored";

export async function createFinanceRecord({
  record,
  userId,
  sourceMessageId,
  importKey,
}: {
  record: FinanceRecord;
  userId: string;
  sourceMessageId?: string | null;
  importKey?: string | null;
}): Promise<FinanceImportOutcome> {
  if (record.amount <= 0) return "skipped";

  // Missing dates fall back to the import moment here at write time — never
  // in the parsed row — so fingerprints stay stable across re-imports.
  const recordDate = record.date || new Date();
  const entryKey = importKey ?? null;
  const isExpenseRow = normalizeCashType(record.type) === "Expense";
  const expenseKeyFor = (key: string | null) => (key ? `${key}:expense` : null);
  if (entryKey) {
    const status = await findExistingImportKey("financeEntry", userId, entryKey);
    if (status === "live") return "duplicate";
    if (status === "deleted") {
      // Trashed rows come back instead of being skipped as duplicates. If
      // the row vanished mid-flight (concurrent hard-delete), fall through
      // and create it fresh below instead of losing it.
      const restoredId = await restoreImportKey("financeEntry", userId, entryKey);
      if (restoredId) {
        const eKey = expenseKeyFor(entryKey) as string;
        const expenseStatus = await findExistingImportKey("expense", userId, eKey);
        if (expenseStatus === "deleted") {
          await restoreImportKey("expense", userId, eKey);
        } else if (expenseStatus === "missing" && isExpenseRow) {
          try {
            await prisma.expense.create({
              data: {
                userId,
                category: normalizeFinanceCategory(record.category),
                subcategory: record.category || record.description,
                amount: record.amount,
                expenseDate: recordDate,
                vendor: record.counterparty || record.paymentMethod || null,
                note: [record.description, record.notes, record.reference ? `Ref: ${record.reference}` : ""]
                  .filter(Boolean)
                  .join(" · "),
                importKey: eKey,
              },
            });
          } catch (err) {
            if (!isPrismaUniqueConstraintError(err)) throw err;
          }
        }
        return "restored";
      }
      // Entry is missing but the derived expense key is live (partial state
      // from an earlier interrupted import): the expense is already recorded,
      // so skip without writing another ledger row.
      if (isExpenseRow) {
        const eKey = expenseKeyFor(entryKey) as string;
        if ((await findExistingImportKey("expense", userId, eKey)) === "live") {
          return "duplicate";
        }
      }
    }
  }

  try {
    await prisma.financeEntry.create({ data: {
      userId, entryDate: recordDate, cashType: normalizeCashType(record.type),
      accountingType: normalizeAccountingType(record.accountingType || record.category, record.type), title: record.description || record.category || "Finance record",
      amount: record.amount, status: record.status || "recorded", counterparty: record.counterparty || null,
      dueDate: record.dueDate, voucherNumber: record.reference || null, paymentMethod: record.paymentMethod || null, notes: record.notes || null,
      importKey: entryKey,
    }});
  } catch (err) {
    if (isPrismaUniqueConstraintError(err)) return "duplicate";
    throw err;
  }

  if (normalizeCashType(record.type) === "Income") {
    // Ledger-only: income rows (sales summaries, receivables, vouchers, owner
    // capital) are accounting records, NOT sales. Revenue comes from actual
    // order deals (sales_orders import / CS import) so the ledger never
    // double-counts or inflates Revenue with capital injections.
    return "ledger";
  }

  const expenseKey = expenseKeyFor(entryKey);
  const vendor = record.counterparty || record.paymentMethod || null;
  const methodSuffix =
    record.counterparty && record.paymentMethod && record.paymentMethod !== "Unknown"
      ? `via ${record.paymentMethod}`
      : "";
  try {
    await prisma.expense.create({
      data: {
        userId,
        category: normalizeFinanceCategory(record.category),
        subcategory: record.category || record.description,
        amount: record.amount,
        expenseDate: recordDate,
        vendor,
        note: [record.description, record.notes, record.reference ? `Ref: ${record.reference}` : "", methodSuffix, sourceMessageId ? `Telegram message: ${sourceMessageId}` : ""]
          .filter(Boolean)
          .join(" · "),
        importKey: expenseKey,
      },
    });
  } catch (err) {
    // Ledger entry above is already saved; a conflicting expense key just
    // means this row was imported before.
    if (isPrismaUniqueConstraintError(err)) return "duplicate";
    throw err;
  }
  return "expense";
}

export function isFinanceRecordsHeaders(headers: string[]): boolean {
  const normalized = headers.map(h => String(h || '').trim().toLowerCase());
  return (
    normalized.includes('type') &&
    (normalized.includes('amount_mmk') || normalized.includes('amount (mmk)') || normalized.includes('amount')) &&
    (normalized.includes('description') || normalized.includes('category'))
  );
}


export function parseFinanceRecordsSpreadsheet(fileBuffer: Buffer): FinanceRecord[] {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
  const allRecords: FinanceRecord[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: true });
    for (const row of rows) {
      const getVal = (keys: string[]) => {
        const normalize = (s: string) => s.toLowerCase().trim().replace(/[_-]+/g, ' ');
        for (const k of keys) {
          const normalizedK = normalize(k);
          const matchedKey = Object.keys(row).find(
            rk => normalize(rk) === normalizedK
          );
          if (matchedKey !== undefined) return row[matchedKey];
        }
        return null;
      };

      const dateVal = getVal(['Date', 'date']);
      // Keep null (not `new Date()`) so fingerprints stay stable across
      // re-imports; the import-moment fallback applies once at write time.
      const dateObj = parseExcelDate(dateVal);

      const desc = String(getVal(['Description', 'description', 'desc']) || '').trim();
      const category = String(getVal(['Category', 'category', 'cat']) || '').trim();
      const type = String(getVal(['Type', 'type']) || '').trim();
      const amountVal = getVal(['Amount (MMK)', 'amount_mmk', 'amount']);

      let amount = 0;
      if (amountVal != null) {
        const clean = String(amountVal).replace(/[\u1040-\u1049]/g, (d) => {
          const digits: Record<string, string> = {
            '\u1040': '0', '\u1041': '1', '\u1042': '2', '\u1043': '3', '\u1044': '4',
            '\u1045': '5', '\u1046': '6', '\u1047': '7', '\u1048': '8', '\u1049': '9',
          };
          return digits[d] || d;
        }).replace(/,/g, '');
        const n = parseFloat(clean);
        if (!isNaN(n)) amount = n;
      }

      const payMethod = String(getVal(['Payment Method', 'payment_method']) || '').trim();
      const ref = String(getVal(['Reference', 'reference']) || '').trim();
      const notes = String(getVal(['Notes', 'notes', 'note']) || '').trim();
      const accountingType = String(getVal(['Accounting Type', 'accounting_type', 'account type']) || '').trim();
      const status = String(getVal(['Status', 'status']) || '').trim();
      const counterparty = String(getVal(['Counterparty', 'counterparty', 'vendor']) || '').trim();
      const dueDate = parseExcelDate(getVal(['Due Date', 'due_date'])) || null;

      if (!type) continue;

      allRecords.push({
        date: dateObj,
        description: desc,
        category,
        type,
        amount,
        paymentMethod: payMethod,
        reference: ref,
        notes,
        accountingType,
        status,
        counterparty,
        dueDate,
      });
    }
  }
  return allRecords;
}
