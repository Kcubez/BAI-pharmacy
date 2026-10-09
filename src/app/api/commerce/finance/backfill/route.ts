import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notDeleted } from "@/lib/soft-delete";
import { NextRequest, NextResponse } from "next/server";

function accountingType(category: string, title: string, income: boolean) {
  const text = `${category} ${title}`.toLowerCase();
  if (income) return "payment";
  if (/salary|staff|payroll|wage/.test(text)) return "salary";
  if (/inventory|stock|cogs|product cost/.test(text)) return "cogs";
  if (/debt|loan/.test(text)) return "debt";
  if (/voucher/.test(text)) return "voucher";
  return "operating_expense";
}

// Creates ledger context for older Commerce records that predate FinanceEntry.
// It never edits Deals/Expenses and skips exact same-date, title, amount records.
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const where = { userId: session.user.id };
  const [deals, expenses, existing] = await Promise.all([
    prisma.deal.findMany({ where: { ...where, ...notDeleted, stage: "WON" }, select: { id: true, wonAt: true, createdAt: true, quotedAmount: true, note: true } }),
    prisma.expense.findMany({ where: { ...where, ...notDeleted }, select: { id: true, expenseDate: true, amount: true, category: true, vendor: true, note: true } }),
    prisma.financeEntry.findMany({ where: { ...where, ...notDeleted }, select: { entryDate: true, title: true, amount: true } }),
  ]);
  const known = new Set(existing.map((entry) => `${entry.entryDate.toISOString().slice(0, 10)}|${entry.title}|${entry.amount}`));
  const entries = [
    ...deals.map((deal) => ({ date: deal.wonAt ?? deal.createdAt, title: deal.note?.split(" · ")[0] || "Product sale", amount: deal.quotedAmount ?? 0, cashType: "Income", type: "payment" })),
    ...expenses.map((expense) => ({ date: expense.expenseDate, title: expense.note || expense.vendor || expense.category, amount: expense.amount, cashType: "Expense", type: accountingType(expense.category, `${expense.vendor || ""} ${expense.note || ""}`, false) })),
  ].filter((entry) => entry.amount > 0 && !known.has(`${entry.date.toISOString().slice(0, 10)}|${entry.title}|${entry.amount}`));
  if (entries.length) await prisma.financeEntry.createMany({ data: entries.map((entry) => ({ userId: session.user.id, entryDate: entry.date, title: entry.title, amount: entry.amount, cashType: entry.cashType, accountingType: entry.type, status: "recorded", notes: "Backfilled from existing Commerce record" })) });
  return NextResponse.json({ created: entries.length });
}
