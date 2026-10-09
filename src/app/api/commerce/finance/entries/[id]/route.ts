import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notDeleted, softDeleteData } from "@/lib/soft-delete";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const result = await prisma.financeEntry.updateMany({
    where: { id, userId: session.user.id, ...notDeleted },
    data: softDeleteData(session.user.id, "Deleted from Finance Records"),
  });
  if (!result.count) return NextResponse.json({ message: "Finance record not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const result = await prisma.financeEntry.updateMany({
    where: { id, userId: session.user.id, ...notDeleted },
    data: {
      entryDate: body.entryDate ? new Date(body.entryDate) : undefined,
      title: String(body.title || "Finance record"),
      amount: Number(body.amount) || 0,
      cashType: body.cashType === "Income" ? "Income" : body.cashType === "Capital" ? "Capital" : "Expense",
      accountingType: String(body.accountingType || "operating_expense"),
      status: String(body.status || "recorded"),
      counterparty: body.counterparty || null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      voucherNumber: body.voucherNumber || null,
      notes: body.notes || null,
    },
  });
  if (!result.count) return NextResponse.json({ message: "Finance record not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
