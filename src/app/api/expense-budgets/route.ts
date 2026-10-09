import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ownedByUserOrAdmin } from "@/lib/tenant-scope";
import { expenseBudgetSchema } from "@/lib/validations";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const year = Number(req.nextUrl.searchParams.get("year"));
  const month = Number(req.nextUrl.searchParams.get("month"));
  const budgets = await prisma.expenseBudget.findMany({
    where: {
      ...ownedByUserOrAdmin(session),
      ...(Number.isInteger(year) && year > 0 ? { year } : {}),
      ...(Number.isInteger(month) && month > 0 ? { month } : {}),
    },
    orderBy: { category: "asc" },
  });
  return NextResponse.json({ budgets });
}

export async function PUT(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const parsed = expenseBudgetSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid expense budget" }, { status: 400 });
  const { category, year, month, amount } = parsed.data;
  const budget = await prisma.expenseBudget.upsert({
    where: { userId_category_year_month: { userId: session.user.id, category, year, month } },
    create: { userId: session.user.id, category, year, month, amount },
    update: { amount },
  });
  return NextResponse.json({ budget });
}
