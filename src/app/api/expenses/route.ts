import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notDeleted, softDeleteData } from "@/lib/soft-delete";
import { ownedByUserOrAdmin } from "@/lib/tenant-scope";
import { expenseSchema } from "@/lib/validations";
import type { Prisma } from "@/generated/prisma/client";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const category = req.nextUrl.searchParams.get("category");
  const where: Prisma.ExpenseWhereInput = { ...ownedByUserOrAdmin(session), ...notDeleted };
  if (category) where.category = category as Prisma.EnumExpenseCategoryFilter["equals"];
  const expenses = await prisma.expense.findMany({ where, orderBy: { expenseDate: "desc" } });
  return NextResponse.json({ expenses });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const parsed = expenseSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid expense" }, { status: 400 });
  const expense = await prisma.expense.create({ data: { userId: session.user.id, ...parsed.data } });
  return NextResponse.json({ expense }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (typeof body.id !== "string") return NextResponse.json({ message: "Expense ID is required" }, { status: 400 });
  const parsed = expenseSchema.partial().safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid expense" }, { status: 400 });
  const existing = await prisma.expense.findFirst({ where: { id: body.id, ...ownedByUserOrAdmin(session), ...notDeleted } });
  if (!existing) return NextResponse.json({ message: "Expense not found" }, { status: 404 });
  const written = await prisma.expense.updateMany({
    where: { id: existing.id, ...ownedByUserOrAdmin(session), ...notDeleted },
    data: parsed.data,
  });
  if (!written.count) return NextResponse.json({ message: "Expense not found" }, { status: 404 });
  const expense = await prisma.expense.findFirst({
    where: { id: existing.id, ...ownedByUserOrAdmin(session) },
  });
  return NextResponse.json({ expense });
}

export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ message: "Expense ID is required" }, { status: 400 });
  const result = await prisma.expense.updateMany({
    where: { id, ...ownedByUserOrAdmin(session), ...notDeleted },
    data: softDeleteData(session.user.id, req.nextUrl.searchParams.get("reason")),
  });
  if (!result.count) return NextResponse.json({ message: "Expense not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
