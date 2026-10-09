import { auth } from "@/lib/auth";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { notDeleted, restoreData, softDeleteData } from "@/lib/soft-delete";
import { senderOwnedByUserOrAdmin } from "@/lib/tenant-scope";
import { NextRequest, NextResponse } from "next/server";

function serializeDemandRecord(record: Record<string, unknown>) {
  const result = { ...record };
  if (result.followUpDate instanceof Date) result.followUpDate = result.followUpDate.toISOString();
  if (result.createdAt instanceof Date) result.createdAt = result.createdAt.toISOString();
  if (result.updatedAt instanceof Date) result.updatedAt = result.updatedAt.toISOString();
  if (result.message && typeof result.message === "object") {
    const message = { ...(result.message as Record<string, unknown>) };
    if (typeof message.chatId === "bigint") message.chatId = message.chatId.toString();
    if (message.receivedAt instanceof Date) message.receivedAt = message.receivedAt.toISOString();
    result.message = message;
  }
  if (result.sender && typeof result.sender === "object") {
    const sender = { ...(result.sender as Record<string, unknown>) };
    if (typeof sender.telegramUserId === "bigint") {
      sender.telegramUserId = sender.telegramUserId.toString();
    }
    result.sender = sender;
  }
  if (result.customer && typeof result.customer === "object") {
    const customer = { ...(result.customer as Record<string, unknown>) };
    if (customer.createdAt instanceof Date) customer.createdAt = customer.createdAt.toISOString();
    if (customer.updatedAt instanceof Date) customer.updatedAt = customer.updatedAt.toISOString();
    result.customer = customer;
  }
  return result;
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
  const search = searchParams.get("search") || "";
  const status = searchParams.get("status") || "";
  const category = searchParams.get("category") || "";
  const senderId = searchParams.get("senderId") || "";
  const priority = searchParams.get("priority") || "";
  const dateFrom = searchParams.get("dateFrom") || "";
  const dateTo = searchParams.get("dateTo") || "";
  const followUpStatus = searchParams.get("followUpStatus") || "";
  const missingField = searchParams.get("missingField") || "";

  const where: Prisma.DemandRecordWhereInput = { ...senderOwnedByUserOrAdmin(session), ...notDeleted };

  if (status) {
    where.status = status;
  } else if (followUpStatus === "overdue" || followUpStatus === "due") {
    where.status = { notIn: ["closed", "completed"] };
  }
  if (category) where.category = category;
  if (senderId) where.senderId = senderId;
  if (priority) where.priority = priority;
  if (followUpStatus) where.followUpStatus = followUpStatus;
  if (missingField) where.missingFields = { has: missingField };

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) {
      where.createdAt.gte = new Date(dateFrom);
    }
    if (dateTo) {
      where.createdAt.lte = new Date(dateTo + "T23:59:59.999Z");
    }
  }

  if (search) {
    where.OR = [
      { customerName: { contains: search, mode: "insensitive" } },
      { note: { contains: search, mode: "insensitive" } },
      { sender: { displayName: { contains: search, mode: "insensitive" } } },
      { sender: { username: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [records, total] = await Promise.all([
    prisma.demandRecord.findMany({
      where,
      include: {
        sender: true,
        message: true,
        customer: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.demandRecord.count({ where }),
  ]);

  return NextResponse.json({
    records: records.map((record) => serializeDemandRecord(record)),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}

// DELETE /api/demand-records — soft-delete demand records matching selected filters.
export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const dateFrom = searchParams.get("dateFrom") || "";
  const dateTo = searchParams.get("dateTo") || "";
  const where: Prisma.DemandRecordWhereInput = { ...senderOwnedByUserOrAdmin(session), ...notDeleted };

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) where.createdAt.lte = new Date(dateTo + "T23:59:59.999Z");
  }

  const reason = searchParams.get("reason") || null;
  const result = await prisma.demandRecord.updateMany({
    where,
    data: softDeleteData(session.user.id, reason),
  });
  return NextResponse.json({ success: true, count: result.count });
}

// POST /api/demand-records — create a single demand record manually (leads dashboard)
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    customerName,
    customerPhone,
    customerCompany,
    serviceName,
    serviceAmount,
    serviceQty,
    followUpDate,
    priority = "medium",
    status = "new",
    note = "",
  } = body;

  // 1. Resolve or create customer if raw name is provided
  let customerId: string | null = null;
  if (customerName) {
    const normalizedName = customerName.toLowerCase().replace(/\s+/g, " ").trim();
    let customer = await prisma.customer.findFirst({
      where: {
        userId: session.user.id,
        OR: [
          { nameNormalized: normalizedName },
          { name: { equals: customerName, mode: "insensitive" } }
        ]
      }
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          userId: session.user.id,
          name: customerName,
          nameNormalized: normalizedName,
          phone: customerPhone || null,
          company: customerCompany || null,
          status: "active"
        }
      });
    } else {
      if (customer.deletedAt || (!customer.phone && customerPhone) || (!customer.company && customerCompany)) {
        customer = await prisma.customer.update({
          where: { id: customer.id },
          data: {
            ...(customer.deletedAt ? restoreData(session.user.id) : {}),
            phone: customer.phone || customerPhone || null,
            company: customer.company || customerCompany || null,
            status: "active",
          }
        });
      }
    }
    customerId = customer.id;
  }

  // 2. Ensure dashboard system sender exists
  const sender =
    (await prisma.telegramSender.findFirst({
      where: { telegramUserId: 0, userId: session.user.id },
    })) ||
    (await prisma.telegramSender.create({
      data: {
        userId: session.user.id,
        telegramUserId: 0,
        firstName: "Dashboard",
        lastName: "System",
        username: "dashboard_system",
        displayName: "Dashboard System",
        activeReportType: "none",
      },
    }));

  // 3. Ensure dashboard placeholder message exists
  const message = await prisma.telegramMessage.upsert({
    where: { id: `dashboard_placeholder_msg_${session.user.id}` },
    update: {},
    create: {
      id: `dashboard_placeholder_msg_${session.user.id}`,
      telegramMsgId: 0,
      text: "Dashboard Manual Entry",
      senderId: sender.id,
      chatId: 0,
    },
  });

  // 4. Run priority analysis using analyzeDemandRecord
  const { analyzeDemandRecord } = await import("@/lib/demand-analysis");
  const analysis = analyzeDemandRecord({
    customerName,
    customerPhone,
    customerCompany,
    serviceName,
    serviceAmount,
    serviceQty,
    followUpDate: followUpDate ? new Date(followUpDate) : null,
    status,
    note,
  });

  // 5. Create the demand record
  const record = await prisma.demandRecord.create({
    data: {
      messageId: message.id,
      senderId: sender.id,
      customerId,
      customerName,
      category: "general",
      status,
      note,
      serviceName,
      serviceAmount: serviceAmount ? parseFloat(serviceAmount) : null,
      serviceQty: serviceQty ? parseInt(serviceQty) : null,
      followUpDate: followUpDate ? new Date(followUpDate) : null,
      followUpStatus: analysis.followUpStatus,
      priority,
      potentialScore: analysis.potentialScore,
      priorityReason: analysis.priorityReason,
      recommendedAction: analysis.recommendedAction,
      missingFields: analysis.missingFields,
      confidence: 1.0,
      aiProvider: "manual",
    },
    include: {
      sender: true,
      customer: true,
    }
  });

  return NextResponse.json(serializeDemandRecord(record as unknown as Record<string, unknown>));
}
