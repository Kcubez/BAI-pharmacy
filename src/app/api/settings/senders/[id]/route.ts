import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// PUT /api/settings/senders/[id] — update authorization status and allowed departments
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { isAuthorized, allowedDepartments } = body;

  // Verify that the sender belongs to this Business Owner
  const sender = await prisma.telegramSender.findFirst({
    where: {
      id,
      userId: session.user.id,
    },
  });

  if (!sender) {
    return NextResponse.json({ message: "Sender not found or access denied" }, { status: 404 });
  }

  const written = await prisma.telegramSender.updateMany({
    where: { id: sender.id, userId: session.user.id },
    data: {
      isAuthorized: typeof isAuthorized === "boolean" ? isAuthorized : undefined,
      allowedDepartments: Array.isArray(allowedDepartments) ? allowedDepartments : undefined,
    },
  });

  if (!written.count) {
    return NextResponse.json({ message: "Sender not found or access denied" }, { status: 404 });
  }

  const updated = await prisma.telegramSender.findFirst({
    where: { id: sender.id, userId: session.user.id },
  });

  if (!updated) {
    return NextResponse.json({ message: "Sender not found or access denied" }, { status: 404 });
  }

  return NextResponse.json({
    sender: {
      ...updated,
      telegramUserId: updated.telegramUserId ? updated.telegramUserId.toString() : null,
    },
  });
}

// DELETE /api/settings/senders/[id] — delete/remove a sender or pre-registered email
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify that the sender belongs to this Business Owner
  const sender = await prisma.telegramSender.findFirst({
    where: {
      id,
      userId: session.user.id,
    },
  });

  if (!sender) {
    return NextResponse.json({ message: "Sender not found or access denied" }, { status: 404 });
  }

  const deleted = await prisma.telegramSender.deleteMany({
    where: { id: sender.id, userId: session.user.id },
  });

  if (!deleted.count) {
    return NextResponse.json({ message: "Sender not found or access denied" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
