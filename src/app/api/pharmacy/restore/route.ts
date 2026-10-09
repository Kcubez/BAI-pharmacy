import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { onlyDeleted, restoreData } from "@/lib/soft-delete";
import { bumpCacheVersion, publishEvent } from "@/lib/upstash";
import { NextRequest, NextResponse } from "next/server";
import { PHARMA_DELETE_SCOPES, type PharmaDeleteScope } from "../delete-all/route";

function isScope(v: unknown): v is PharmaDeleteScope {
  return typeof v === "string" && (PHARMA_DELETE_SCOPES as readonly string[]).includes(v);
}

// POST /api/pharmacy/restore { scope } — restore the caller's own trashed
// pharma rows for a delete-all scope. Single-owner app: any signed-in user
// may restore their own rows (commerce gates restore to admin; pharma data
// is strictly per-user so own-restore is safe).
// Note: product Min/Max levels are NOT restored (one-way reset) — re-import
// STOCK BY PRICE to bring them back.
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { scope?: unknown };
  if (!isScope(body.scope)) {
    return NextResponse.json({ message: "Valid scope required: purchase|sales|receivable|stock|levels|all" }, { status: 400 });
  }
  const scope = body.scope;

  const userId = session.user.id;
  const data = restoreData(userId);
  const counts: Record<string, number> = {};
  const back = async (key: string, fn: () => Promise<{ count: number }>) => {
    counts[key] = (await fn()).count;
  };

  if (scope === "purchase" || scope === "all") {
    await back("purchaseOrders", () => prisma.purchaseOrder.updateMany({ where: { userId, ...onlyDeleted }, data }));
    await back("purchaseInvoices", () => prisma.purchaseInvoice.updateMany({ where: { userId, ...onlyDeleted }, data }));
  }
  if (scope === "sales" || scope === "all") {
    await back("salesLines", () => prisma.salesLine.updateMany({ where: { userId, ...onlyDeleted }, data }));
  }
  if (scope === "receivable" || scope === "all") {
    await back("receivables", () => prisma.receivable.updateMany({ where: { userId, ...onlyDeleted }, data }));
  }
  if (scope === "stock" || scope === "all") {
    await back("stockSnapshots", () => prisma.stockSnapshot.updateMany({ where: { userId, ...onlyDeleted }, data }));
    await back("stockMovements", () => prisma.stockMovement.updateMany({ where: { userId, ...onlyDeleted }, data }));
  }
  if (scope === "levels" || scope === "all") {
    await back("expiryLots", () => prisma.expiryLot.updateMany({ where: { userId, ...onlyDeleted }, data }));
    await back("stockReturns", () => prisma.stockReturn.updateMany({ where: { userId, ...onlyDeleted }, data }));
    await back("storeInLots", () => prisma.storeInLot.updateMany({ where: { userId, ...onlyDeleted }, data }));
  }
  if (scope === "all") {
    await back("suppliers", () => prisma.supplier.updateMany({ where: { userId, ...onlyDeleted }, data }));
    await back("products", () => prisma.pharmaProduct.updateMany({ where: { userId, ...onlyDeleted }, data }));
  }

  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  await bumpCacheVersion("pharmacy", userId);
  await publishEvent(userId, "pharmacy");
  return NextResponse.json({ success: true, scope, counts, total });
}
