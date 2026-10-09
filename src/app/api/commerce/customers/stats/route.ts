import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notDeleted } from "@/lib/soft-delete";
import { ownedByUserOrAdmin } from "@/lib/tenant-scope";
import { parsePeriodParams, resolvePeriodRange } from "@/lib/period-range";
import { NextRequest, NextResponse } from "next/server";

function dealTotal(deal: { quotedAmount: number | null; items: { quantity: number; unitPrice: number }[] }) {
  const itemTotal = deal.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  return itemTotal || deal.quotedAmount || 0;
}

/**
 * Period stat cards for the Commerce Customers tab, mirroring BAI-service:
 * Purchase Records / Pending Purchases / Purchase Customers / Avg Spending Value.
 * Purchases are WON deals; pending purchases are open pipeline deals.
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const resolved = parsePeriodParams(req.nextUrl.searchParams);
  const { start, end } = resolvePeriodRange(resolved);
  if (!(start < end)) {
    return NextResponse.json({ message: "Invalid period" }, { status: 400 });
  }

  const ownerScope = ownedByUserOrAdmin(session);
  const wonDate = { OR: [{ wonAt: { gte: start, lt: end } }, { wonAt: null, createdAt: { gte: start, lt: end } }] };

  const [wonDeals, openDeals] = await Promise.all([
    prisma.deal.findMany({
      where: { ...ownerScope, ...notDeleted, stage: "WON", ...wonDate },
      include: { items: true },
    }),
    prisma.deal.findMany({
      where: { ...ownerScope, ...notDeleted, stage: { notIn: ["WON", "LOST"] }, createdAt: { gte: start, lt: end } },
      select: { id: true },
    }),
  ]);

  const purchaserIds = new Set(wonDeals.map((deal) => deal.customerId).filter(Boolean));
  const revenue = wonDeals.reduce((sum, deal) => sum + dealTotal(deal), 0);

  return NextResponse.json({
    totalPurchaseRecords: wonDeals.length,
    pendingPurchaseRecords: openDeals.length,
    purchaseCustomers: purchaserIds.size,
    avgSpendingValue: purchaserIds.size > 0 ? revenue / purchaserIds.size : 0,
  });
}
