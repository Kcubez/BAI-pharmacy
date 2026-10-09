import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notDeleted } from "@/lib/soft-delete";
import { ownedByUserOrAdmin, senderOwnedByUserOrAdmin } from "@/lib/tenant-scope";
import { NextRequest, NextResponse } from "next/server";

// GET /api/messages/stats — dashboard statistics
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [totalMessages, todayMessages, totalSenders, weekMessages, demandRecords] = await Promise.all([
    prisma.telegramMessage.count({ where: senderOwnedByUserOrAdmin(session) }),
    prisma.telegramMessage.count({
      where: { receivedAt: { gte: startOfToday }, ...senderOwnedByUserOrAdmin(session) },
    }),
    prisma.telegramSender.count({ where: ownedByUserOrAdmin(session) }),
    prisma.telegramMessage.count({
      where: { receivedAt: { gte: sevenDaysAgo }, ...senderOwnedByUserOrAdmin(session) },
    }),
    prisma.demandRecord.count({ where: { ...senderOwnedByUserOrAdmin(session), ...notDeleted } }),
  ]);

  return NextResponse.json({
    totalMessages,
    todayMessages,
    totalSenders,
    weekMessages,
    businessReports: demandRecords,
    futurePlans: 0,
  });
}
