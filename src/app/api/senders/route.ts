import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ownedByUserOrAdmin } from "@/lib/tenant-scope";
import { NextRequest, NextResponse } from "next/server";

// GET /api/senders — list all Telegram senders
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const senders = await prisma.telegramSender.findMany({
    where: ownedByUserOrAdmin(session),
    orderBy: { lastMessageAt: "desc" },
    include: {
      _count: { select: { messages: true } },
    },
  });

  // Serialize BigInt fields
  const serialized = senders.map((s) => ({
    ...s,
    telegramUserId: s.telegramUserId ? s.telegramUserId.toString() : null,
    messageCount: s._count.messages, // Use actual count from relation
    _count: undefined,
  }));

  return NextResponse.json({ senders: serialized });
}
