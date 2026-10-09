import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notDeleted } from "@/lib/soft-delete";
import { senderOwnedByUserOrAdmin } from "@/lib/tenant-scope";
import { NextRequest, NextResponse } from "next/server";

// GET /api/daily-report/stats — daily report specific stats
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  const scope = { ...senderOwnedByUserOrAdmin(session), ...notDeleted };

  const [totalReports, todayReports, pendingReports, dueToday] = await Promise.all([
    prisma.demandRecord.count({ where: scope }),
    prisma.demandRecord.count({
      where: {
        createdAt: { gte: startOfToday },
        ...scope,
      },
    }),
    prisma.demandRecord.count({
      where: { status: "pending", ...scope },
    }),
    prisma.demandRecord.count({
      where: {
        followUpDate: { gte: startOfToday, lt: endOfToday },
        ...scope,
      },
    }),
  ]);

  return NextResponse.json({
    totalReports,
    todayReports,
    pendingReports,
    dueToday,
  });
}
