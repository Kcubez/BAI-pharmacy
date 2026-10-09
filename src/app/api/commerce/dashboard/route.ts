import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notDeleted } from "@/lib/soft-delete";
import { customerOwnedByUserOrAdmin, ownedByUserOrAdmin } from "@/lib/tenant-scope";
import { buildTrendBuckets, elapsedRatio, resolvePeriodRange, targetAnchor, parsePeriodParams } from "@/lib/period-range";
import type { Prisma } from "@/generated/prisma/client";
import { NextRequest, NextResponse } from "next/server";

function dealRevenue(deal: { quotedAmount: number | null; items: { quantity: number; unitPrice: number }[] }) {
  const itemTotal = deal.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  return itemTotal || deal.quotedAmount || 0;
}

function formatAmount(value: number) {
  return Math.round(value).toLocaleString();
}

function progress(current: number, target: number | null | undefined) {
  if (!target || target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const resolved = parsePeriodParams(req.nextUrl.searchParams);
  const periodLabel = resolved.period === "overall"
    ? "Overall"
    : resolved.period;
  const { start, end } = resolvePeriodRange(resolved);
  const buckets = buildTrendBuckets(resolved);
  const anchor = targetAnchor(resolved);
  const userWhere = ownedByUserOrAdmin(session);
  const dateRange = { gte: start, lt: end };
  const wonDealWhere: Prisma.DealWhereInput = {
    ...userWhere,
    ...notDeleted,
    stage: "WON",
    OR: [
      { wonAt: dateRange },
      { wonAt: null, createdAt: dateRange },
    ],
  };

  const [
    monthTarget,
    yearTarget,
    wonDeals,
    periodDeals,
    fulfilledOrders,
    customers,
    customerFirstDeals,
    expenses,
    lowStockCount,
    recentMessages,
  ] = await Promise.all([
    prisma.periodTarget.findFirst({
      where: { userId: session.user.id, period: "month", year: anchor.year, month: anchor.month },
    }),
    prisma.periodTarget.findFirst({
      where: { userId: session.user.id, period: "year", year: anchor.year, month: 0 },
    }),
    prisma.deal.findMany({
      where: wonDealWhere,
      include: { items: true },
      orderBy: { wonAt: "asc" },
    }),
    prisma.deal.findMany({
      where: { ...userWhere, ...notDeleted, createdAt: dateRange },
      include: { items: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.deal.count({
      where: {
        ...userWhere,
        ...notDeleted,
        fulfillmentStatus: "FULFILLED",
        // Won-date based so imported/backdated deals land in their own month.
        OR: [{ wonAt: dateRange }, { wonAt: null, createdAt: dateRange }],
      },
    }),
    prisma.customer.findMany({
      where: { ...customerOwnedByUserOrAdmin(session), ...notDeleted },
      select: { id: true, createdAt: true },
    }),
    // A customer can have been created when an old spreadsheet was imported,
    // even though the related order is backdated. Use the earliest business
    // record as the customer's first-seen date so historic imports appear in
    // their real month rather than the import month.
    prisma.deal.groupBy({
      by: ["customerId"],
      where: { ...userWhere, ...notDeleted, customerId: { not: null } },
      _min: { createdAt: true },
    }),
    prisma.expense.findMany({
      where: { ...userWhere, ...notDeleted, expenseDate: dateRange },
      orderBy: { expenseDate: "asc" },
    }),
    prisma.product.count({
      where: { ...userWhere, ...notDeleted, stockQty: { gt: 0 } },
    }),
    prisma.telegramMessage.findMany({
      where: { createdAt: dateRange, sender: userWhere.userId ? { userId: String(userWhere.userId) } : undefined },
      orderBy: { createdAt: "desc" },
      take: 1,
      select: { id: true },
    }),
  ]);

  // Raw saved targets — nulls mean "not set", exactly like BAI-service.
  // KPI pacing renders "Not set" instead of pretending defaults exist.
  const savedTargets = monthTarget ?? yearTarget ?? null;
  const salesTarget = savedTargets?.targetSalesAmount ?? null;
  const expenseTarget = savedTargets?.targetExpenseAmount ?? null;
  const demandTarget = savedTargets?.targetDemandCount ?? null;
  const appointmentsTarget = savedTargets?.targetAppointments ?? null;
  const newCustomersTarget = savedTargets?.targetNewCustomers ?? null;
  const revenue = wonDeals.reduce((sum, deal) => sum + dealRevenue(deal), 0);
  const expense = expenses.reduce((sum, item) => sum + item.amount, 0);
  const profitMargin = revenue > 0 ? ((revenue - expense) / revenue) * 100 : 0;
  const firstDealDateByCustomerId = new Map(
    customerFirstDeals
      .filter((deal) => deal.customerId !== null && deal._min.createdAt !== null)
      .map((deal) => [deal.customerId!, deal._min.createdAt!] as const),
  );
  const newCustomers = customers.filter((customer) => {
    const firstDealDate = firstDealDateByCustomerId.get(customer.id);
    const firstSeenAt = firstDealDate && firstDealDate < customer.createdAt
      ? firstDealDate
      : customer.createdAt;
    return firstSeenAt >= start && firstSeenAt < end;
  }).length;

  const incomeTrend = buckets.labels.map((label) => ({ label, value: 0 }));
  const orderTrend = buckets.labels.map((label) => ({ label, value: 0 }));

  wonDeals.forEach((deal) => {
    const date = deal.wonAt ?? deal.createdAt;
    const index = buckets.bucketIndex(date);
    if (index >= 0 && incomeTrend[index]) incomeTrend[index].value += dealRevenue(deal);
  });
  periodDeals.forEach((deal) => {
    const index = buckets.bucketIndex(deal.createdAt);
    if (index >= 0 && orderTrend[index]) orderTrend[index].value += 1;
  });

  const productMap = new Map<string, { name: string; sku: string | null; quantity: number; income: number }>();
  wonDeals.forEach((deal) => {
    deal.items.forEach((item) => {
      const key = item.productName.trim().toLowerCase();
      const current = productMap.get(key) ?? { name: item.productName.trim(), sku: item.sku, quantity: 0, income: 0 };
      current.quantity += item.quantity;
      current.income += item.quantity * item.unitPrice;
      productMap.set(key, current);
    });
  });
  const topProducts = Array.from(productMap.values()).sort((a, b) => b.income - a.income).slice(0, 5);
  const topProduct = topProducts[0];
  const ordersReceived = periodDeals.length;
  const ratio = elapsedRatio(start, end);
  const expectedToDate = (target: number) => Math.round(target * ratio);

  const targetProfitMargin = salesTarget && expenseTarget && salesTarget > 0
    ? ((salesTarget - expenseTarget) / salesTarget) * 100
    : null;

  // KPI target block: real pacing when a target exists, honest "Not set" otherwise.
  const kpiTarget = (target: number | null, unit: "" | " MMK" | " Target") => {
    if (target === null || target <= 0) {
      return { target: "Not set", expected: "Set targets to track pacing", status: "Not Set", tone: "slate" as const };
    }
    return {
      target: `${formatAmount(target)}${unit}`,
      expected: `Expected to date: ${formatAmount(expectedToDate(target))}`,
      status: "",
      tone: null,
    };
  };

  const revenueKpi = kpiTarget(salesTarget, " MMK");
  const expenseKpi = kpiTarget(expenseTarget, " MMK");
  const marginKpi = targetProfitMargin === null
    ? { target: "Not set", expected: "Set revenue & expense targets", status: "Not Set", tone: "slate" as const }
    : {
        target: `${Math.max(0, targetProfitMargin).toFixed(0)}% Margin`,
        expected: `Target Margin: ${Math.max(0, targetProfitMargin).toFixed(0)}%`,
        status: profitMargin >= targetProfitMargin ? "On Track" : "Below Target",
        tone: profitMargin >= targetProfitMargin ? ("emerald" as const) : ("red" as const),
      };
  const ordersKpi = kpiTarget(demandTarget, "");
  const fulfilledKpi = kpiTarget(appointmentsTarget, "");
  const customersKpi = kpiTarget(newCustomersTarget, " Target");

  const compareKpi = (value: number, target: number | null, onTrack: string, behind: string) => {
    if (target === null || target <= 0) return { status: "Not Set", tone: "slate" as const };
    return value >= target
      ? { status: onTrack, tone: "emerald" as const }
      : { status: behind, tone: "red" as const };
  };
  const compareExpenseKpi = (value: number, target: number | null) => {
    if (target === null || target <= 0) return { status: "Not Set", tone: "slate" as const };
    return value <= target
      ? { status: "On Track", tone: "emerald" as const }
      : { status: "Over Limit", tone: "red" as const };
  };
  const revenueCompare = compareKpi(revenue, salesTarget, "On Track", "Below Target");
  const expenseCompare = compareExpenseKpi(expense, expenseTarget);
  const ordersCompare = compareKpi(ordersReceived, demandTarget, "On Track", "Below Target");
  const fulfilledCompare = compareKpi(fulfilledOrders, appointmentsTarget, "On Track", "Below Target");
  const customersCompare = compareKpi(newCustomers, newCustomersTarget, "On Track", "Below Target");

  return NextResponse.json({
    period: periodLabel,
    year: resolved.year,
    month: resolved.month,
    targets: {
      targetSalesAmount: salesTarget,
      targetExpenseAmount: expenseTarget,
      targetDemandCount: demandTarget,
      targetAppointments: appointmentsTarget,
      targetNewCustomers: newCustomersTarget,
    },
    kpis: [
      {
        title: "Revenue",
        value: formatAmount(revenue),
        target: revenueKpi.target,
        expected: revenueKpi.expected,
        status: revenueCompare.status,
        tone: revenueCompare.tone,
        icon: "DollarSign",
        progressPercent: progress(revenue, salesTarget ?? 0),
      },
      {
        title: "Expense Limit",
        value: formatAmount(expense),
        target: expenseKpi.target,
        expected: expenseKpi.expected,
        status: expenseCompare.status,
        tone: expenseCompare.tone,
        icon: "Wallet",
        progressPercent: progress(expense, expenseTarget ?? 0),
      },
      {
        title: "Profit Margin",
        value: `${profitMargin.toFixed(1)}%`,
        target: marginKpi.target,
        expected: marginKpi.expected,
        status: marginKpi.status,
        tone: marginKpi.tone,
        icon: "TrendingUp",
        progressPercent: progress(profitMargin, Math.max(1, targetProfitMargin ?? 0)),
      },
      {
        title: "Orders Received",
        value: formatAmount(ordersReceived),
        target: ordersKpi.target,
        expected: ordersKpi.expected,
        status: ordersCompare.status,
        tone: ordersCompare.tone,
        icon: "Megaphone",
        progressPercent: progress(ordersReceived, demandTarget ?? 0),
      },
      {
        title: "Orders Fulfilled",
        value: formatAmount(fulfilledOrders),
        target: fulfilledKpi.target,
        expected: fulfilledKpi.expected,
        status: fulfilledCompare.status,
        tone: fulfilledCompare.tone,
        icon: "CalendarCheck",
        progressPercent: progress(fulfilledOrders, appointmentsTarget ?? 0),
      },
      {
        title: "New Customers",
        value: formatAmount(newCustomers),
        target: customersKpi.target,
        expected: customersKpi.expected,
        status: customersCompare.status,
        tone: customersCompare.tone,
        icon: "Users",
        progressPercent: progress(newCustomers, newCustomersTarget ?? 0),
      },
    ],
    insights: [],
    analytics: {
      topProducts,
      liveIntelligence: [
        {
          area: "Finance",
          text: topProduct
            ? `Highest grossing product ${topProduct.name} generated ${formatAmount(topProduct.income)} MMK this period.`
            : `Revenue recorded for this period is ${formatAmount(revenue)} MMK.`,
        },
        { area: "Sales", text: `${Math.max(ordersReceived - fulfilledOrders, 0)} orders are waiting for fulfillment follow-up.` },
        { area: "Inventory", text: `${lowStockCount} products have stock recorded and should be reviewed against minimum thresholds.` },
        { area: "System", text: recentMessages.length ? "Telegram Bot processed commerce data in the selected period." : "No Telegram commerce messages found for the selected period yet." },
      ],
      incomeTrend,
      orderTrend,
    },
  });
}
