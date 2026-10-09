import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notDeleted } from "@/lib/soft-delete";
import { customerOwnedByUserOrAdmin, ownedByUserOrAdmin } from "@/lib/tenant-scope";
import { monthNames, parsePeriodParams, resolvePeriodRange } from "@/lib/period-range";
import { NextRequest, NextResponse } from "next/server";

function dealTotal(deal: { quotedAmount: number | null; items: { quantity: number; unitPrice: number }[] }) {
  const itemTotal = deal.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  return itemTotal || deal.quotedAmount || 0;
}

function buildFinanceTimeline(
  period: string,
  selectedStart: Date,
  selectedEnd: Date,
  revenueEvents: { date: Date; value: number }[],
  expenseEvents: { date: Date; value: number }[],
) {
  const allEvents = [...revenueEvents, ...expenseEvents];
  if (allEvents.length === 0) return [];
  const firstEvent = new Date(Math.min(...allEvents.map((event) => event.date.getTime())));
  const lastEvent = new Date(Math.max(...allEvents.map((event) => event.date.getTime())));
  const overall = period === "overall";
  const timelineStart = overall ? new Date(Date.UTC(firstEvent.getUTCFullYear(), firstEvent.getUTCMonth(), firstEvent.getUTCDate())) : selectedStart;
  const timelineEnd = overall ? new Date(Date.UTC(lastEvent.getUTCFullYear(), lastEvent.getUTCMonth(), lastEvent.getUTCDate() + 1)) : selectedEnd;
  const days = Math.ceil((timelineEnd.getTime() - timelineStart.getTime()) / 86_400_000);
  const daily = period === "day" || period === "month" || period === "custom" || (overall && days <= 90);
  const buckets = new Map<string, { label: string; revenue: number; expense: number }>();
  const keyFor = (date: Date) => daily ? date.toISOString().slice(0, 10) : date.toISOString().slice(0, 7);
  const labelFor = (date: Date) => daily ? date.toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" }) : `${monthNames[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  const cursor = new Date(timelineStart);
  while (cursor < timelineEnd) {
    const key = keyFor(cursor);
    buckets.set(key, { label: labelFor(cursor), revenue: 0, expense: 0 });
    if (daily) cursor.setUTCDate(cursor.getUTCDate() + 1); else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  revenueEvents.forEach((event) => { const bucket = buckets.get(keyFor(event.date)); if (bucket) bucket.revenue += event.value; });
  expenseEvents.forEach((event) => { const bucket = buckets.get(keyFor(event.date)); if (bucket) bucket.expense += event.value; });
  return Array.from(buckets.values());
}

function formatCategory(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
    .replace("And", "&");
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const resolved = parsePeriodParams(req.nextUrl.searchParams);
  const { start, end } = resolvePeriodRange(resolved);
  if (!(start < end)) {
    return NextResponse.json({ message: "Invalid period" }, { status: 400 });
  }

  const userWhere = ownedByUserOrAdmin(session);
  const dateRange = { gte: start, lt: end };

  const [
    wonDeals,
    monthDeals,
    monthExpenses,
    marketingMetrics,
    financeEntries,
    customers,
    products,
  ] = await Promise.all([
    prisma.deal.findMany({
      where: { ...userWhere, ...notDeleted, stage: "WON", OR: [{ wonAt: dateRange }, { wonAt: null, createdAt: dateRange }] },
      include: { customer: true, items: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.deal.findMany({
      where: { ...userWhere, ...notDeleted, createdAt: dateRange },
      include: { customer: true, items: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.expense.findMany({
      where: { ...userWhere, ...notDeleted, expenseDate: dateRange },
      orderBy: { expenseDate: "desc" },
    }),
    prisma.marketingMetric.findMany({
      where: { ...userWhere, ...notDeleted, metricDate: dateRange },
      orderBy: { metricDate: "asc" },
    }),
    prisma.financeEntry.findMany({
      where: { ...userWhere, ...notDeleted, entryDate: dateRange },
      orderBy: { entryDate: "desc" },
    }),
    prisma.customer.findMany({
      where: { ...customerOwnedByUserOrAdmin(session), ...notDeleted },
      include: { deals: { where: { ...notDeleted }, include: { items: true }, orderBy: { updatedAt: "desc" } } },
      orderBy: { updatedAt: "desc" },
      take: 30,
    }),
    prisma.product.findMany({ where: { ...userWhere, ...notDeleted }, orderBy: { updatedAt: "desc" } }),
  ]);

  const revenue = wonDeals.reduce((sum, deal) => sum + dealTotal(deal), 0);
  const expense = monthExpenses.reduce((sum, item) => sum + item.amount, 0);
  const profit = revenue - expense;
  const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const pendingDeliveries = monthDeals.filter((deal) => deal.fulfillmentStatus === "PENDING" || deal.fulfillmentStatus === "PROCESSING").length;
  const pipelineDeals = monthDeals.filter((deal) => deal.stage !== "WON" && deal.stage !== "LOST").length;

  const monthlyTimeline = buildFinanceTimeline(
    resolved.period,
    start,
    end,
    wonDeals.map((deal) => ({ date: deal.wonAt ?? deal.createdAt, value: dealTotal(deal) })),
    monthExpenses.map((item) => ({ date: item.expenseDate, value: item.amount })),
  );

  const expenseTotals = new Map<string, number>();
  monthExpenses.forEach((item) => expenseTotals.set(item.category, (expenseTotals.get(item.category) ?? 0) + item.amount));
  const expenseBreakdown = Array.from(expenseTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([category, value]) => ({ category: formatCategory(category), value, percent: expense > 0 ? Math.round((value / expense) * 100) : 0 }));

  const financeRecords = [
    ...wonDeals.map((deal) => ({
      id: deal.id,
      recordType: "deal",
      date: (deal.wonAt ?? deal.createdAt).toISOString().slice(0, 10),
      description: `${deal.customer?.name ?? "Customer"} revenue`,
      category: "Product Sales",
      type: "Income",
      amount: dealTotal(deal),
    })),
    ...monthExpenses.map((item) => ({
      id: item.id,
      recordType: "expense",
      date: item.expenseDate.toISOString().slice(0, 10),
      description: item.subcategory || item.vendor || formatCategory(item.category),
      category: formatCategory(item.category),
      type: "Expense",
      amount: item.amount,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const accountingTotals = financeEntries.reduce<Record<string, number>>((totals, entry) => {
    totals[entry.accountingType] = (totals[entry.accountingType] ?? 0) + entry.amount;
    return totals;
  }, {});

  const stageMap: Record<string, { label: string; count: number; deals: { id: string; customer: string; amount: number }[] }> = {
    NEW_LEAD: { label: "New Leads", count: 0, deals: [] },
    QUOTED: { label: "Quoted", count: 0, deals: [] },
    PENDING: { label: "Pending Delivery", count: 0, deals: [] },
    WON: { label: "Closed Won", count: 0, deals: [] },
  };
  monthDeals.forEach((deal) => {
    const key = deal.stage === "FOLLOW_UP_NEEDED" ? "QUOTED" : deal.stage;
    if (!stageMap[key]) return;
    stageMap[key].count += 1;
    if (stageMap[key].deals.length < 2) {
      stageMap[key].deals.push({ id: deal.id, customer: deal.customer?.name ?? "Unknown Customer", amount: dealTotal(deal) });
    }
  });

  const adSpend = marketingMetrics.reduce((sum, item) => sum + item.spend, 0);
  const reach = marketingMetrics.reduce((sum, item) => sum + (item.reach ?? 0), 0);
  const adOrders = marketingMetrics.reduce((sum, item) => sum + (item.adDrivenOrders ?? 0), 0);
  // Keep the chart readable on long ranges by showing the most recent entries.
  const marketingChart = marketingMetrics.slice(-62).map((item) => ({
    label: item.metricDate.toISOString().slice(5, 10),
    spend: item.spend,
    orders: item.adDrivenOrders ?? 0,
  }));

  const productSales = new Map<string, { name: string; sku: string | null; orders: number; income: number }>();
  wonDeals.forEach((deal) => deal.items.forEach((item) => {
    const key = item.productName.trim().toLowerCase();
    const current = productSales.get(key) ?? { name: item.productName.trim(), sku: item.sku, orders: 0, income: 0 };
    current.orders += item.quantity;
    current.income += item.quantity * item.unitPrice;
    productSales.set(key, current);
  }));
  const topProducts = Array.from(productSales.values()).sort((a, b) => b.income - a.income).slice(0, 5);

  const purchasedCustomers = customers.flatMap((customer) => {
    const won = customer.deals.find((deal) => deal.stage === "WON");
    if (!won) return [];
    return [{
      id: customer.id,
      name: customer.name,
      product: won.items[0]?.productName ?? "Product sale",
      amount: dealTotal(won),
      status: "Completed",
    }];
  }).slice(0, 10);

  const leads = monthDeals.filter((deal) => deal.stage !== "WON").slice(0, 10).map((deal) => ({
    id: deal.id,
    name: deal.customer?.name ?? "Unknown Customer",
    source: deal.sourceChannel || deal.source,
    product: deal.items[0]?.productName ?? "Product inquiry",
    status: deal.stage === "FOLLOW_UP_NEEDED" ? "Follow-up" : deal.stage === "QUOTED" ? "High Potential" : "New Inquiry",
  }));

  const lowStockProducts = products.filter((product) => product.stockQty > 0 && product.stockQty <= product.lowStockThreshold);
  const outOfStockProducts = products.filter((product) => product.stockQty <= 0);
  const inventoryValue = products.reduce((sum, product) => sum + product.stockQty * (product.unitCost ?? product.sellingPrice ?? 0), 0);

  return NextResponse.json({
    finance: {
      kpis: { revenue, expense, profit, profitMargin },
      timeline: monthlyTimeline,
      expenseBreakdown,
      records: financeRecords,
      accounting: {
        totals: accountingTotals,
        entries: financeEntries.map((entry) => ({ id: entry.id, date: entry.entryDate.toISOString().slice(0, 10), title: entry.title, cashType: entry.cashType, accountingType: entry.accountingType, amount: entry.amount, status: entry.status, counterparty: entry.counterparty, dueDate: entry.dueDate?.toISOString().slice(0, 10) ?? null, voucherNumber: entry.voucherNumber, notes: entry.notes })),
      },
      insights: [
        { tone: revenue >= expense ? "emerald" : "red", title: revenue >= expense ? "Revenue growth is healthy" : "Revenue needs attention", text: revenue >= expense ? "Revenue is ahead of total expense for this period." : "Expenses are higher than revenue for this period.", action: "View revenue" },
        { tone: "amber", title: expenseBreakdown[0] ? `${expenseBreakdown[0].category} expense needs review` : "Expense data is ready", text: expenseBreakdown[0] ? `${expenseBreakdown[0].category} is the biggest expense category this period.` : "Expense insights will appear after records are added.", action: "Review expenses" },
      ],
    },
    sales: {
      kpis: { totalSales: revenue, orders: monthDeals.length, pendingDeliveries, pipelineDeals },
      stages: Object.values(stageMap),
      insights: [
        { tone: pendingDeliveries > 0 ? "amber" : "emerald", title: pendingDeliveries > 0 ? `${pendingDeliveries} deliveries need attention` : "Deliveries are clear", text: pendingDeliveries > 0 ? "Orders marked ready are waiting for dispatch." : "No pending deliveries found for this period.", action: "Review deliveries" },
        { tone: "emerald", title: `${pipelineDeals} deals in pipeline`, text: "Focus follow-up on the highest-value quoted and pending deals first.", action: "View pipeline" },
      ],
    },
    marketing: {
      kpis: { adSpend, reach, costPerOrder: adOrders > 0 ? adSpend / adOrders : 0, adOrders },
      chart: marketingChart,
      topProducts: topProducts.map((product) => ({ name: product.name, orders: product.orders })),
      insights: [
        { tone: adSpend > 0 && adOrders === 0 ? "amber" : "emerald", title: adSpend > 0 && adOrders === 0 ? "Ad spend needs order review" : "Ad performance is measurable", text: adOrders > 0 ? `${adOrders} orders are attributed to ads this period.` : "Add ad-driven orders to marketing records to measure conversion.", action: "Review ad targeting" },
        { tone: "emerald", title: topProducts[0] ? `${topProducts[0].name} is converting` : "Product conversion data is ready", text: topProducts[0] ? "Use this product in the next campaign cycle." : "Top ad-driven products will appear after sales are recorded.", action: "View product campaign" },
      ],
    },
    customers: {
      kpis: { inquiries: monthDeals.length, highPotential: monthDeals.filter((deal) => deal.stage === "QUOTED" || deal.stage === "FOLLOW_UP_NEEDED").length, totalCustomers: customers.length, avgOrderValue: wonDeals.length ? revenue / wonDeals.length : 0 },
      purchasedCustomers,
      leads,
      insights: [
        { tone: "emerald", title: "High-potential inquiries need attention", text: "Prioritize people who have asked about products, prices, or delivery.", action: "Review high potential" },
        { tone: "amber", title: "Follow-up timing needs review", text: "Review the queue before customer interest cools.", action: "Review follow-ups" },
      ],
    },
    inventory: {
      kpis: { totalProducts: products.length, lowStockItems: lowStockProducts.length, outOfStock: outOfStockProducts.length, inventoryValue },
      products: products.map((product) => ({
        id: product.id,
        name: product.name,
        productCode: product.sku,
        sku: product.sku,
        category: product.category,
        unitCost: product.unitCost,
        sellingPrice: product.sellingPrice,
        stockQty: product.stockQty,
        lowStockThreshold: product.lowStockThreshold,
        stockLevel: `${product.stockQty} in stock (min ${product.lowStockThreshold})`,
        status: product.stockQty <= 0 ? "Out of Stock" : product.stockQty <= product.lowStockThreshold ? "Low Stock" : "In Stock",
      })),
      insights: [
        { tone: outOfStockProducts.length ? "red" : "emerald", title: outOfStockProducts.length ? `${outOfStockProducts.length} products are out of stock` : "No stockouts found", text: outOfStockProducts.length ? "These products cannot be sold until replenished." : "Inventory has no out-of-stock products right now.", action: "Review stockouts" },
        { tone: "emerald", title: lowStockProducts[0] ? `${lowStockProducts[0].name} needs restock planning` : "Stock levels look stable", text: lowStockProducts[0] ? "This item is below or near its minimum quantity." : "Low-stock alerts will appear when a product crosses its threshold.", action: "View product" },
      ],
    },
  });
}
