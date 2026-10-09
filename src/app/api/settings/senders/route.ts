import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// GET /api/settings/senders — list all Telegram senders for the logged-in Business Owner
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const senders = await prisma.telegramSender.findMany({
    where: { userId: session.user.id },
    orderBy: { lastMessageAt: "desc" },
    include: {
      _count: { select: { messages: true } },
    },
  });

  // Serialize BigInt fields safely
  const serialized = senders.map((s) => ({
    ...s,
    telegramUserId: s.telegramUserId ? s.telegramUserId.toString() : null,
    messageCount: s._count.messages,
    _count: undefined,
  }));

  return NextResponse.json({ senders: serialized });
}

// POST /api/settings/senders — pre-register a staff email
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { email, allowedDepartments } = await req.json();
  if (!email) {
    return NextResponse.json({ message: "Email is required" }, { status: 400 });
  }

  if (!allowedDepartments || !Array.isArray(allowedDepartments) || allowedDepartments.length === 0) {
    return NextResponse.json({ message: "Please select at least one department" }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Check if a sender with this email already exists
  const existing = await prisma.telegramSender.findFirst({
    where: { email: normalizedEmail, userId: session.user.id },
  });

  if (existing) {
    return NextResponse.json({ message: "A staff account with this email already exists" }, { status: 400 });
  }

  const newSender = await prisma.telegramSender.create({
    data: {
      userId: session.user.id,
      email: normalizedEmail,
      allowedDepartments: allowedDepartments || [],
      isAuthorized: true,
      isVerified: false,
      activeReportType: 'none',
    },
  });

  return NextResponse.json({
    ...newSender,
    telegramUserId: null,
  });
}
