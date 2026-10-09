import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notDeleted, softDeleteData } from "@/lib/soft-delete";
import { ownedByUserOrAdmin } from "@/lib/tenant-scope";
import { NextRequest, NextResponse } from "next/server";

const workspaces = ["finance", "sales", "marketing", "customers", "inventory"] as const;
type Workspace = (typeof workspaces)[number];

function isWorkspace(value: string | null): value is Workspace {
  return Boolean(value && workspaces.includes(value as Workspace));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function rangeFrom(searchParams: URLSearchParams): { gte: Date; lt: Date } | null {
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to || !ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) return null;
  return {
    gte: new Date(`${from}T00:00:00.000Z`),
    lt: new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000),
  };
}

export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const workspace = req.nextUrl.searchParams.get("workspace");
  if (!isWorkspace(workspace)) {
    return NextResponse.json({ message: "A valid Commerce workspace is required" }, { status: 400 });
  }

  // Optional period scoping so Delete All matches the visible filter range.
  const dateRange = rangeFrom(req.nextUrl.searchParams);
  const deleteReason = `Deleted all ${workspace} records${dateRange ? ` (${req.nextUrl.searchParams.get("from")} to ${req.nextUrl.searchParams.get("to")})` : ""}`;
  const data = softDeleteData(session.user.id, deleteReason);
  const ownerScope = ownedByUserOrAdmin(session);

  let count = 0;

  if (workspace === "finance") {
    // Finance revenue comes from WON deals, so Delete All must clear both
    // sides of the ledger: expenses and won deals (recoverable via Trash).
    const [expenses, wonDeals, financeEntries] = await Promise.all([
      prisma.expense.updateMany({
        where: {
          ...ownerScope,
          ...notDeleted,
          ...(dateRange ? { expenseDate: dateRange } : {}),
        },
        data,
      }),
      prisma.deal.updateMany({
        where: {
          ...ownerScope,
          ...notDeleted,
          stage: "WON",
          ...(dateRange ? { OR: [{ wonAt: dateRange }, { wonAt: null, createdAt: dateRange }] } : {}),
        },
        data,
      }),
      prisma.financeEntry.updateMany({
        where: {
          ...ownerScope,
          ...notDeleted,
          ...(dateRange ? { entryDate: dateRange } : {}),
        },
        data,
      }),
    ]);
    count = expenses.count + wonDeals.count + financeEntries.count;
    return NextResponse.json({ success: true, count });
  }

  if (workspace === "customers") {
    // Match BAI-service semantics: deleting customers also soft-deletes their
    // purchase records so Trash can restore both together.
    const where = { ...ownerScope, ...notDeleted };
    const customerIds = (
      await prisma.customer.findMany({ where, select: { id: true } })
    ).map((customer) => customer.id);
    const [deletedCustomers, deletedRecords] = await prisma.$transaction([
      prisma.customer.updateMany({ where: { id: { in: customerIds } }, data }),
      prisma.demandRecord.updateMany({
        where: { customerId: { in: customerIds }, ...notDeleted },
        data: softDeleteData(session.user.id, "Deleted along with customer"),
      }),
    ]);
    count = deletedCustomers.count + deletedRecords.count;
    return NextResponse.json({ success: true, count });
  }

  {
    const where = {
      ...ownerScope,
      ...notDeleted,
      ...(dateRange
        ? workspace === "marketing"
          ? { metricDate: dateRange }
          : { createdAt: dateRange }
        : {}),
    };
    const result = workspace === "sales"
      ? await prisma.deal.updateMany({ where, data })
      : workspace === "marketing"
        ? await prisma.marketingMetric.updateMany({ where, data })
        : await prisma.product.updateMany({ where, data });
    count = result.count;
  }

  return NextResponse.json({ success: true, count });
}
