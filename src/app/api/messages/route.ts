import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { senderOwnedByUserOrAdmin } from "@/lib/tenant-scope";
import { NextRequest, NextResponse } from "next/server";

// Helper to serialize BigInt fields for JSON response
function serializeMessage(msg: Record<string, unknown>) {
  const result = { ...msg };
  if (typeof result.chatId === "bigint") {
    result.chatId = result.chatId.toString();
  }
  if (result.sender && typeof result.sender === "object") {
    const sender = { ...(result.sender as Record<string, unknown>) };
    if (typeof sender.telegramUserId === "bigint") {
      sender.telegramUserId = sender.telegramUserId.toString();
    }
    result.sender = sender;
  }
  return result;
}

// GET /api/messages — list messages with pagination, search, and sender filter
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
  const search = searchParams.get("search") || "";
  const senderId = searchParams.get("senderId") || "";

  // Build where clause
  const where: Record<string, unknown> = senderOwnedByUserOrAdmin(session);

  if (senderId) {
    where.senderId = senderId;
  }

  if (search) {
    where.OR = [
      { text: { contains: search, mode: "insensitive" } },
      { sender: { displayName: { contains: search, mode: "insensitive" } } },
      { sender: { username: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [messages, total] = await Promise.all([
    prisma.telegramMessage.findMany({
      where,
      include: { sender: true },
      orderBy: { receivedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.telegramMessage.count({ where }),
  ]);

  return NextResponse.json({
    messages: messages.map(serializeMessage),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}
