// @vitest-environment node
import { expect, it } from "vitest";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { pharmacyOverviewTotals, pharmacySalesAnalysis, pharmacyTeamCollected, pharmacyTeamOutstanding, pharmacyTeamAreas,
  pharmacyLatestStockValues, pharmacyStockoutCount, pharmacyOpenArSummary, pharmacyOpenApSummary,
  pharmacyMonthlyCollections, pharmacyMonthlyPurchases, pharmacyMonthlySales } from "@/generated/prisma/sql";
import { OPEN_AP_STATUSES, OPEN_AR_STATUSES } from "@/lib/constants";

it.skipIf(process.env.MEASURE_INVENTORY !== "1")("executes TypedSQL through the Prisma adapter and preserves scoped totals", async () => {
  loadEnvConfig(process.cwd());
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const owner = await pool.query("SELECT user_id FROM sales_line WHERE deleted_at IS NULL GROUP BY user_id ORDER BY count(*) DESC LIMIT 1");
    expect(owner.rows.length).toBe(1);
    const userId: string = owner.rows[0].user_id;
    const start = new Date("1900-01-01"), end = new Date("2099-01-01"), now = new Date();
    const report = await db.$queryRawTyped(pharmacySalesAnalysis(userId, start, end, 10));
    const total = report.find(row => row.kind === "total");
    const expected = await db.salesLine.aggregate({ where: { userId, deletedAt: null, saleDate: { gte: start, lt: end } }, _sum: { amount: true, saleQty: true }, _count: true });
    expect(Number(total?.amount)).toBeCloseTo(expected._sum.amount ?? 0, 6);
    expect(Number(total?.qty)).toBeCloseTo(expected._sum.saleQty ?? 0, 6);
    expect(Number(total?.lines)).toBe(expected._count);
    expect(typeof total?.lines).toBe("bigint");
    const started = performance.now();
    const overview = (await db.$queryRawTyped(pharmacyOverviewTotals(userId, start, end, now, new Date(now.getTime()+90*86400000))))[0];
    console.log(`Consolidated overview totals round trip: ${Math.round(performance.now()-started)}ms`);
    expect(overview.sales).toBeCloseTo(expected._sum.amount ?? 0, 6);
    expect(overview.salesLines).toBe(expected._count);
    const collection = await db.receivable.aggregate({ where: { userId, deletedAt: null, paidDate: { gte: start, lt: end } }, _sum: { netAmount: true }, _count: true });
    const collectionRows = await db.receivable.findMany({ where: { userId, deletedAt: null, paidDate: { gte: start, lt: end } }, select: { netAmount: true, amount: true } });
    expect(overview.collected).toBeCloseTo(collectionRows.reduce((sum,row) => sum+(row.netAmount ?? row.amount ?? 0),0), 6);
    expect(overview.collectionInvoices).toBe(collection._count);
    const purchases = await db.purchaseInvoice.aggregate({ where: { userId, deletedAt: null, invoiceDate: { gte: start, lt: end } }, _sum: { netAmount: true, amount: true }, _count: true });
    const purchaseRows = await db.purchaseInvoice.findMany({ where: { userId, deletedAt: null, invoiceDate: { gte: start, lt: end } }, select: { netAmount: true, amount: true } });
    expect(overview.purchased).toBeCloseTo(purchaseRows.reduce((sum,row) => sum+(row.netAmount ?? row.amount ?? 0),0), 6);
    expect(overview.purchaseInvoices).toBe(purchases._count);
    const empty = await db.$queryRawTyped(pharmacySalesAnalysis("__nonexistent_analytics_owner__", start, end, 10));
    expect(empty).toHaveLength(1);
    expect(empty[0]).toMatchObject({ kind: "total", amount: 0, qty: 0, lines: BigInt(0) });
    await Promise.all([
      db.$queryRawTyped(pharmacyTeamCollected(userId, start, end)),
      db.$queryRawTyped(pharmacyTeamOutstanding(now, userId, OPEN_AR_STATUSES)),
      db.$queryRawTyped(pharmacyTeamAreas(userId, start, end)),
      db.$queryRawTyped(pharmacyLatestStockValues(userId)),
      db.$queryRawTyped(pharmacyStockoutCount(userId, now.getUTCFullYear(), now.getUTCMonth()+1)),
      db.$queryRawTyped(pharmacyOpenArSummary(now, userId, OPEN_AR_STATUSES)),
      db.$queryRawTyped(pharmacyOpenApSummary(now, userId, OPEN_AP_STATUSES)),
      db.$queryRawTyped(pharmacyMonthlyCollections(userId, start)),
      db.$queryRawTyped(pharmacyMonthlyPurchases(userId, start)),
      db.$queryRawTyped(pharmacyMonthlySales(userId, start, end)),
    ]);
  } finally {
    await db.$disconnect();
    await pool.end();
  }
}, 120000);
