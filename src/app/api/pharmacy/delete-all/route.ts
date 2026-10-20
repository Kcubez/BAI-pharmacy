import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notDeleted, softDeleteData } from "@/lib/soft-delete";
import { bumpCacheVersion, publishEvent } from "@/lib/upstash";
import { NextRequest, NextResponse } from "next/server";

// Scoped soft-delete for pharmacy test-data resets (commerce delete-all
// pattern). Rows are recoverable via POST /api/pharmacy/restore — except
// product Min/Max levels, which are reset to null (re-import STOCK BY PRICE
// to restore them).
export const PHARMA_DELETE_SCOPES = [
  "purchase",
  "sales",
  "receivable",
  "stock",
  "levels",
  "all",
] as const;

export type PharmaDeleteScope = (typeof PHARMA_DELETE_SCOPES)[number];

function isScope(v: string | null): v is PharmaDeleteScope {
  return !!v && (PHARMA_DELETE_SCOPES as readonly string[]).includes(v);
}

// Preview the signed-in account's active records without changing data.
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const where = { userId: session.user.id, ...notDeleted };
  const values = await Promise.all([
    prisma.purchaseOrder.count({ where }), prisma.purchaseInvoice.count({ where }),
    prisma.salesLine.count({ where }), prisma.receivable.count({ where }),
    prisma.stockSnapshot.count({ where }), prisma.stockMovement.count({ where }),
    prisma.expiryLot.count({ where }), prisma.stockReturn.count({ where }),
    prisma.storeInLot.count({ where }), prisma.supplier.count({ where }),
    prisma.pharmaProduct.count({ where }),
  ]);
  const keys = ["purchaseOrders", "purchaseInvoices", "salesLines", "receivables", "stockSnapshots",
    "stockMovements", "expiryLots", "stockReturns", "storeInLots", "suppliers", "products"];
  return NextResponse.json({ counts: Object.fromEntries(keys.map((key, i) => [key, values[i]])),
    total: values.reduce((sum, count) => sum + count, 0) }, { headers: { "Cache-Control": "no-store" } });
}

// DELETE /api/pharmacy/delete-all?scope=purchase|sales|receivable|stock|levels|all
export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const scope = req.nextUrl.searchParams.get("scope");
  if (!isScope(scope)) {
    return NextResponse.json({ message: "Valid scope required: purchase|sales|receivable|stock|levels|all" }, { status: 400 });
  }
  if (scope === "all" && req.headers.get("x-pharmacy-confirmation") !== "RESET") {
    return NextResponse.json({ message: "Type RESET to confirm moving all pharmacy data to Trash" }, { status: 400 });
  }

  const userId = session.user.id;
  const data = softDeleteData(userId, `Pharmacy delete-all (${scope})`);
  const counts: Record<string, number> = {};
  const wipe = async (key: string, fn: () => Promise<{ count: number }>) => {
    counts[key] = (await fn()).count;
  };

  if (scope === "purchase" || scope === "all") {
    await wipe("purchaseOrders", () => prisma.purchaseOrder.updateMany({ where: { userId, ...notDeleted }, data }));
    await wipe("purchaseInvoices", () => prisma.purchaseInvoice.updateMany({ where: { userId, ...notDeleted }, data }));
  }
  if (scope === "sales" || scope === "all") {
    await wipe("salesLines", () => prisma.salesLine.updateMany({ where: { userId, ...notDeleted }, data }));
  }
  if (scope === "receivable" || scope === "all") {
    await wipe("receivables", () => prisma.receivable.updateMany({ where: { userId, ...notDeleted }, data }));
  }
  if (scope === "stock" || scope === "all") {
    await wipe("stockSnapshots", () => prisma.stockSnapshot.updateMany({ where: { userId, ...notDeleted }, data }));
    await wipe("stockMovements", () => prisma.stockMovement.updateMany({ where: { userId, ...notDeleted }, data }));
  }
  // Expiry, store-in, returns, and Min/Max all influence the Inventory page.
  // They must be cleared with stock data; otherwise the expiry KPI can retain
  // stale counts after the snapshots have been deleted.
  if (scope === "stock" || scope === "levels" || scope === "all") {
    await wipe("expiryLots", () => prisma.expiryLot.updateMany({ where: { userId, ...notDeleted }, data }));
    await wipe("stockReturns", () => prisma.stockReturn.updateMany({ where: { userId, ...notDeleted }, data }));
    await wipe("storeInLots", () => prisma.storeInLot.updateMany({ where: { userId, ...notDeleted }, data }));
    // Min/Max live on the product row — reset one-way (re-import restores).
    // A full reset trashes the product itself; retain its levels for restoration.
    if (scope !== "all") counts["resetLevels"] = (await prisma.pharmaProduct.updateMany({
      where: { userId, ...notDeleted, OR: [{ minQty: { not: null } }, { maxQty: { not: null } }] },
      data: { minQty: null, maxQty: null },
    })).count;
  }
  if (scope === "all") {
    // Masters last (transaction rows already trashed; FKs are SetNull).
    await wipe("suppliers", () => prisma.supplier.updateMany({ where: { userId, ...notDeleted }, data }));
    await wipe("products", () => prisma.pharmaProduct.updateMany({ where: { userId, ...notDeleted }, data }));
  }

  const total = Object.entries(counts).reduce((s, [key, n]) => s + (key === "resetLevels" ? 0 : n), 0);
  await bumpCacheVersion("pharmacy", userId);
  await publishEvent(userId, "pharmacy");
  return NextResponse.json({ success: true, scope, counts, total });
}
