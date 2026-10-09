import { auth } from "@/lib/auth";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { notDeleted } from "@/lib/soft-delete";
import { customerOwnedByUserOrAdmin, senderOwnedByUserOrAdmin } from "@/lib/tenant-scope";
import { NextRequest, NextResponse } from "next/server";

// GET /api/customer-followups/stats — customer followup specific stats
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
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  const customerDateScope: Prisma.CustomerWhereInput = {};
  if (dateFrom || dateTo) {
    customerDateScope.createdAt = {};
    if (dateFrom) customerDateScope.createdAt.gte = new Date(dateFrom);
    if (dateTo) customerDateScope.createdAt.lte = new Date(dateTo + "T23:59:59.999Z");
  }

  const [totalFollowUps, todayFollowUps, pendingFollowUps, dueToday, totalCustomers] = await Promise.all([
    prisma.demandRecord.count({
      where: {
        followUpDate: { not: null },
        ...rangeWhere,
      },
    }),
    prisma.demandRecord.count({
      where: {
        followUpDate: { not: null },
        createdAt: { gte: startOfToday },
        ...senderOwnedByUserOrAdmin(session),
        ...notDeleted,
      },
    }),
    prisma.demandRecord.count({
      where: {
        followUpDate: { not: null },
        status: { notIn: ["closed", "completed"] },
        ...rangeWhere,
      },
    }),
    prisma.demandRecord.count({
      where: {
        followUpDate: { gte: startOfToday, lt: endOfToday },
        ...senderOwnedByUserOrAdmin(session),
        ...notDeleted,
      },
    }),
    prisma.customer.count({
      where: {
        ...customerOwnedByUserOrAdmin(session),
        ...notDeleted,
        ...customerDateScope,
      },
    }),
  ]);

  return NextResponse.json({
    totalFollowUps,
    todayFollowUps,
    pendingFollowUps,
    dueToday,
    totalCustomers,
  });
}
