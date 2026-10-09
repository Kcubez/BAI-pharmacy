import { auth } from "@/lib/auth";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { notDeleted, restoreData, softDeleteData } from "@/lib/soft-delete";
import { customerOwnedByUserOrAdmin } from "@/lib/tenant-scope";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
  const search = searchParams.get("search") || "";
  const dateFrom = searchParams.get("dateFrom") || "";
  const dateTo = searchParams.get("dateTo") || "";
  const status = searchParams.get("status") || "";

  const where: Prisma.CustomerWhereInput = { ...customerOwnedByUserOrAdmin(session), ...notDeleted };
  const conditions: Prisma.CustomerWhereInput[] = [];

  if (status) where.status = status;
  if (dateFrom || dateTo) {
    const rangeCondition: Record<string, Date> = {};
    if (dateFrom) rangeCondition.gte = new Date(dateFrom);
    if (dateTo) rangeCondition.lte = new Date(dateTo + "T23:59:59.999Z");
    
    conditions.push({
      OR: [
        { createdAt: rangeCondition },
        { demandRecords: { some: { createdAt: rangeCondition, ...notDeleted } } },
        { activities: { some: { createdAt: rangeCondition } } }
      ]
    });
  }
  if (search) {
    conditions.push({
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { company: { contains: search, mode: "insensitive" } },
      ]
    });
  }

  if (conditions.length > 0) {
    where.AND = conditions;
  }

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: {
        activities: {
          include: {
            sender: true,
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        demandRecords: {
          where: notDeleted,
          select: {
            id: true,
            serviceName: true,
            serviceAmount: true,
            status: true,
          }
        },
        _count: {
          select: { demandRecords: { where: notDeleted } },
        },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.customer.count({ where }),
  ]);

  const serialized = customers.map((c) => ({
    ...c,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    activities: c.activities.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
      sender: a.sender
        ? {
            ...a.sender,
            telegramUserId: a.sender.telegramUserId ? a.sender.telegramUserId.toString() : null,
            lastMessageAt: a.sender.lastMessageAt?.toISOString() ?? null,
            createdAt: a.sender.createdAt.toISOString(),
            updatedAt: a.sender.updatedAt.toISOString(),
          }
        : null,
    })),
  }));

  return NextResponse.json({
    customers: serialized,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}

function normalizeCustomerName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, phone, email, company, notes } = body;

  if (!name) {
    return NextResponse.json({ message: "Name is required" }, { status: 400 });
  }

  const nameNormalized = normalizeCustomerName(name);
  const existing = await prisma.customer.findFirst({
    where: { userId: session.user.id, nameNormalized },
  });

  const customer = existing
    ? await prisma.customer.update({
        where: { id: existing.id },
        data: {
          ...restoreData(session.user.id),
          name,
          phone,
          email,
          company,
          notes,
          status: "active",
        },
      })
    : await prisma.customer.create({
        data: {
          userId: session.user.id,
          name,
          nameNormalized,
          phone,
          email,
          company,
          notes,
        },
      });

  return NextResponse.json({ customer });
}

export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { id, name, phone, email, company, notes, status } = body;

  if (!id) {
    return NextResponse.json({ message: "ID is required" }, { status: 400 });
  }

  const data: Record<string, unknown> = { phone, email, company, notes, status };
  if (typeof name === "string" && name.length > 0) {
    data.name = name;
    data.nameNormalized = normalizeCustomerName(name);
  }

  const customer = await prisma.customer.updateMany({
    where: { id, ...customerOwnedByUserOrAdmin(session), ...notDeleted },
    data,
  });

  if (!customer.count) {
    return NextResponse.json({ message: "Customer not found or access denied" }, { status: 404 });
  }

  const updated = await prisma.customer.findFirst({
    where: { id, ...customerOwnedByUserOrAdmin(session) },
  });

  return NextResponse.json({ customer: updated });
}

// DELETE /api/customers — soft-delete customers matching the selected period.
export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const dateFrom = searchParams.get("dateFrom") || "";
  const dateTo = searchParams.get("dateTo") || "";
  const where: Prisma.CustomerWhereInput = { ...customerOwnedByUserOrAdmin(session), ...notDeleted };

  if (dateFrom || dateTo) {
    const rangeCondition: Record<string, Date> = {};
    if (dateFrom) rangeCondition.gte = new Date(dateFrom);
    if (dateTo) rangeCondition.lte = new Date(dateTo + "T23:59:59.999Z");

    where.OR = [
      { createdAt: rangeCondition },
      { demandRecords: { some: { createdAt: rangeCondition, ...notDeleted } } },
      { activities: { some: { createdAt: rangeCondition } } },
    ];
  }

  const customers = await prisma.customer.findMany({
    where,
    select: { id: true },
  });
  const customerIds = customers.map((c) => c.id);

  const result = await prisma.$transaction([
    prisma.customer.updateMany({
      where,
      data: softDeleteData(session.user.id, searchParams.get("reason")),
    }),
    prisma.demandRecord.updateMany({
      where: { customerId: { in: customerIds }, ...notDeleted },
      data: softDeleteData(session.user.id, "Deleted along with customer"),
    }),
  ]);

  return NextResponse.json({ success: true, count: result[0].count });
}
