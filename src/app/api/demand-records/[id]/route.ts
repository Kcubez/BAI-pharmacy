import { auth } from "@/lib/auth";
import { analyzeDemandRecord } from "@/lib/demand-analysis";
import { prisma } from "@/lib/prisma";
import { notDeleted, restoreData, softDeleteData } from "@/lib/soft-delete";
import { senderOwnedByUserOrAdmin } from "@/lib/tenant-scope";
import { NextRequest, NextResponse } from "next/server";

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

  const record = await prisma.demandRecord.findFirst({
    where: { id, ...senderOwnedByUserOrAdmin(session), ...notDeleted },
    include: { customer: true },
  });
  if (!record) {
    return NextResponse.json({ message: "Record not found" }, { status: 404 });
  }

  // 1. Handle customer creation/update/linking if relevant fields are passed
  let customerId = record.customerId;
  const customerName = "customerName" in body ? body.customerName : record.customerName;
  const customerPhone = "customerPhone" in body ? body.customerPhone : (record.customer?.phone || null);
  const customerCompany = "customerCompany" in body ? body.customerCompany : (record.customer?.company || null);

  if (
    customerName !== record.customerName ||
    customerPhone !== (record.customer?.phone || null) ||
    customerCompany !== (record.customer?.company || null)
  ) {
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
        // Update customer details if they are now provided/changed
        if (
          (!customer.phone && customerPhone) ||
          (!customer.company && customerCompany) ||
          customer.name !== customerName ||
          customer.deletedAt
        ) {
          customer = await prisma.customer.update({
            where: { id: customer.id },
            data: {
              ...(customer.deletedAt ? restoreData(session.user.id) : {}),
              name: customerName,
              phone: customerPhone || customer.phone || null,
              company: customerCompany || customer.company || null,
              status: "active",
            }
          });
        }
      }
      customerId = customer.id;
    } else {
      customerId = null;
    }
  }

  // 2. Prepare database update fields
  const data: Record<string, unknown> = {};

  if ("status" in body) data.status = body.status;
  if ("note" in body) data.note = body.note;
  if ("priority" in body) data.priority = body.priority;
  if ("customerName" in body) data.customerName = body.customerName;
  if (customerId !== record.customerId) data.customerId = customerId;

  if ("serviceName" in body) data.serviceName = body.serviceName || null;
  if ("serviceAmount" in body) data.serviceAmount = body.serviceAmount !== null ? Number(body.serviceAmount) : null;
  if ("serviceQty" in body) data.serviceQty = body.serviceQty !== null ? Number(body.serviceQty) : null;

  if ("followUpDate" in body) {
    data.followUpDate = body.followUpDate ? new Date(body.followUpDate) : null;
  }

  // 3. Recalculate analysis
  const mergedForAnalysis = {
    customerName: "customerName" in body ? body.customerName : record.customerName,
    customerPhone: "customerPhone" in body ? body.customerPhone : (record.customer?.phone || null),
    customerCompany: "customerCompany" in body ? body.customerCompany : (record.customer?.company || null),
    serviceName: "serviceName" in body ? body.serviceName : record.serviceName,
    serviceAmount: "serviceAmount" in body ? (body.serviceAmount !== null ? Number(body.serviceAmount) : null) : record.serviceAmount,
    serviceQty: "serviceQty" in body ? (body.serviceQty !== null ? Number(body.serviceQty) : null) : record.serviceQty,
    followUpDate: "followUpDate" in body ? (body.followUpDate ? new Date(body.followUpDate) : null) : record.followUpDate,
    status: "status" in body ? body.status : record.status,
    note: "note" in body ? body.note : record.note,
  };

  const analysis = analyzeDemandRecord(mergedForAnalysis);
  data.followUpStatus = analysis.followUpStatus;
  data.potentialScore = analysis.potentialScore;
  data.priorityReason = analysis.priorityReason;
  data.recommendedAction = analysis.recommendedAction;
  data.missingFields = analysis.missingFields;

  // If user explicitly sent priority in body, keep it, otherwise use analyzed priority
  if (!("priority" in body)) {
    data.priority = analysis.priority;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ message: "No valid fields to update" }, { status: 400 });
  }

  try {
    // Atomic scoped write: the gate above could go stale, so ownership is
    // re-asserted in the write itself. A victim id yields count 0, not a leak.
    const written = await prisma.demandRecord.updateMany({
      where: { id, ...senderOwnedByUserOrAdmin(session), ...notDeleted },
      data,
    });
    if (!written.count) {
      return NextResponse.json({ message: "Record not found or access denied" }, { status: 404 });
    }
    const updated = await prisma.demandRecord.findFirst({
      where: { id, ...senderOwnedByUserOrAdmin(session) },
      include: { sender: true, customer: true },
    });
    if (!updated) {
      return NextResponse.json({ message: "Record not found or access denied" }, { status: 404 });
    }

    // Serialize BigInt / Date fields
    const result = { ...updated } as Record<string, unknown>;
    if (result.followUpDate instanceof Date) result.followUpDate = result.followUpDate.toISOString();
    if (result.createdAt instanceof Date) result.createdAt = result.createdAt.toISOString();
    if (result.updatedAt instanceof Date) result.updatedAt = result.updatedAt.toISOString();
    if (result.sender && typeof result.sender === "object") {
      const sender = { ...(result.sender as Record<string, unknown>) };
      if (typeof sender.telegramUserId === "bigint") sender.telegramUserId = sender.telegramUserId.toString();
      result.sender = sender;
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("PATCH error:", error);
    return NextResponse.json({ message: "Record not found or update failed" }, { status: 404 });
  }
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

  try {
    const result = await prisma.demandRecord.updateMany({
      where: { id, ...senderOwnedByUserOrAdmin(session), ...notDeleted },
      data: softDeleteData(session.user.id),
    });
    if (result.count === 0) {
      return NextResponse.json({ message: "Record not found or access denied" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ message: "Record not found or delete failed" }, { status: 404 });
  }
}
