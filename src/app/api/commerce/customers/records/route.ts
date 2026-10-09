import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notDeleted } from "@/lib/soft-delete";
import { ownedByUserOrAdmin } from "@/lib/tenant-scope";
import { parsePeriodParams, resolvePeriodRange } from "@/lib/period-range";
import type { Prisma } from "@/generated/prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { RECORD_STATUS_TO_STAGE, resolveRecordCustomer, serializeRecord } from "./shared";

/**
 * Row-level purchase ledger for the Customers tab ("2. Purchase Records Data").
 * Reads Deals — the same records produced by sales-order and customer-service
 * imports — so every imported purchase appears alongside manual entries.
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "10")));
  const search = searchParams.get("search") || "";
  const followUpStatus = searchParams.get("followUpStatus") || "";

  const resolved = parsePeriodParams(searchParams);
  const { start, end } = resolvePeriodRange(resolved);

  const where: Prisma.DealWhereInput = {
    ...ownedByUserOrAdmin(session),
    ...notDeleted,
    createdAt: { gte: start, lt: end },
  };

  if (followUpStatus === "overdue" || followUpStatus === "due") {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    where.stage = { notIn: ["WON", "LOST"] };
    where.followUpNotes = {
      some: {
        suggestedFollowUpDate:
          followUpStatus === "overdue"
            ? { lt: todayStart }
            : { gte: todayStart, lt: todayEnd },
      },
    };
  }

  if (search) {
    where.OR = [
      { customer: { name: { contains: search, mode: "insensitive" as const } } },
      { items: { some: { productName: { contains: search, mode: "insensitive" as const } } } },
      { note: { contains: search, mode: "insensitive" as const } },
    ];
  }

  const [deals, total] = await Promise.all([
    prisma.deal.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true, company: true } },
        items: { select: { productName: true, quantity: true, unitPrice: true }, take: 1 },
      },
      orderBy: [{ wonAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.deal.count({ where }),
  ]);

  return NextResponse.json({
    records: deals.map(serializeRecord),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const customerName = String(body.customerName ?? "").trim();
  if (!customerName) return NextResponse.json({ message: "Customer name is required" }, { status: 400 });

  const phone = body.customerPhone ? String(body.customerPhone).trim() : null;
  const company = body.customerCompany ? String(body.customerCompany).trim() : null;
  const customerId = await resolveRecordCustomer(customerName, phone, company, session.user.id);

  const stageInfo = RECORD_STATUS_TO_STAGE[String(body.status ?? "new")] ?? RECORD_STATUS_TO_STAGE.new;
  const quantity = Math.max(1, Math.trunc(Number(body.quantity) || 1));
  const amount = Math.max(0, Number(body.amount) || 0);
  const productName = String(body.productName ?? "").trim() || null;
  const followUpDate = body.followUpDate ? new Date(`${String(body.followUpDate)}T00:00:00.000Z`) : null;

  const deal = await prisma.deal.create({
    data: {
      userId: session.user.id,
      customerId,
      stage: stageInfo.stage,
      fulfillmentStatus: stageInfo.fulfilled ? "FULFILLED" : "NOT_APPLICABLE",
      source: "manual",
      sourceChannel: "Dashboard",
      quotedAmount: amount > 0 ? amount : null,
      wonAt: stageInfo.stage === "WON" ? new Date() : undefined,
      lastContactAt: new Date(),
      note: String(body.note ?? "").trim() || null,
      ...(productName
        ? {
            items: {
              create: [{
                productName,
                sku: null,
                quantity,
                unitPrice: quantity > 0 && amount > 0 ? Math.round(amount / quantity) : amount,
              }],
            },
          }
        : {}),
    },
    include: {
      customer: { select: { id: true, name: true, phone: true, company: true } },
      items: { select: { productName: true, quantity: true, unitPrice: true }, take: 1 },
    },
  });

  if (followUpDate) {
    await prisma.followUpNote.create({
      data: {
        dealId: deal.id,
        aiDraftedText: "Manual follow-up schedule",
        suggestedFollowUpDate: followUpDate,
      },
    });
  }

  return NextResponse.json({ record: serializeRecord(deal) });
}
