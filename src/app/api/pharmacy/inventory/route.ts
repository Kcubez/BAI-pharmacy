import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notDeleted } from "@/lib/soft-delete";
import { ownedByUserOrAdmin } from "@/lib/tenant-scope";
import { pharmacyPageSchema } from "@/lib/validations";
import { Prisma } from "@/generated/prisma/client";
import { cached } from "@/lib/upstash";
import { parsePeriodParams, resolvePeriodRange } from "@/lib/period-range";
import { NextRequest, NextResponse } from "next/server";

// GET /api/pharmacy/inventory — cover days, slow-moving, overstock, stock-out.
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const userWhere = ownedByUserOrAdmin(session);
  const resolved = parsePeriodParams(req.nextUrl.searchParams);
  const { start, end } = resolvePeriodRange(resolved);
  const paging = pharmacyPageSchema.safeParse({
    page: req.nextUrl.searchParams.get("page") ?? undefined,
    limit: req.nextUrl.searchParams.get("limit") ?? undefined,
  });
  if (!paging.success) {
    return NextResponse.json({ message: paging.error.issues[0]?.message ?? "Invalid paging" }, { status: 400 });
  }
  const { page, limit } = paging.data;
  const search = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const cacheKey = `inventory:${req.nextUrl.searchParams.toString()}`;
  const { data, hit } = await cached("pharmacy", session.user.id, cacheKey, 180, async () => {
  const now = new Date();
  // Inventory is a point-in-time view: use the latest imported snapshot at
  // or before the selected period end. The default overall view stays live.
  const asOf = resolved.period === "overall" ? now : new Date(end.getTime() - 1);
  const velocitySince = resolved.period === "overall"
    ? new Date(now.getTime() - 90 * 86400000)
    : start;
  const velocityUntil = resolved.period === "overall" ? now : end;
  const velocityDays = Math.max(1, Math.round((velocityUntil.getTime() - velocitySince.getTime()) / 86400000));
  const snapshotYearMonth = asOf.getUTCFullYear() * 100 + asOf.getUTCMonth() + 1;

  // Newest snapshot row per item — one query instead of groupBy + N chunk reads.
  // One velocity aggregation feeds both code and name matching, avoiding two
  // full scans of the sales table on every cold inventory request.
  const [snaps, velocityRows, products, expiryLots, storeInLots] = await Promise.all([
    prisma.$queryRaw<
      Array<{ itemCode: string; itemName: string | null; qty: number; unitPrice: number | null; amount: number | null }>
    >(
      Prisma.sql`SELECT DISTINCT ON (item_code) item_code AS "itemCode", item_name AS "itemName", qty, unit_price AS "unitPrice", amount
        FROM stock_snapshot
        WHERE user_id = ${session.user.id} AND deleted_at IS NULL
          AND (year * 100 + month) <= ${snapshotYearMonth}
        ORDER BY item_code, year DESC, month DESC`,
    ),
    prisma.$queryRaw<Array<{ itemCode: string | null; itemName: string | null; qty: number; lastSale: Date | null }>>(
      Prisma.sql`SELECT item_code AS "itemCode", item_name AS "itemName",
        COALESCE(SUM(sale_qty), 0)::double precision AS qty, MAX(sale_date) AS "lastSale"
        FROM sales_line
        WHERE user_id = ${session.user.id} AND deleted_at IS NULL
          AND sale_date >= ${velocitySince} AND sale_date < ${velocityUntil}
        GROUP BY item_code, item_name`,
    ),
    prisma.pharmaProduct.findMany({
      where: { ...userWhere, ...notDeleted },
      select: { itemCode: true, itemName: true, minQty: true, maxQty: true, principal: true },
      take: 20000,
    }),
    prisma.expiryLot.findMany({
      where: { ...userWhere, ...notDeleted, expDate: { lt: new Date(asOf.getTime() + 180 * 86400000) } },
      select: { itemCode: true, itemName: true, expDate: true, balance: true },
      orderBy: { expDate: "asc" },
      take: 2000,
    }),
    prisma.storeInLot.findMany({
      where: { ...userWhere, ...notDeleted, expDate: { lt: new Date(asOf.getTime() + 180 * 86400000) } },
      select: { itemName: true, batchNo: true, expDate: true, qtyOnHand: true, supplierName: true },
      orderBy: { expDate: "asc" },
      take: 2000,
    }),
  ]);

  const levels = new Map<string, { minQty: number | null; maxQty: number | null; principal: string | null; name: string | null }>();
  for (const p of products) {
    levels.set(p.itemCode, { minQty: p.minQty, maxQty: p.maxQty, principal: p.principal, name: p.itemName });
  }

  const velocity = new Map<string, { qty: number; lastSale: Date | null }>();
  for (const s of velocityRows) {
    if (!s.itemCode) continue;
    const current = velocity.get(s.itemCode) ?? { qty: 0, lastSale: null };
    current.qty += Number(s.qty ?? 0);
    if (s.lastSale && (!current.lastSale || s.lastSale > current.lastSale)) current.lastSale = s.lastSale;
    velocity.set(s.itemCode, current);
  }
  // Name-based velocity for MA EI lines (no item codes) and cross-source names.
  const nameVelocity = new Map<string, { qty: number; lastSale: Date | null }>();
  for (const s of velocityRows) {
    const key = (s.itemName ?? "").trim().toLowerCase();
    if (!key) continue;
    const e = nameVelocity.get(key) ?? { qty: 0, lastSale: null };
    e.qty += Number(s.qty ?? 0);
    if (s.lastSale && (!e.lastSale || s.lastSale > e.lastSale)) e.lastSale = s.lastSale;
    nameVelocity.set(key, e);
  }

  const items: Array<{
    itemCode: string; itemName: string | null; qty: number; unitPrice: number | null;
    amount: number | null; avgDailySales: number; coverDays: number | null;
    lastSale: Date | null; flag: "stockout" | "low" | "overstock" | "slow" | "ok";
    minQty: number | null; maxQty: number | null; principal: string | null;
  }> = [];

  for (const s of snaps) {
    const v = velocity.get(s.itemCode) ??
      nameVelocity.get((s.itemName ?? "").trim().toLowerCase()) ?? { qty: 0, lastSale: null };
    const avgDaily = v.qty / velocityDays;
    const coverDays = avgDaily > 0 ? s.qty / avgDaily : s.qty > 0 ? 9999 : 0;
    const lvl = levels.get(s.itemCode);
    const minQty = lvl?.minQty ?? null;
    const maxQty = lvl?.maxQty ?? null;
    let flag: (typeof items)[number]["flag"] = "ok";
    if (s.qty <= 0) flag = "stockout";
    else if (minQty != null && s.qty < minQty) flag = "low";
    else if (coverDays > 90) flag = "overstock";
    else if (v.qty === 0 || (v.lastSale && asOf.getTime() - v.lastSale.getTime() > 60 * 86400000))
      flag = "slow";
    items.push({
      itemCode: s.itemCode, itemName: s.itemName, qty: s.qty,
      unitPrice: s.unitPrice, amount: s.amount,
      avgDailySales: Math.round(avgDaily * 100) / 100,
      coverDays: coverDays === 9999 ? null : Math.round(coverDays * 10) / 10,
      lastSale: v.lastSale, flag, minQty, maxQty, principal: lvl?.principal ?? null,
    });
  }

  const flagCount = (f: string) => items.filter((i) => i.flag === f);
  const matchesSearch = <T extends { itemCode?: string | null; itemName?: string | null; principal?: string | null; supplierName?: string | null; batchNo?: string | null }>(item: T) =>
    !search || `${item.itemCode ?? ""} ${item.itemName ?? ""} ${item.principal ?? ""} ${item.supplierName ?? ""} ${item.batchNo ?? ""}`.toLowerCase().includes(search);
  const byValue = (list: typeof items) =>
    list.filter(matchesSearch).sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
  const window = <T>(list: T[]): T[] => list.slice((page - 1) * limit, page * limit);
  const searchedFlagCount = (f: string) => flagCount(f).filter(matchesSearch).length;

  // Reorder: below Min level, or cover < 14 days while still selling.
  // Suggested qty fills to Max when known, else 30 days of velocity.
  const reorderAll = items
    .filter((i) => i.flag === "low" || (i.flag !== "stockout" && i.coverDays != null && i.coverDays < 14 && i.avgDailySales > 0))
    .map((i) => {
      const base = i.maxQty ?? i.avgDailySales * 30;
      const suggestedQty = Math.max(0, Math.ceil(base - i.qty));
      return { ...i, suggestedQty: suggestedQty === 0 && i.flag === "low" ? Math.max(1, Math.ceil((i.minQty ?? 0) - i.qty)) : suggestedQty };
    })
    .filter(matchesSearch).sort((a, b) => (a.coverDays ?? 0) - (b.coverDays ?? 0));

  // Expiry buckets (lots + store-in batches with exp date in the next
  // 180 days or past). Store-in rows are name-matched (no item codes).
  const expiryAll = [
    ...expiryLots.map((l) => {
      const days = l.expDate ? Math.floor((l.expDate.getTime() - asOf.getTime()) / 86400000) : null;
      return {
        itemCode: l.itemCode, itemName: l.itemName ?? levels.get(l.itemCode)?.name ?? null,
        expDate: l.expDate, balance: l.balance, daysToExpiry: days,
        bucket: days == null ? "nodate" : days < 0 ? "expired" : days <= 90 ? "90d" : "180d",
        source: "lot" as const, batchNo: null as string | null, supplierName: null as string | null,
      };
    }),
    ...storeInLots.map((l) => {
      const days = l.expDate ? Math.floor((l.expDate.getTime() - asOf.getTime()) / 86400000) : null;
      return {
        itemCode: "",
        itemName: l.itemName,
        expDate: l.expDate, balance: l.qtyOnHand, daysToExpiry: days,
        bucket: days == null ? "nodate" : days < 0 ? "expired" : days <= 90 ? "90d" : "180d",
        source: "storein" as const, batchNo: l.batchNo, supplierName: l.supplierName,
      };
    }),
  ].sort((a, b) => (a.expDate?.getTime() ?? Infinity) - (b.expDate?.getTime() ?? Infinity));
  const expired = expiryAll.filter((e) => e.bucket === "expired");
  const near90 = expiryAll.filter((e) => e.bucket === "90d");
  return {
    totals: {
      skus: items.length,
      value: items.reduce((s, i) => s + (i.amount ?? 0), 0),
      stockout: flagCount("stockout").length,
      belowMin: flagCount("low").length,
      overstock: flagCount("overstock").length,
      slow: flagCount("slow").length,
      reorder: reorderAll.length,
      expired: expired.length,
      expiring90: near90.length,
    },
    page, limit,
    filteredTotals: {
      stockout: searchedFlagCount("stockout"), belowMin: searchedFlagCount("low"), overstock: searchedFlagCount("overstock"), slow: searchedFlagCount("slow"), reorder: reorderAll.length,
    },
    stockout: window(byValue(flagCount("stockout"))),
    belowMin: window(byValue(flagCount("low"))),
    overstock: window(byValue(flagCount("overstock"))),
    slowMoving: window(byValue(flagCount("slow"))),
    // Reorder candidates: below Min or cover < 14 days and still selling.
    reorder: reorderAll.slice((page - 1) * limit, page * limit),
    expired: expired.filter(matchesSearch).slice(0, 100),
    expiring: [...expired, ...near90, ...expiryAll.filter((e) => e.bucket === "180d")].filter(matchesSearch),
  };
  });
  return NextResponse.json(data, { headers: { "X-Cache": hit ? "HIT" : "MISS" } });
}
