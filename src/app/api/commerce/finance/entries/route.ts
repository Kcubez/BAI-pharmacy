import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const amount = Number(body.amount);
  if (!body.title || !Number.isFinite(amount) || amount <= 0) return NextResponse.json({ message: "A title and positive amount are required" }, { status: 400 });
  const entry = await prisma.financeEntry.create({ data: {
    userId: session.user.id, entryDate: body.entryDate ? new Date(body.entryDate) : new Date(), title: String(body.title), amount,
    cashType: body.cashType === "Income" ? "Income" : body.cashType === "Capital" ? "Capital" : "Expense",
    accountingType: String(body.accountingType || "operating_expense"), status: String(body.status || "recorded"),
    counterparty: body.counterparty || null, dueDate: body.dueDate ? new Date(body.dueDate) : null, voucherNumber: body.voucherNumber || null, notes: body.notes || null,
  }});
  return NextResponse.json({ entry }, { status: 201 });
}
