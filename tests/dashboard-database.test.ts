// @vitest-environment node
import { expect, it } from "vitest";
import { Pool } from "pg";
import { loadEnvConfig } from "@next/env";
import { pharmacyOverviewTotals, pharmacyStockoutCount, pharmacyMonthlyCollections } from "@/generated/prisma/sql";

it.skipIf(process.env.MEASURE_INVENTORY !== "1")("reconciles corrected dashboard counts and verifies mixed amount fallback without writes", async () => {
  loadEnvConfig(process.cwd());
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  // Prisma encodes timestamp-without-time-zone inputs in UTC; pg Date encoding
  // depends on local timezone. Use ISO strings to match application semantics.
  const run = (sql: string, values: readonly unknown[]) => pool.query(sql, values.map(value => value instanceof Date ? value.toISOString() : value));
  try {
    const userId = (await pool.query("SELECT user_id FROM stock_snapshot WHERE deleted_at IS NULL GROUP BY user_id ORDER BY count(*) DESC LIMIT 1")).rows[0]?.user_id;
    expect(userId).toBeTruthy();
    const now = new Date();
    const start = new Date("2026-06-01"), end = new Date("2026-07-01");
    const overview = pharmacyOverviewTotals(userId, start, end, now, new Date(now.getTime()+90*86400000));
    const totals = (await run(overview.sql, overview.values)).rows[0];
    const stockout = pharmacyStockoutCount(userId, now.getUTCFullYear(), now.getUTCMonth()+1);
    expect(Number((await run(stockout.sql, stockout.values)).rows[0].n)).toBe(totals.stockout);
    const reference = (await run(`WITH latest AS (
      SELECT DISTINCT ON(item_code) qty FROM stock_snapshot WHERE user_id=$1 AND deleted_at IS NULL
        AND (year,month)<=($2,$3) ORDER BY item_code,year DESC,month DESC,id DESC
    ) SELECT count(*)::integer AS n FROM latest WHERE qty<=0`, [userId,now.getUTCFullYear(),now.getUTCMonth()+1])).rows[0];
    expect(totals.stockout).toBe(reference.n);
    console.log(`Reconciled current stock-out SKUs: ${totals.stockout}; June sales: ${totals.sales}`);
    const fixture = `WITH stock_snapshot(id,item_code,qty,amount,user_id,deleted_at,year,month) AS (
      VALUES ('old','A',0::float8,0::float8,'fixture',NULL::timestamp,2026,5),
        ('new','A',10,100,'fixture',NULL,2026,6), ('out','B',0,0,'fixture',NULL,2026,6),
        ('future','A',0,0,'fixture',NULL,2027,1), ('deleted','D',0,0,'fixture','2026-01-01'::timestamp,2026,6),
        ('other','E',0,0,'other',NULL,2026,6)
    ), sales_line(amount,user_id,deleted_at,sale_date) AS (
      VALUES (100::float8,'fixture',NULL::timestamp,'2026-06-01'::timestamp),
        (200,'fixture',NULL,'2026-07-01'::timestamp)
    ), receivable(net_amount,amount,user_id,deleted_at,paid_date,bank) AS (
      VALUES (80::float8,100::float8,'fixture',NULL::timestamp,'2026-06-01'::timestamp,'Test bank'),
        (NULL,20,'fixture',NULL,'2026-06-02'::timestamp,'Test bank')
    ), purchase_invoice(net_amount,amount,user_id,deleted_at,invoice_date) AS (
      SELECT net_amount,amount,user_id,deleted_at,paid_date FROM receivable
    ), expiry_lot(user_id,deleted_at,exp_date) AS (
      SELECT NULL::text,NULL::timestamp,NULL::timestamp WHERE false
    ), `;
    const query = pharmacyOverviewTotals("fixture", start, end, new Date("2026-06-30"), new Date("2026-09-30"));
    const result = (await run(fixture+query.sql.replace(/^WITH /,""),query.values)).rows[0];
    expect(result).toMatchObject({ sales: 100, salesLines: 1, stockout: 1, stockSkus: 2, stockValue: 100,
      collected: 100, purchased: 100, collectionInvoices: 2, purchaseInvoices: 2 });
    const counted = pharmacyStockoutCount("fixture",2026,6);
    expect(Number((await run(fixture+counted.sql.replace(/^WITH /,""),counted.values)).rows[0].n)).toBe(1);
    expect(result.collectionByBank).toEqual([{ bank: "Test bank", amount: 100, invoices: 2 }]);
    const monthly = pharmacyMonthlyCollections("fixture",start);
    expect((await run(fixture.replace(/,\s*$/," ")+monthly.sql,monthly.values)).rows[0])
      .toMatchObject({ month: "2026-06", total: 100 });
  } finally { await pool.end(); }
}, 120000);
