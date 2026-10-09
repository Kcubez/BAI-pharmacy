import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notDeleted } from "@/lib/soft-delete";
import { customerOwnedByUserOrAdmin } from "@/lib/tenant-scope";
import { parsePeriodParams, resolvePeriodRange } from "@/lib/period-range";
import type { Prisma } from "@/generated/prisma/client";
import { NextRequest, NextResponse } from "next/server";

function dealTotal(deal: { quotedAmount: number | null; items: { quantity: number; unitPrice: number }[] }) {
  const itemTotal = deal.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  return itemTotal || deal.quotedAmount || 0;
}

/**
 * Commerce customer directory (BAI-service "Purchased Customers Directory").
 * Purchase aggregates come from WON deals in the selected period, while the
 * customer entity itself is shared with /api/customers.
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "10")));
  const search = searchParams.get("search") || "";
  const status = searchParams.get("status") || "";

  const resolved = parsePeriodParams(searchParams);
  const { start, end } = resolvePeriodRange(resolved);
  const dateRange = { gte: start, lt: end };

  // A customer belongs to the period when the customer itself or any of its
  // purchases/inquiries/activity was created inside the range.
  const where: Prisma.CustomerWhereInput = {
    ...customerOwnedByUserOrAdmin(session),
    ...notDeleted,
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search, mode: "insensitive" as const } },
            { company: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(resolved.period !== "overall"
      ? {
          AND: [
            {
              OR: [
                { createdAt: dateRange },
                { demandRecords: { some: { createdAt: dateRange, ...notDeleted } } },
                { activities: { some: { createdAt: dateRange } } },
                { deals: { some: { OR: [{ wonAt: dateRange }, { wonAt: null, createdAt: dateRange }], ...notDeleted } } },
              ],
            },
          ],
        }
      : {}),
  };

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: {
        deals: {
          where: { ...notDeleted, stage: "WON", OR: [{ wonAt: dateRange }, { wonAt: null, createdAt: dateRange }] },
          include: { items: true },
          orderBy: [{ wonAt: "desc" }, { createdAt: "desc" }],
        },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.customer.count({ where }),
  ]);

  const rows = customers.map((customer) => {
    const wonDeals = customer.deals;
    const latestDeal = wonDeals[0];
    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      company: customer.company,
      status: customer.status,
      notes: customer.notes,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
      purchaseCount: wonDeals.length,
      amountPaid: wonDeals.reduce((sum, deal) => sum + dealTotal(deal), 0),
      purchasedProduct: latestDeal
        ? latestDeal.items[0]?.productName ?? "Product sale"
        : null,
    };
  });

  return NextResponse.json({
    customers: rows,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}
