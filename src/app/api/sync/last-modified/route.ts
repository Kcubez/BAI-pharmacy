import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  senderOwnedByUserOrAdmin,
  uploadedByUserOrAdmin,
} from "@/lib/tenant-scope";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const senderScope = senderOwnedByUserOrAdmin(session);
    const uploadedScope = uploadedByUserOrAdmin(session);

    // Query the latest createdAt/updatedAt timestamp across key tables in parallel
    const [msg, demand, expiry, web, report] = await Promise.all([
      prisma.telegramMessage.findFirst({
        where: senderScope,
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      prisma.demandRecord.findFirst({
        where: senderScope,
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
      prisma.projectExpiration.findFirst({
        where: uploadedScope,
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
      prisma.websiteUpdate.findFirst({
        where: uploadedScope,
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
      prisma.businessReport.findFirst({
        where: uploadedScope,
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
    ]);

    const telegramLastModified = msg?.createdAt ? new Date(msg.createdAt).getTime() : 0;

    const lastModified = Math.max(
      telegramLastModified,
      demand?.updatedAt ? new Date(demand.updatedAt).getTime() : 0,
      expiry?.updatedAt ? new Date(expiry.updatedAt).getTime() : 0,
      web?.updatedAt ? new Date(web.updatedAt).getTime() : 0,
      report?.updatedAt ? new Date(report.updatedAt).getTime() : 0
    );

    return NextResponse.json({
      lastModified,
      telegramLastModified,
    });
  } catch (error) {
    console.error("Failed to fetch last-modified timestamps:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
