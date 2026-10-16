import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { bumpCacheVersion } from "@/lib/upstash";
import { z } from "zod";

const targetAmount = z.preprocess(
  (value) => value === null || (typeof value === "string" && value.trim() === "") ? null : value,
  z.coerce.number().finite().nonnegative().nullable(),
).optional();
const targetSchema = z.object({
  period: z.enum(["month", "year"]),
  year: z.coerce.number().int().min(1900).max(2100),
  month: z.coerce.number().int().min(0).max(12),
  targetSalesAmount: targetAmount,
  targetExpenseAmount: targetAmount,
  targetDemandCount: targetAmount,
  targetAppointments: targetAmount,
  targetNewCustomers: targetAmount,
  targetCollectionAmount: targetAmount,
  targetArLimit: targetAmount,
  targetApLimit: targetAmount,
}).refine((value) => value.period === "year" || value.month >= 1, { message: "Select a valid month" });

// GET /api/settings/target — fetch target for specific period
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const period = searchParams.get("period") === "year" ? "year" : "month";
  const year = Number(searchParams.get("year"));
  const monthVal = searchParams.get("month") ? Number(searchParams.get("month")) : null;

  if (isNaN(year)) {
    return NextResponse.json({ message: "Invalid year parameter" }, { status: 400 });
  }

  const month = period === "year" ? null : monthVal;

  const target = await prisma.periodTarget.findFirst({
    where: {
      userId: session.user.id,
      period,
      year,
      month: month ?? 0, // In db we store 0 if month is null to avoid composite unique key issues with nullable fields
    },
  });

  return NextResponse.json({
    target: target || {
      targetSalesAmount: null,
      targetExpenseAmount: null,
      targetDemandCount: null,
      targetAppointments: null,
      targetNewCustomers: null,
      targetCollectionAmount: null,
      targetArLimit: null,
      targetApLimit: null,
    },
  });
}

// PUT /api/settings/target — set targets for specific period
export async function PUT(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const parsed = targetSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Enter valid non-negative targets and a valid period" }, { status: 400 });
  const { period: parsedPeriod, year: parsedYear, month, ...values } = parsed.data;
  const parsedMonth = parsedPeriod === "year" ? 0 : month;

  try {
    const updated = await prisma.periodTarget.upsert({
      where: {
        userId_period_year_month: {
          userId: session.user.id,
          period: parsedPeriod,
          year: parsedYear,
          month: parsedMonth,
        },
      },
      create: {
        userId: session.user.id,
        period: parsedPeriod,
        year: parsedYear,
        month: parsedMonth,
        ...values,
      },
      update: values,
    });

    await bumpCacheVersion("pharmacy", session.user.id);
    return NextResponse.json({ target: updated });
  } catch (error) {
    console.error("Failed to save target settings:", error);
    return NextResponse.json({ message: "Failed to save targets" }, { status: 500 });
  }
}
