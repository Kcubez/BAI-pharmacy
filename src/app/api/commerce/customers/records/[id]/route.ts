import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notDeleted, softDeleteData } from "@/lib/soft-delete";
import { ownedByUserOrAdmin } from "@/lib/tenant-scope";
import { NextRequest, NextResponse } from "next/server";
import { dealTotal, RECORD_STATUS_TO_STAGE, resolveRecordCustomer, serializeRecord } from "../shared";

type OwnedDealResult =
  | { error: NextResponse; session?: undefined; deal?: undefined }
  | { error?: undefined; session: { user: { id: string } }; deal: NonNullable<Awaited<ReturnType<typeof findOwnedDeal>>> };

async function findOwnedDeal(id: string, userIdScope: Record<string, unknown>) {
  return prisma.deal.findFirst({
    where: { id, ...userIdScope, ...notDeleted },
    include: {
      customer: { select: { id: true, name: true, phone: true, company: true } },
      items: { select: { productName: true, quantity: true, unitPrice: true }, take: 1 },
    },
  });
}

async function loadOwnedDeal(req: NextRequest, id: string): Promise<OwnedDealResult> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return { error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
  const scope = ownedByUserOrAdmin(session);
  const deal = await findOwnedDeal(id, scope);
  if (!deal) return { error: NextResponse.json({ message: "Record not found" }, { status: 404 }) };
  return { session: { user: { id: session.user.id } }, deal };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await loadOwnedDeal(req, id);
  if (loaded.error) return loaded.error;
  const { session, deal } = loaded;

  const body = await req.json();
  const data: Parameters<typeof prisma.deal.update>[0]["data"] = {};

  // Customer identity changes re-resolve (and restore) the matching customer.
  const customerName = body.customerName ? String(body.customerName).trim() : null;
  const phone = body.customerPhone !== undefined ? (String(body.customerPhone ?? "").trim() || null) : null;
  const company = body.customerCompany !== undefined ? (String(body.customerCompany ?? "").trim() || null) : null;
  if ((customerName && customerName !== deal.customer?.name) || phone !== null || company !== null) {
    const resolvedId = await resolveRecordCustomer(
      customerName ?? deal.customer?.name ?? "Unknown",
      phone,
      company,
      session.user.id
    );
    data.customerId = resolvedId;
  }

  const statusKey = body.status ? String(body.status) : null;
  if (statusKey && RECORD_STATUS_TO_STAGE[statusKey]) {
    const stageInfo = RECORD_STATUS_TO_STAGE[statusKey];
    data.stage = stageInfo.stage;
    data.fulfillmentStatus = stageInfo.fulfilled ? "FULFILLED" : "NOT_APPLICABLE";
    if (stageInfo.stage === "WON" && !deal.wonAt) data.wonAt = new Date();
    if (stageInfo.stage !== "WON") data.wonAt = null;
  }

  // Line-item edits keep a single item per manual/imported record row.
  const productName = body.productName !== undefined ? (String(body.productName ?? "").trim() || null) : null;
  const amount = body.amount !== undefined ? Math.max(0, Number(body.amount) || 0) : undefined;
  const quantity = body.quantity !== undefined ? Math.max(1, Math.trunc(Number(body.quantity) || 1)) : undefined;
  if (amount !== undefined) data.quotedAmount = amount > 0 ? amount : null;

  const wantsItemEdit = productName !== undefined || amount !== undefined || quantity !== undefined;
  if (wantsItemEdit) {
    const nextName = productName ?? deal.items[0]?.productName ?? null;
    if (nextName) {
      const nextQty = quantity ?? deal.items[0]?.quantity ?? 1;
      const nextAmount = amount ?? dealTotal(deal);
      data.items = {
        deleteMany: {},
        create: [{
          productName: nextName,
          sku: null,
          quantity: nextQty,
          unitPrice: nextQty > 0 && nextAmount > 0 ? Math.round(nextAmount / nextQty) : nextAmount,
        }],
      };
    } else {
      data.items = { deleteMany: {} };
    }
  }

  if (body.note !== undefined) data.note = String(body.note ?? "").trim() || null;

  const updated = await prisma.deal.update({
    where: { id: deal.id },
    data,
    include: {
      customer: { select: { id: true, name: true, phone: true, company: true } },
      items: { select: { productName: true, quantity: true, unitPrice: true }, take: 1 },
    },
  });

  // Keep exactly one scheduled follow-up per record.
  const followUpDateRaw = body.followUpDate;
  if (followUpDateRaw !== undefined) {
    const followUpDate = followUpDateRaw ? new Date(`${String(followUpDateRaw)}T00:00:00.000Z`) : null;
    const latestNote = await prisma.followUpNote.findFirst({
      where: { dealId: deal.id },
      orderBy: { createdAt: "desc" },
    });
    if (followUpDate) {
      if (latestNote) {
        await prisma.followUpNote.update({ where: { id: latestNote.id }, data: { suggestedFollowUpDate: followUpDate } });
      } else {
        await prisma.followUpNote.create({
          data: { dealId: deal.id, aiDraftedText: "Manual follow-up schedule", suggestedFollowUpDate: followUpDate },
        });
      }
    } else if (latestNote) {
      await prisma.followUpNote.update({ where: { id: latestNote.id }, data: { suggestedFollowUpDate: null } });
    }
  }

  return NextResponse.json({ record: serializeRecord(updated) });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await loadOwnedDeal(req, id);
  if (loaded.error) return loaded.error;

  // Atomic scoped write (no nested writes here, so updateMany works).
  const written = await prisma.deal.updateMany({
    where: { id: loaded.deal.id, userId: loaded.session.user.id, ...notDeleted },
    data: softDeleteData(loaded.session.user.id, "Deleted from customers workspace"),
  });
  if (!written.count) {
    return NextResponse.json({ message: "Record not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
