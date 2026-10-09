import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notDeleted, softDeleteData } from "@/lib/soft-delete";
import { customerOwnedByUserOrAdmin } from "@/lib/tenant-scope";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const customer = await prisma.customer.findFirst({
    where: { id, ...customerOwnedByUserOrAdmin(session), ...notDeleted },
    include: {
      activities: {
        include: {
          sender: true,
        },
        orderBy: { createdAt: "desc" },
      },
      demandRecords: {
        where: notDeleted,
        include: {
          sender: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!customer) {
    return NextResponse.json({ message: "Customer not found" }, { status: 404 });
  }

  const timeline = [
    ...customer.activities.map((a) => ({
      id: a.id,
      type: "activity" as const,
      action: a.action,
      description: a.description,
      sender: a.sender?.displayName,
      senderId: a.senderId,
      createdAt: a.createdAt.toISOString(),
    })),
    ...customer.demandRecords.map((d) => ({
      id: d.id,
      type: "demand" as const,
      reportType: "demand_report",
      customerName: d.customerName,
      category: d.category,
      status: d.status,
      note: d.note,
      followUpDate: d.followUpDate?.toISOString(),
      sender: d.sender?.displayName,
      senderId: d.senderId,
      createdAt: d.createdAt.toISOString(),
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json({
    customer: {
      id: customer.id,
      name: customer.name,
      nameNormalized: customer.nameNormalized,
      phone: customer.phone,
      email: customer.email,
      company: customer.company,
      notes: customer.notes,
      status: customer.status,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    },
    timeline,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { name, phone, email, company, notes, status } = body;

  const existing = await prisma.customer.findFirst({
    where: { id, ...customerOwnedByUserOrAdmin(session), ...notDeleted },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ message: "Customer not found or access denied" }, { status: 404 });
  }

  const written = await prisma.customer.updateMany({
    where: { id, ...customerOwnedByUserOrAdmin(session), ...notDeleted },
    data: { name, phone, email, company, notes, status },
  });
  if (!written.count) {
    return NextResponse.json({ message: "Customer not found or access denied" }, { status: 404 });
  }

  const customer = await prisma.customer.findFirst({
    where: { id, ...customerOwnedByUserOrAdmin(session) },
  });

  return NextResponse.json({ customer });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const customer = await prisma.customer.findFirst({
    where: { id, ...customerOwnedByUserOrAdmin(session), ...notDeleted },
  });

  if (!customer) {
    return NextResponse.json({ message: "Customer not found or access denied" }, { status: 404 });
  }

  const deleted = await prisma.$transaction(async (tx) => {
    const customers = await tx.customer.updateMany({
      where: { id, ...customerOwnedByUserOrAdmin(session), ...notDeleted },
      data: softDeleteData(session.user.id),
    });
    if (!customers.count) return customers;
    await tx.demandRecord.updateMany({
      where: { customerId: id, ...notDeleted },
      data: softDeleteData(session.user.id, "Deleted along with customer"),
    });
    return customers;
  });

  if (!deleted.count) {
    return NextResponse.json({ message: "Customer not found or access denied" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
