import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notDeleted } from "@/lib/soft-delete";
import {
  ownedByUserOrAdmin,
  senderOwnedByUserOrAdmin,
  uploadedByUserOrAdmin,
} from "@/lib/tenant-scope";
import { NextRequest, NextResponse } from "next/server";

const DAY = 24 * 60 * 60 * 1000;
const STALE_DEAL_DAYS = 7;

type Priority = {
  title: string;
  impact: "high" | "medium" | "low";
  rationale: string;
  action: string;
  actionHref: string;
};

const OPEN_DEAL_STAGES = ["NEW_LEAD", "QUOTED", "FOLLOW_UP_NEEDED", "PENDING"];
const OPERATING_ACCOUNTING_TYPES = ["salary", "cogs", "operating_expense"];

function number(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function safeDate(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function buildScenarios(snapshot: { projectedRevenue30: number; projectedExpenses30: number }) {
  const scenario = (name: string, revenueMultiplier: number, expenseMultiplier: number, description: string) => {
    const revenue = Math.round(snapshot.projectedRevenue30 * revenueMultiplier);
    const expenses = Math.round(snapshot.projectedExpenses30 * expenseMultiplier);
    return { name, revenue, expenses, profit: revenue - expenses, description };
  };
  return [
    scenario("Downside", 0.85, 1.03, "Lower conversion and slightly higher operating costs."),
    scenario("Base case", 1, 1, "Current daily operating pace continues."),
    scenario("Upside", 1.15, 1.03, "Better follow-up conversion with controlled spend."),
  ];
}

function dealAmount(deal: { quotedAmount: number | null; items: { quantity: number; unitPrice: number }[] }): number {
  if (deal.quotedAmount !== null && deal.quotedAmount !== undefined) return number(deal.quotedAmount);
  return deal.items.reduce((sum, item) => sum + number(item.quantity) * number(item.unitPrice), 0);
}

// GET /api/planning/insights?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const today = new Date();
  const rawDateFrom = req.nextUrl.searchParams.get("dateFrom");
  const rawDateTo = req.nextUrl.searchParams.get("dateTo");

  // Omitted or empty params mean overall (all-time) mode
  const isOverall = !rawDateFrom && !rawDateTo;

  const defaultFrom = new Date(today.getTime() - 29 * DAY);
  const start = isOverall ? new Date(0) : safeDate(rawDateFrom, defaultFrom);
  const endDate = isOverall ? today : safeDate(rawDateTo, today);
  const end = new Date(endDate.getTime() + DAY);

  if (!isOverall && start >= end) {
    return NextResponse.json({ message: "Start date must be before end date" }, { status: 400 });
  }

  const ownerScope = { ...ownedByUserOrAdmin(session), ...notDeleted };
  const uploadedScope = { ...uploadedByUserOrAdmin(session), ...notDeleted };
  const demandScope = { ...senderOwnedByUserOrAdmin(session), ...notDeleted };

  const reportWhere = isOverall
    ? uploadedScope
    : { ...uploadedScope, reportDate: { gte: start, lt: end } };
  const financeWhere = isOverall
    ? ownerScope
    : { ...ownerScope, entryDate: { gte: start, lt: end } };
  const expenseWhere = isOverall
    ? ownerScope
    : { ...ownerScope, expenseDate: { gte: start, lt: end } };
  const marketingWhere = isOverall
    ? ownerScope
    : { ...ownerScope, metricDate: { gte: start, lt: end } };
  const demandWhere = isOverall
    ? demandScope
    : { ...demandScope, createdAt: { gte: start, lt: end } };
  const dealWhere = isOverall
    ? ownerScope
    : { ...ownerScope, createdAt: { gte: start, lt: end } };
  const pharmacySalesWhere = isOverall
    ? ownerScope
    : { ...ownerScope, saleDate: { gte: start, lt: end } };
  const pharmacyPurchasesWhere = isOverall
    ? ownerScope
    : { ...ownerScope, invoiceDate: { gte: start, lt: end } };
  const pharmacyArWhere = { ...ownerScope, paymentStatus: { not: "paid" } };
  const pharmacyApWhere = { ...ownerScope, status: { not: "paid" } };
  const nearExpiry = new Date(today.getTime() + 90 * DAY);

  const [reports, financeEntries, expenses, marketingMetrics, demands, deals, lowStockProducts, pharmacySales, pharmacyPurchases, pharmacyAr, pharmacyAp, nearExpiryLots] =
    await Promise.all([
      prisma.businessReport.findMany({
        where: reportWhere,
        select: {
          reportDate: true,
          marketingBudget: true,
          totalSalesAmount: true,
          totalDemandCount: true,
          closedDeals: true,
          pendingDeals: true,
        },
      }),
      prisma.financeEntry.findMany({
        where: financeWhere,
        select: { entryDate: true, cashType: true, accountingType: true, amount: true, status: true, dueDate: true },
      }),
      prisma.expense.findMany({
        where: expenseWhere,
        select: { expenseDate: true, amount: true, category: true },
      }),
      prisma.marketingMetric.findMany({
        where: marketingWhere,
        select: { metricDate: true, spend: true },
      }),
      prisma.demandRecord.findMany({
        where: demandWhere,
        select: { createdAt: true, status: true, serviceAmount: true, serviceQty: true, priority: true },
      }),
      prisma.deal.findMany({
        where: dealWhere,
        select: {
          createdAt: true,
          stage: true,
          quotedAmount: true,
          lastContactAt: true,
          items: { select: { quantity: true, unitPrice: true } },
        },
      }),
      prisma.product.findMany({
        where: ownerScope,
        select: { name: true, stockQty: true, lowStockThreshold: true },
      }),
      prisma.salesLine.aggregate({ where: pharmacySalesWhere, _sum: { amount: true }, _count: true }),
      prisma.purchaseInvoice.aggregate({ where: pharmacyPurchasesWhere, _sum: { netAmount: true, amount: true }, _count: true }),
      prisma.receivable.aggregate({ where: pharmacyArWhere, _sum: { netAmount: true, amount: true }, _count: true }),
      prisma.purchaseInvoice.aggregate({ where: pharmacyApWhere, _sum: { netAmount: true, amount: true }, _count: true }),
      prisma.expiryLot.count({ where: { ...ownerScope, expDate: { lte: nearExpiry }, balance: { gt: 0 } } }),
    ]);

  // Determine periodDays
  let periodDays = 30;
  if (!isOverall) {
    periodDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / DAY));
  } else {
    // For overall, calculate days from earliest record to today
    const dates: number[] = [];
    reports.forEach((r) => r.reportDate && dates.push(new Date(r.reportDate).getTime()));
    financeEntries.forEach((f) => f.entryDate && dates.push(new Date(f.entryDate).getTime()));
    expenses.forEach((e) => e.expenseDate && dates.push(new Date(e.expenseDate).getTime()));
    demands.forEach((d) => d.createdAt && dates.push(new Date(d.createdAt).getTime()));
    deals.forEach((d) => d.createdAt && dates.push(new Date(d.createdAt).getTime()));
    if (dates.length > 0) {
      const earliest = Math.min(...dates);
      const diff = Math.ceil((today.getTime() - earliest) / DAY);
      periodDays = Math.max(30, diff);
    }
  }

  const isClosedDemand = (status: string) => ["closed", "completed"].includes(status);
  const isOpenDeal = (stage: string) => OPEN_DEAL_STAGES.includes(stage);

  const reportRevenue = reports.reduce((sum, report) => sum + number(report.totalSalesAmount), 0);
  const closedDemandRevenue = demands
    .filter((record) => isClosedDemand(record.status))
    .reduce((sum, record) => sum + number(record.serviceAmount) * number(record.serviceQty ?? 1), 0);
  const wonDealRevenue = deals
    .filter((deal) => deal.stage === "WON")
    .reduce((sum, deal) => sum + dealAmount(deal), 0);
  const pharmacySalesRevenue = number(pharmacySales._sum.amount);
  const revenue = reportRevenue + closedDemandRevenue + wonDealRevenue + pharmacySalesRevenue;

  const reportMarketingSpend = reports.reduce((sum, report) => sum + number(report.marketingBudget), 0);
  const metricsMarketingSpend = marketingMetrics.reduce((sum, metric) => sum + number(metric.spend), 0);
  const marketingSpend = reportMarketingSpend + metricsMarketingSpend;
  const ledgerOperatingExpense = financeEntries
    .filter((entry) => OPERATING_ACCOUNTING_TYPES.includes(entry.accountingType))
    .reduce((sum, entry) => sum + number(entry.amount), 0);
  const expenseTableTotal = expenses.reduce((sum, entry) => sum + number(entry.amount), 0);
  const operatingExpense = ledgerOperatingExpense + expenseTableTotal;
  const pharmacyPurchasesTotal = number(pharmacyPurchases._sum.netAmount) || number(pharmacyPurchases._sum.amount);
  const expensesTotal = marketingSpend + operatingExpense + pharmacyPurchasesTotal;

  const demandCount = Math.max(
    demands.length,
    reports.reduce((sum, report) => sum + number(report.totalDemandCount), 0),
  );
  const openDemands = demands.filter((record) => !isClosedDemand(record.status));
  const openDeals = deals.filter((deal) => isOpenDeal(String(deal.stage)));
  const pendingDeals =
    reports.reduce((sum, report) => sum + number(report.pendingDeals), 0) +
    openDemands.length +
    openDeals.length;
  const staleCutoff = new Date(today.getTime() - STALE_DEAL_DAYS * DAY);
  const staleDeals = openDeals.filter((deal) => {
    const lastTouch = deal.lastContactAt ?? deal.createdAt;
    return lastTouch && new Date(lastTouch) < staleCutoff;
  }).length;
  const highPriorityDemands = openDemands.filter((record) => record.priority === "high").length;
  const highPriorityLeads = highPriorityDemands + staleDeals;

  const receivables = financeEntries
    .filter((entry) => entry.accountingType === "receivable" && !["paid", "settled"].includes(entry.status))
    .reduce((sum, entry) => sum + number(entry.amount), 0) + (number(pharmacyAr._sum.netAmount) || number(pharmacyAr._sum.amount));
  const overdueDebt = financeEntries
    .filter(
      (entry) =>
        entry.accountingType === "debt" &&
        (entry.status === "overdue" || (entry.dueDate && entry.dueDate < today && entry.status !== "settled")),
    )
    .reduce((sum, entry) => sum + number(entry.amount), 0) + (number(pharmacyAp._sum.netAmount) || number(pharmacyAp._sum.amount));
  const lowStockList = lowStockProducts.filter(
    (product) => product.stockQty <= product.lowStockThreshold,
  );
  const lowStockCount = lowStockList.length + nearExpiryLots;
  const lowStockTop = [...lowStockList].sort((a, b) => a.stockQty - b.stockQty)[0]?.name ?? null;

  const projectedRevenue30 = Math.round((revenue / periodDays) * 30);
  const projectedExpenses30 = Math.round((expensesTotal / periodDays) * 30);
  const baseProfit30 = projectedRevenue30 - projectedExpenses30;

  const snapshot = {
    periodDays,
    revenue,
    expenses: expensesTotal,
    profit: revenue - expensesTotal,
    margin: revenue > 0 ? Math.round(((revenue - expensesTotal) / revenue) * 100) : 0,
    demandCount,
    pendingDeals,
    highPriorityLeads,
    receivables,
    overdueDebt,
    upcomingExpiries: lowStockCount,
    lowStockCount,
    lowStockTop,
    pharmacy: { sales: pharmacySalesRevenue, purchases: pharmacyPurchasesTotal, arOpen: pharmacyAr._count, apOpen: pharmacyAp._count, nearExpiryLots },
    maintenanceProjects: 0,
    projectedRevenue30,
    projectedExpenses30,
    projectedProfit30: baseProfit30,
  };

  const priorities: Priority[] = [];
  const hasData =
    reports.length > 0 ||
    financeEntries.length > 0 ||
    expenses.length > 0 ||
    marketingMetrics.length > 0 ||
    demands.length > 0 ||
    deals.length > 0 || pharmacySales._count > 0 || pharmacyPurchases._count > 0 || pharmacyAr._count > 0 || pharmacyAp._count > 0 || nearExpiryLots > 0;
  if (hasData && receivables > 0)
    priorities.push({
      title: "Receivable များ ကောက်ခံရန်",
      impact: "high",
      rationale: `${receivables.toLocaleString()} MMK Receivable များ မကောက်ခံရသေးပါ။ Cash Flow ကို ထိခိုက်စေနိုင်သည်။`,
      action: "Receivable များ စစ်ဆေးရန်",
      actionHref: pharmacyAr._count > 0 ? "/pharmacy/ar" : "/finance",
    });
  if (lowStockCount > 0)
    priorities.push({
      title: "Stock ပြတ်လပ်မှုများ စီမံရန်",
      impact: "high",
      rationale: `Stock အနိမ့်ဆုံး သတ်မှတ်ချက်အောက် ရောက်နေသော Product ${lowStockCount} ခု ရှိသည်${lowStockTop ? ` (${lowStockTop} အပါအဝင်)` : ""}။ ရောင်းအား ရပ်တန့်မသွားစေရန် အမြန် ဖြည့်တင်းပါ။`,
      action: "Inventory စစ်ဆေးရန်",
      actionHref: nearExpiryLots > 0 ? "/pharmacy/inventory" : "/inventory",
    });
  if (pendingDeals > 0 || highPriorityLeads > 0)
    priorities.push({
      title: "Active Pipeline ကို ပိတ်သိမ်းရန်",
      impact: pendingDeals > 8 ? "high" : "medium",
      rationale: `High-Priority Lead ${highPriorityLeads} ခုအပါအဝင် Open Deal ${pendingDeals} ခုအတွက် နောက်တစ်ဆင့် လုပ်ဆောင်ချက် သတ်မှတ်ရန်လိုသည်။`,
      action: "Sales Pipeline ဖွင့်ရန်",
      actionHref: "/sales",
    });
  if (snapshot.margin < 20 || expensesTotal > revenue)
    priorities.push({
      title: "Profit Margin တိုးတက်စေရန်",
      impact: "high",
      rationale: `လက်ရှိကာလ Profit Margin သည် ${snapshot.margin}% ဖြစ်သည်။ Marketing Budget တိုးမီ Expense များကို စစ်ဆေးပါ။`,
      action: "Expense များ စစ်ဆေးရန်",
      actionHref: "/finance",
    });
  if (hasData && priorities.length === 0)
    priorities.push({
      title: "ကောင်းမွန်သော လုပ်ငန်းလည်ပတ်မှုကို ဆက်လုပ်ရန်",
      impact: "medium",
      rationale: "ရွေးချယ်ထားသောကာလတွင် Cash Flow သို့မဟုတ် Stock အရေးပေါ်အန္တရာယ် မတွေ့ရပါ။",
      action: "Sales Performance စစ်ဆေးရန်",
      actionHref: "/sales",
    });

  const fallback = {
    executiveSummary: `ရွေးချယ်ထားသောကာလ ဝင်ငွေသည် ${revenue.toLocaleString()} MMK နှင့် Profit Margin ${snapshot.margin}% ဖြစ်သည်။ လက်ရှိလုပ်ငန်းနှုန်းအတိုင်း ဆက်သွားလျှင် လာမည့် ၃၀ ရက်တွင် အမြတ် ${baseProfit30.toLocaleString()} MMK ရနိုင်မည်ဟု ခန့်မှန်းထားသည်။`,
    futureOutlook:
      baseProfit30 >= 0
        ? "အခြေခံခန့်မှန်းချက်သည် ကောင်းမွန်သော်လည်း Receivable ကောက်ခံခြင်းနှင့် Active Deal များ ပိတ်သိမ်းခြင်းက တိုးတက်မှုကို ဆုံးဖြတ်မည်ဖြစ်သည်။"
        : "လက်ရှိလုပ်ငန်းနှုန်းအရ အရှုံးဖြစ်နိုင်သည်။ Marketing Budget မတိုးမီ Cash Collection၊ Conversion နှင့် Expense Control ကို ဦးစားပေးပါ။",
    priorities: hasData ? priorities.slice(0, 3) : [],
    plan: hasData
      ? [
          {
            horizon: "Next 30 days" as const,
            goal: "Cash Flow နှင့် Sales Pipeline တည်ငြိမ်စေရန်",
            actions: [
              "Pending Deal တိုင်းအတွက် နောက်တစ်ကြိမ် Follow-up ရက် သတ်မှတ်ပါ။",
              "ကျန်ရှိနေသော Receivable များကို ကောက်ခံရန် သို့မဟုတ် ရက်ချိန်းသတ်မှတ်ပါ။",
              "Stock ပြတ်လပ်နေသော Product များအတွက် ဖြည့်တင်းမည့်တာဝန်ရှိသူကို အတည်ပြုပါ။",
            ],
          },
          {
            horizon: "Next 60 days" as const,
            goal: "ထပ်တလဲလဲ အသုံးချနိုင်သော Conversion တိုးတက်စေရန်",
            actions: [
              "Marketing Channel များကို Closed Revenue နှင့် နှိုင်းယှဉ်ပါ။",
              "High-Priority Lead များအတွက် Follow-up Playbook ကို စံသတ်မှတ်ပါ။",
              "Expense များကို Revenue နှင့် နှိုင်းယှဉ်စစ်ဆေးပါ။",
            ],
          },
          {
            horizon: "Next 90 days" as const,
            goal: "ထိန်းချုပ်ထားသော တိုးတက်မှု စီမံရန်",
            actions: [
              "လက်တွေ့ကျသော Quarterly Revenue နှင့် Margin Target သတ်မှတ်ပါ။",
              "Conversion သက်သေပြပြီးသော Channel များတွင်သာ Budget ထည့်ပါ။",
              "ရောင်းအားကောင်းသော Product များအတွက် Safety Stock သတ်မှတ်ပါ။",
            ],
          },
        ]
      : [],
  };

  // Planning is deliberately calculated from the approved operational data.
  // It does not call an external AI service.
  return NextResponse.json({
    snapshot,
    scenarios: hasData ? buildScenarios(snapshot) : [],
    ...fallback,
    source: "local",
    hasData,
  });
}
