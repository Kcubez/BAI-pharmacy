import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { senderOwnedByUserOrAdmin } from "@/lib/tenant-scope";
import { NextRequest, NextResponse } from "next/server";

// DELETE /api/messages/:id — delete a message and all its linked data
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Find the message with its linked counts so we can report what was deleted
    const message = await prisma.telegramMessage.findFirst({
      where: { id, ...senderOwnedByUserOrAdmin(session) },
      select: {
        senderId: true,
        _count: {
          select: {
            demandRecords: true,
            pendingDemandImports: true,
            businessReports: true,
          },
        },
      },
    });

    if (!message) {
      return NextResponse.json({ message: "Message not found" }, { status: 404 });
    }

    // Delete QA documents that originated from this message's file
    // (QA docs link by fileName — match on sourceFileName from demand records)
    const linkedDemandRecords = await prisma.demandRecord.findMany({
      where: { messageId: id },
      select: { sourceFileName: true },
    });
    const fileNames = [...new Set(
      linkedDemandRecords
        .map(r => r.sourceFileName)
        .filter(Boolean) as string[]
    )];
    if (fileNames.length > 0) {
      await prisma.qADocument.deleteMany({
        where: { fileName: { in: fileNames }, userId: session.user.id },
      });
    }

    // Delete the message — DemandRecord and PendingDemandImport cascade automatically.
    // Scoped delete so a concurrent/stale pre-check can't remove another tenant's row.
    const deleted = await prisma.telegramMessage.deleteMany({
      where: { id, ...senderOwnedByUserOrAdmin(session) },
    });
    if (!deleted.count) {
      return NextResponse.json({ message: "Message not found" }, { status: 404 });
    }

    // Decrement the sender's messageCount (sender is owned via the scoped message above)
    await prisma.telegramSender.updateMany({
      where: { id: message.senderId, userId: session.user.id },
      data: { messageCount: { decrement: 1 } },
    });

    return NextResponse.json({
      success: true,
      deleted: {
        demandRecords: message._count.demandRecords,
        pendingImports: message._count.pendingDemandImports,
        businessReports: message._count.businessReports,
        qaDocuments: fileNames.length,
      },
    });
  } catch (error) {
    console.error("Delete message error:", error);
    return NextResponse.json({ message: "Failed to delete message" }, { status: 500 });
  }
}
