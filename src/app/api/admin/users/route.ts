import { requireAdmin } from "@/lib/require-admin";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { createUserSchema } from "@/lib/validations";


// GET /api/admin/users — list all users
export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard.error) return guard.error;

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      banned: true,
      banReason: true,
      createdAt: true,
      updatedAt: true,
      botSettings: {
        select: {
          isActive: true,
          botToken: true,
          updatedAt: true,
        },
      },
      _count: {
        select: {
          telegramSenders: true,
          customers: true,
          businessReports: true,
          projectExpirations: true,
          websiteUpdates: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const userIds = users.map((user) => user.id);
  const senderOwner = await prisma.telegramSender.findMany({
    where: { userId: { in: userIds } },
    select: {
      userId: true,
      isAuthorized: true,
      _count: {
        select: {
          messages: true,
          demandRecords: true,
        },
      },
    },
  });

  const messageCountByUserId = new Map<string, number>();
  const demandCountByUserId = new Map<string, number>();
  const authorizedStaffByUserId = new Map<string, number>();
  for (const sender of senderOwner) {
    if (!sender.userId) continue;
    messageCountByUserId.set(sender.userId, (messageCountByUserId.get(sender.userId) || 0) + sender._count.messages);
    demandCountByUserId.set(sender.userId, (demandCountByUserId.get(sender.userId) || 0) + sender._count.demandRecords);
    if (sender.isAuthorized) {
      authorizedStaffByUserId.set(sender.userId, (authorizedStaffByUserId.get(sender.userId) || 0) + 1);
    }
  }

  return NextResponse.json({
    users: users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      banned: user.banned,
      banReason: user.banReason,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      businessOwner: {
        botConnected: Boolean(user.botSettings?.isActive && user.botSettings.botToken),
        botUpdatedAt: user.botSettings?.updatedAt ?? null,
        staffCount: user._count.telegramSenders,
        authorizedStaffCount: authorizedStaffByUserId.get(user.id) || 0,
        customerCount: user._count.customers,
        demandRecordCount: demandCountByUserId.get(user.id) || 0,
        messageCount: messageCountByUserId.get(user.id) || 0,
        projectCount: user._count.projectExpirations,
        websiteCount: user._count.websiteUpdates,
        businessReportCount: user._count.businessReports,
      },
    })),
  });
}

// POST /api/admin/users — create user
export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard.error) return guard.error;

  const body = await req.json();
  const parsed = createUserSchema.safeParse({ ...body, role: body.role ?? "user" });

  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "Invalid account details" },
      { status: 400 }
    );
  }

  const { name, email, password, role } = parsed.data;

  try {
    const result = await auth.api.createUser({
      body: { name, email, password, role },
    });

    return NextResponse.json(result.user, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create user";
    return NextResponse.json({ message }, { status: 400 });
  }
}
