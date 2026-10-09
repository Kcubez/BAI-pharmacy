import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notDeleted } from "@/lib/soft-delete";
import {
  customerOwnedByUserOrAdmin,
  ownedByUserOrAdmin,
  senderOwnedByUserOrAdmin,
  uploadedByUserOrAdmin,
} from "@/lib/tenant-scope";
import { NextRequest, NextResponse } from "next/server";

// GET /api/dashboard/stats — dashboard overview stats
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const nowMyanmar = new Date(Date.now() + 6.5 * 60 * 60 * 1000);
  const { searchParams } = req.nextUrl;
  const period = searchParams.get("period") === "year" ? "year" : "month";
  const monthParam = Number(searchParams.get("month") || nowMyanmar.getUTCMonth() + 1);
  const yearParam = Number(searchParams.get("year") || nowMyanmar.getUTCFullYear());
  const month = Math.min(12, Math.max(1, Number.isFinite(monthParam) ? monthParam : nowMyanmar.getUTCMonth() + 1));
  const year = Number.isFinite(yearParam) ? yearParam : nowMyanmar.getUTCFullYear();
  const periodStart = period === "year" ? new Date(Date.UTC(year, 0, 1)) : new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = period === "year" ? new Date(Date.UTC(year + 1, 0, 1)) : new Date(Date.UTC(year, month, 1));
  const startOfToday = new Date(Date.UTC(nowMyanmar.getUTCFullYear(), nowMyanmar.getUTCMonth(), nowMyanmar.getUTCDate()));
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const senderScope = senderOwnedByUserOrAdmin(session);
  const ownerScope = ownedByUserOrAdmin(session);
  const customerScope = customerOwnedByUserOrAdmin(session);
  const uploadedScope = uploadedByUserOrAdmin(session);
  const demandScope = { ...senderScope, ...notDeleted };
  const activeCustomerScope = { ...customerScope, ...notDeleted };
  const activeUploadedScope = { ...uploadedScope, ...notDeleted };

  const [
    totalMessages,
    todayMessages,
    totalSenders,
    weekMessages,
    totalCustomers,
    newCustomers,
    botSettings,
    todayDemandRecords,
    pendingDemandRecords,
  ] = await Promise.all([
    prisma.telegramMessage.count({ where: senderScope }),
    prisma.telegramMessage.count({ where: { receivedAt: { gte: startOfToday }, ...senderScope } }),
    prisma.telegramSender.count({ where: ownerScope }),
    prisma.telegramMessage.count({ where: { receivedAt: { gte: sevenDaysAgo }, ...senderScope } }),
    prisma.customer.count({ where: activeCustomerScope }),
    prisma.customer.count({ where: { createdAt: { gte: periodStart, lt: periodEnd }, ...activeCustomerScope } }),
    prisma.botSettings.findFirst({ where: { isActive: true, ...ownerScope } }),
    prisma.demandRecord.count({ where: { createdAt: { gte: startOfToday }, ...demandScope } }),
    prisma.demandRecord.count({ where: { status: { notIn: ['closed', 'completed'] }, ...demandScope } }),
  ]);

  // Messages List
  const messages = await prisma.telegramMessage.findMany({
    where: senderScope,
    orderBy: { receivedAt: 'desc' },
    take: 5,
    include: { sender: true },
  });
  const recentMessages = messages.map(m => ({
    id: m.id,
    text: m.text.length > 80 ? m.text.slice(0, 80) + '...' : m.text,
    senderName: m.sender.displayName,
    senderUsername: m.sender.username,
    receivedAt: m.receivedAt.toISOString(),
  }));

  // Admin stats
  const isAdmin = session.user.role === 'admin';
  let adminStats = null;
  if (isAdmin) {
    const [totalUsers, activeSessions] = await Promise.all([
      prisma.user.count(),
      prisma.session.count({ where: { expiresAt: { gt: now } } }),
    ]);
    adminStats = { totalUsers, activeSessions };
  }

  // Pipeline Data
  const pipelineCounts = await prisma.demandRecord.groupBy({
    by: ['status'],
    _count: { _all: true },
    where: { createdAt: { gte: periodStart, lt: periodEnd }, ...demandScope },
  });
  const pipeline = {
    new: 0,
    contacted: 0,
    quoted: 0,
    pending: 0,
    closed: 0,
  };
  for (const row of pipelineCounts) {
    const status = row.status as keyof typeof pipeline;
    if (status in pipeline) {
      pipeline[status] = row._count._all;
    }
  }

  // Quantity and Amount Aggregations
  const [qtyAgg, amountAgg, businessAgg, highPriorityLeads, missingPhoneLeads, overdueFollowUps, demandCountPeriod] = await Promise.all([
    prisma.demandRecord.aggregate({
      _sum: { serviceQty: true },
      where: { 
        createdAt: { gte: periodStart, lt: periodEnd },
        ...demandScope,
        status: { in: ['closed', 'completed'] }
      },
    }),
    prisma.demandRecord.aggregate({
      _sum: { serviceAmount: true },
      where: { 
        createdAt: { gte: periodStart, lt: periodEnd },
        ...demandScope,
        status: { in: ['closed', 'completed'] }
      },
    }),
    prisma.businessReport.aggregate({
      _sum: { 
        marketingBudget: true, 
        totalSalesAmount: true,
        callsMade: true,
        appointmentsMade: true,
        totalDemandCount: true,
        closedDeals: true
      },
      where: { 
        reportDate: { gte: periodStart, lt: periodEnd },
        ...activeUploadedScope,
        reporterName: { not: "Daily Bot Ingestion" }
      },
    }),
    prisma.demandRecord.count({
      where: {
        priority: "high",
        ...demandScope,
        status: { notIn: ["closed", "completed"] },
        createdAt: { gte: periodStart, lt: periodEnd },
      },
    }),
    prisma.demandRecord.count({
      where: {
        missingFields: { has: "phone" },
        ...demandScope,
        status: { notIn: ["closed", "completed"] },
        createdAt: { gte: periodStart, lt: periodEnd },
      },
    }),
    prisma.demandRecord.count({
      where: {
        followUpStatus: "overdue",
        ...demandScope,
        status: { notIn: ["closed", "completed"] },
        createdAt: { gte: periodStart, lt: periodEnd },
      },
    }),
    prisma.demandRecord.count({
      where: { createdAt: { gte: periodStart, lt: periodEnd }, ...demandScope },
    }),
  ]);
  const totalQuantitySold = qtyAgg._sum.serviceQty || 0;
  const demandRevenue = amountAgg._sum.serviceAmount || 0;
  const reportRevenue = businessAgg._sum.totalSalesAmount || 0;
  const totalAmountSold = reportRevenue + demandRevenue;
  const totalCost = businessAgg._sum.marketingBudget || 0;
  const profitLoss = totalAmountSold - totalCost;
  const roi = totalCost > 0 ? (profitLoss / totalCost) * 100 : null;

  // Retrieve targets set for this period
  const periodTarget = await prisma.periodTarget.findFirst({
    where: {
      period,
      year,
      month: period === "year" ? 0 : month,
      ...ownerScope,
    },
  });

  const targetSalesAmount = periodTarget?.targetSalesAmount ?? null;
  const targetExpenseAmount = periodTarget?.targetExpenseAmount ?? null;
  const targetDemandCount = periodTarget?.targetDemandCount ?? null;
  const targetAppointments = periodTarget?.targetAppointments ?? null;
  const targetNewCustomers = periodTarget?.targetNewCustomers ?? null;

  // Pacing calculations
  const msPerDay = 24 * 60 * 60 * 1000;
  const totalDaysInPeriod = Math.round((periodEnd.getTime() - periodStart.getTime()) / msPerDay);

  let elapsedRatio = 1.0;
  let elapsedDays = totalDaysInPeriod;
  if (now >= periodStart && now < periodEnd) {
    elapsedDays = Math.floor((startOfToday.getTime() - periodStart.getTime()) / msPerDay) + 1;
    elapsedRatio = elapsedDays / totalDaysInPeriod;
  } else if (periodStart > now) {
    elapsedRatio = 0.0;
    elapsedDays = 0;
  }

  const actualDemandCount = Math.max(demandCountPeriod, businessAgg._sum.totalDemandCount || 0);
  const actualAppointments = businessAgg._sum.appointmentsMade || 0;
  const closedDeals = businessAgg._sum.closedDeals || 0;
  const appointmentConversionRate = actualDemandCount > 0 ? (actualAppointments / actualDemandCount) * 100 : null;
  const closeConversionRate = actualAppointments > 0 ? (closedDeals / actualAppointments) * 100 : null;

  const expectedRevenue = targetSalesAmount !== null ? targetSalesAmount * elapsedRatio : null;
  const expectedExpense = targetExpenseAmount !== null ? targetExpenseAmount * elapsedRatio : null;
  const expectedDemandCount = targetDemandCount !== null ? targetDemandCount * elapsedRatio : null;
  const expectedAppointments = targetAppointments !== null ? targetAppointments * elapsedRatio : null;
  const expectedNewCustomers = targetNewCustomers !== null ? targetNewCustomers * elapsedRatio : null;

  const alerts: {
    type: 'revenue_target' | 'demand_target' | 'appointments_target' | 'expense_target' | 'customers_target';
    status: 'warning' | 'info';
    message: string;
    actual: number;
    expected: number;
    target: number;
  }[] = [];

  if (targetSalesAmount && totalAmountSold < expectedRevenue!) {
    alerts.push({
      type: 'revenue_target',
      status: 'warning',
      message: `Sales Revenue is behind pacing target (${elapsedDays} of ${totalDaysInPeriod} days elapsed).`,
      actual: totalAmountSold,
      expected: expectedRevenue!,
      target: targetSalesAmount,
    });
  }

  if (targetExpenseAmount && totalCost > expectedExpense!) {
    alerts.push({
      type: 'expense_target',
      status: 'warning',
      message: `Marketing Expense is ahead of budget limit (${elapsedDays} of ${totalDaysInPeriod} days elapsed).`,
      actual: totalCost,
      expected: expectedExpense!,
      target: targetExpenseAmount,
    });
  }

  if (targetDemandCount && actualDemandCount < expectedDemandCount!) {
    alerts.push({
      type: 'demand_target',
      status: 'warning',
      message: `Demand messages (leads) count is behind pacing target (${elapsedDays} of ${totalDaysInPeriod} days elapsed).`,
      actual: actualDemandCount,
      expected: expectedDemandCount!,
      target: targetDemandCount,
    });
  }

  if (targetAppointments && actualAppointments < expectedAppointments!) {
    alerts.push({
      type: 'appointments_target',
      status: 'warning',
      message: `Appointments count is behind pacing target (${elapsedDays} of ${totalDaysInPeriod} days elapsed).`,
      actual: actualAppointments,
      expected: expectedAppointments!,
      target: targetAppointments,
    });
  }

  if (targetNewCustomers && newCustomers < expectedNewCustomers!) {
    alerts.push({
      type: 'customers_target',
      status: 'warning',
      message: `New customers count is behind pacing target (${elapsedDays} of ${totalDaysInPeriod} days elapsed).`,
      actual: newCustomers,
      expected: expectedNewCustomers!,
      target: targetNewCustomers,
    });
  }


  // Demand Activity (period-aware)
  const formatLocalDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dateVal = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dateVal}`;
  };

  const demandActivityRows = await prisma.demandRecord.groupBy({
    by: ['createdAt'],
    where: { createdAt: { gte: periodStart, lt: periodEnd }, ...demandScope },
    _count: { _all: true },
  });

  const weeklyActivity: { date: string; count: number }[] = [];

  if (period === 'year') {
    // 12 monthly buckets
    const countsByMonth = new Map<string, number>();
    for (const row of demandActivityRows) {
      const key = `${row.createdAt.getFullYear()}-${String(row.createdAt.getMonth() + 1).padStart(2, '0')}`;
      countsByMonth.set(key, (countsByMonth.get(key) ?? 0) + row._count._all);
    }
    for (let i = 0; i < 12; i++) {
      const d = new Date(year, i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en', { month: 'short' });
      weeklyActivity.push({ date: label, count: countsByMonth.get(key) ?? 0 });
    }
  } else {
    // Daily buckets for the selected month
    const countsByDay = new Map<string, number>();
    for (const row of demandActivityRows) {
      const key = formatLocalDate(row.createdAt);
      countsByDay.set(key, (countsByDay.get(key) ?? 0) + row._count._all);
    }
    for (let i = 0; i < totalDaysInPeriod; i++) {
      const d = new Date(year, month - 1, i + 1);
      const key = formatLocalDate(d);
      weeklyActivity.push({ date: key, count: countsByDay.get(key) ?? 0 });
    }
  }

  // Financial Trend
  const trendBucketCount = period === "year" ? 12 : totalDaysInPeriod;
  const trendBuckets = Array.from({ length: trendBucketCount }).map((_, index) => {
    const date = period === "year" ? new Date(year, index, 1) : new Date(year, month - 1, index + 1);
    const key = period === "year"
      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
      : formatLocalDate(date);
    const label = period === "year"
      ? date.toLocaleDateString("en", { month: "short" })
      : String(index + 1);
    return {
      key,
      label,
      revenueFromDemand: 0,
      revenueFromReports: 0,
      expense: 0,
    };
  });
  const trendByKey = new Map(trendBuckets.map((bucket) => [bucket.key, bucket]));
  const trendKey = (date: Date) => period === "year"
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
    : formatLocalDate(date);

  const [trendDemandRows, trendBusinessRows] = await Promise.all([
    prisma.demandRecord.findMany({
      where: { createdAt: { gte: periodStart, lt: periodEnd }, ...demandScope },
      select: { createdAt: true, serviceAmount: true },
    }),
    prisma.businessReport.findMany({
      where: { reportDate: { gte: periodStart, lt: periodEnd }, ...activeUploadedScope },
      select: { reportDate: true, totalSalesAmount: true, marketingBudget: true },
    }),
  ]);

  for (const row of trendDemandRows) {
    const bucket = trendByKey.get(trendKey(row.createdAt));
    if (bucket) bucket.revenueFromDemand += row.serviceAmount || 0;
  }
  for (const row of trendBusinessRows) {
    const bucket = trendByKey.get(trendKey(row.reportDate));
    if (bucket) {
      bucket.revenueFromReports += row.totalSalesAmount || 0;
      bucket.expense += row.marketingBudget || 0;
    }
  }
  const financialTrend = trendBuckets.map((bucket) => {
    const revenue = Math.max(bucket.revenueFromDemand, bucket.revenueFromReports);
    return {
      label: bucket.label,
      revenue,
      expense: bucket.expense,
      profit: revenue - bucket.expense,
    };
  });

  // Top Services
  const serviceGroups = await prisma.demandRecord.groupBy({
    by: ['serviceName'],
    where: {
      serviceName: { not: null },
      createdAt: { gte: periodStart, lt: periodEnd },
      ...demandScope,
    },
    _count: { _all: true },
    _sum: { serviceQty: true, serviceAmount: true },
  });
  const topProducts = serviceGroups.map(g => ({
    product: g.serviceName || 'Unknown',
    count: g._count._all,
    totalQty: g._sum.serviceQty || 0,
    revenue: g._sum.serviceAmount || 0,
  })).sort((a, b) => b.revenue - a.revenue || b.count - a.count).slice(0, 5);

  // Due Today Follow-ups
  const dueTodayRecordsRaw = await prisma.demandRecord.findMany({
    where: {
      followUpDate: {
        gte: startOfToday,
        lt: startOfTomorrow,
      },
      ...demandScope,
    },
    include: {
      sender: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  const dueTodayRecords = dueTodayRecordsRaw.map(r => ({
    id: r.id,
    customerName: r.customerName,
    product: r.serviceName,
    quantity: r.serviceQty,
    status: r.status,
    note: r.note,
    senderName: r.sender?.displayName || "System / Uploaded",
    followUpDate: r.followUpDate ? r.followUpDate.toISOString() : null,
  }));
  const dueTodayFollowUps = dueTodayRecords.length;

  // Upcoming Follow-ups (from today onwards)
  const upcomingRecordsRaw = await prisma.demandRecord.findMany({
    where: {
      followUpDate: {
        gte: startOfToday,
      },
      ...demandScope,
      status: { notIn: ['closed', 'completed'] },
    },
    include: {
      sender: true,
    },
    orderBy: { followUpDate: 'asc' },
    take: 10,
  });
  const upcomingRecords = upcomingRecordsRaw.map(r => ({
    id: r.id,
    customerName: r.customerName,
    product: r.serviceName,
    quantity: r.serviceQty,
    status: r.status,
    note: r.note,
    senderName: r.sender?.displayName || "System / Uploaded",
    followUpDate: r.followUpDate ? r.followUpDate.toISOString() : null,
  }));

  return NextResponse.json({
    totalMessages,
    todayMessages,
    totalSenders,
    weekMessages,
    todayDemandRecords,
    dueTodayFollowUps,
    pendingDemandRecords,
    totalCustomers,
    newCustomers,
    botActive: !!botSettings,
    recentMessages,
    isAdmin,
    adminStats,
    pipeline,
    totalQuantitySold,
    totalAmountSold,
    totalCost,
    profitLoss,
    roi,
    demandRevenue,
    reportRevenue,
    period,
    selectedMonth: month,
    selectedYear: year,
    highPriorityLeads,
    missingPhoneLeads,
    weeklyActivity,
    topProducts,
    financialTrend,
    salesFunnel: {
      leads: actualDemandCount,
      appointments: actualAppointments,
      closedDeals,
      appointmentConversionRate,
      closeConversionRate,
    },
    risks: {
      overdueFollowUps,
      highPriorityLeads,
      missingPhoneLeads,
      dueTodayFollowUps,
    },
    dueTodayRecords,
    upcomingRecords,
    targetDemandCount,
    targetAppointments,
    targetSalesAmount,
    targetExpenseAmount,
    targetNewCustomers,
    actualRevenue: totalAmountSold,
    actualDemandCount,
    actualAppointments,
    expectedRevenue,
    expectedExpense,
    expectedDemandCount,
    expectedAppointments,
    expectedNewCustomers,
    elapsedRatio,
    elapsedDays,
    totalDaysInPeriod,
    alerts,
  });
}
