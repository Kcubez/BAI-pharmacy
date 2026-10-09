import { auth } from "@/lib/auth";
import type { Prisma } from "@/generated/prisma/client";
import { buildBusinessInsights } from "@/lib/demand-analysis";
import { prisma } from "@/lib/prisma";
import { notDeleted } from "@/lib/soft-delete";
import { senderOwnedByUserOrAdmin } from "@/lib/tenant-scope";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const dateFrom = searchParams.get("dateFrom") || "";
  const dateTo = searchParams.get("dateTo") || "";

  const rangeWhere: Prisma.DemandRecordWhereInput = { ...senderOwnedByUserOrAdmin(session), ...notDeleted };
  if (dateFrom || dateTo) {
    rangeWhere.createdAt = {};
    if (dateFrom) rangeWhere.createdAt.gte = new Date(dateFrom);
    if (dateTo) rangeWhere.createdAt.lte = new Date(dateTo + "T23:59:59.999Z");
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const allowedServices = [
    "Website Gold Package",
    "Website Silver Package",
    "Website Diamond Package",
    "Messenger Sale Bot",
    "Telegram Sale Bot",
    "Genius AutoWriter",
    "Genius Board",
    "SOP Generator",
    "POS",
    "EMS",
    "AI for careers ebook",
    "AI for businesses ebook",
    "Prompt Packs ebook",
    "Other",
  ];

  const [
    totalRecords,
    todayRecords,
    serviceGroups,
    priorityGroups,
    analysisRecords,
    uniqueCustomerRows,
  ] = await Promise.all([
    prisma.demandRecord.count({ where: rangeWhere }),
    prisma.demandRecord.count({ where: { createdAt: { gte: startOfToday }, ...senderOwnedByUserOrAdmin(session), ...notDeleted } }),
    prisma.demandRecord.groupBy({
      by: ['serviceName'],
      where: {
        serviceName: { not: null },
        ...rangeWhere,
      },
      _count: { _all: true },
      _sum: {
        serviceQty: true,
        serviceAmount: true,
      },
    }),
    prisma.demandRecord.groupBy({
      by: ['priority'],
      where: {
        status: { notIn: ['closed', 'completed'] },
        ...rangeWhere,
      },
      _count: { _all: true },
    }),
    prisma.demandRecord.findMany({
      where: {
        status: { notIn: ['closed', 'completed'] },
        ...rangeWhere,
      },
      orderBy: [{ priority: 'asc' }, { potentialScore: 'desc' }],
      take: 200,
      select: {
        customerName: true,
        serviceName: true,
        serviceAmount: true,
        serviceQty: true,
        followUpDate: true,
        followUpStatus: true,
        status: true,
        note: true,
        priority: true,
        potentialScore: true,
        priorityReason: true,
        recommendedAction: true,
        missingFields: true,
        customer: { select: { phone: true, company: true } },
      },
    }),
    prisma.demandRecord.findMany({
      where: { customerId: { not: null }, ...rangeWhere },
      select: { customerId: true },
      distinct: ['customerId'],
    }),
  ]);

  const serviceStatsMap = new Map<string, { count: number; totalQty: number; revenue: number }>();
  for (const row of serviceGroups) {
    if (row.serviceName) {
      serviceStatsMap.set(row.serviceName, {
        count: row._count._all,
        totalQty: row._sum.serviceQty || 0,
        revenue: row._sum.serviceAmount || 0,
      });
    }
  }

  const servicesStats = allowedServices.map((service) => {
    const stats = serviceStatsMap.get(service) || { count: 0, totalQty: 0, revenue: 0 };
    return {
      serviceName: service,
      salesCount: stats.count,
      totalQty: stats.totalQty,
      revenue: stats.revenue,
    };
  });

  // Sort by revenue descending, then salesCount, and fallback to predefined order
  servicesStats.sort((a, b) => {
    if (b.revenue !== a.revenue) {
      return b.revenue - a.revenue;
    }
    if (b.salesCount !== a.salesCount) {
      return b.salesCount - a.salesCount;
    }
    return allowedServices.indexOf(a.serviceName) - allowedServices.indexOf(b.serviceName);
  });

  const priority = { high: 0, medium: 0, low: 0 };
  for (const group of priorityGroups) {
    if (group.priority in priority) {
      priority[group.priority as keyof typeof priority] = group._count._all;
    }
  }

  const insightRecords = analysisRecords.map((record) => ({
    customerName: record.customerName,
    customerPhone: record.customer?.phone ?? null,
    customerCompany: record.customer?.company ?? null,
    serviceName: record.serviceName,
    serviceAmount: record.serviceAmount,
    serviceQty: record.serviceQty,
    followUpDate: record.followUpDate,
    status: record.status,
    note: record.note,
    createdAt: null,
    priority: record.priority as "high" | "medium" | "low",
    potentialScore: record.potentialScore,
    priorityReason: record.priorityReason || "",
    recommendedAction: record.recommendedAction || "",
    missingFields: record.missingFields,
    followUpStatus: record.followUpStatus as "due" | "scheduled" | "overdue" | "not_scheduled",
  }));

  return NextResponse.json({
    totalRecords,
    todayRecords,
    services: servicesStats,
    priority,
    insights: buildBusinessInsights(insightRecords),
    uniqueCustomers: uniqueCustomerRows.length,
  });
}
