import { prisma } from "@/lib/prisma";
import { restoreData } from "@/lib/soft-delete";
import { DealStage } from "@/generated/prisma/enums";
import type { DealStage as DealStageValue } from "@/generated/prisma/enums";

export const RECORD_STATUS_TO_STAGE: Record<string, { stage: DealStageValue; fulfilled: boolean }> = {
  new: { stage: DealStage.NEW_LEAD, fulfilled: false },
  contacted: { stage: DealStage.FOLLOW_UP_NEEDED, fulfilled: false },
  quoted: { stage: DealStage.QUOTED, fulfilled: false },
  pending: { stage: DealStage.PENDING, fulfilled: false },
  closed: { stage: DealStage.WON, fulfilled: false },
  completed: { stage: DealStage.WON, fulfilled: true },
};

const STAGE_TO_STATUS: Record<string, "new" | "contacted" | "quoted" | "pending" | "completed" | "lost"> = {
  NEW_LEAD: "new",
  FOLLOW_UP_NEEDED: "contacted",
  QUOTED: "quoted",
  PENDING: "pending",
  WON: "completed",
  LOST: "lost",
};

const STAGE_TO_POTENTIAL: Record<string, "high" | "medium" | "low"> = {
  NEW_LEAD: "medium",
  QUOTED: "high",
  FOLLOW_UP_NEEDED: "high",
  PENDING: "medium",
  WON: "low",
  LOST: "low",
};

export function dealTotal(deal: { quotedAmount: number | null; items: { quantity: number; unitPrice: number }[] }) {
  const itemTotal = deal.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  return itemTotal || deal.quotedAmount || 0;
}

type DealWithRelations = {
  id: string;
  stage: string;
  wonAt: Date | null;
  createdAt: Date;
  sourceChannel: string | null;
  note: string | null;
  quotedAmount: number | null;
  customerId: string | null;
  items: { productName: string; quantity: number; unitPrice: number }[];
  customer: { id: string; name: string; phone: string | null; company: string | null } | null;
};

export function serializeRecord(deal: DealWithRelations) {
  return {
    id: deal.id,
    // Purchases land on their won date; inquiries on creation date.
    purchaseDate: (deal.wonAt ?? deal.createdAt).toISOString(),
    customerId: deal.customerId,
    customerName: deal.customer?.name ?? "Unknown",
    company: deal.customer?.company ?? null,
    phone: deal.customer?.phone ?? null,
    sourceChannel: deal.sourceChannel,
    product: deal.items[0]?.productName ?? null,
    amount: dealTotal(deal),
    potential: STAGE_TO_POTENTIAL[deal.stage] ?? ("medium" as const),
    status: STAGE_TO_STATUS[deal.stage] ?? ("pending" as const),
  };
}

/** Shared lookup: match by normalized name, restoring soft-deleted customers. */
export async function resolveRecordCustomer(
  customerName: string,
  phone: string | null,
  company: string | null,
  userId: string
): Promise<string> {
  const nameNormalized = customerName.toLowerCase().replace(/\s+/g, " ").trim();
  const customer = await prisma.customer.upsert({
    where: { userId_nameNormalized: { userId, nameNormalized } },
    create: {
      userId,
      name: customerName,
      nameNormalized,
      ...(phone ? { phone } : {}),
      ...(company ? { company } : {}),
    },
    update: {
      ...restoreData(userId),
      ...(phone ? { phone } : {}),
      ...(company ? { company } : {}),
    },
    select: { id: true },
  });
  return customer.id;
}
