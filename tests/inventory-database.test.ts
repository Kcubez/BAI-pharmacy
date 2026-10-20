// @vitest-environment node
import { expect, it } from "vitest";
import { Pool } from "pg";
import { loadEnvConfig } from "@next/env";
import { inventoryQueries } from "@/lib/inventory-query";

// Read-only verification; no fixtures are written into the application database.
it.skipIf(process.env.MEASURE_INVENTORY !== "1")("executes real inventory queries and records query plans", async () => {
  loadEnvConfig(process.cwd());
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const owner = await pool.query("SELECT user_id FROM stock_snapshot WHERE deleted_at IS NULL GROUP BY user_id ORDER BY count(*) DESC LIMIT 1");
    expect(owner.rows.length, "Representative inventory data is required").toBe(1);
    const now = new Date();
    // CTE fixtures shadow physical tables: classification coverage without writes.
    const fixtures = `WITH stock_snapshot(id,item_code,item_name,qty,unit_price,amount,user_id,deleted_at,year,month) AS (
      VALUES ('1','A','A',0::float8,1::float8,0::float8,'fixture',NULL::timestamp,2026,9),
        ('2','B','B',2,1,2,'fixture',NULL,2026,9),
        ('3','C','C',1000,1,1000,'fixture',NULL,2026,9),
        ('4','D','D',10,1,10,'fixture',NULL,2026,9),
        ('5','E','E',5,1,5,'fixture',NULL,2026,9),
        ('6','X','X',0,1,0,'other-owner',NULL,2026,9),
        ('7','Y','Y',0,1,0,'fixture','2026-01-01'::timestamp,2026,9)
    ), pharma_product(item_code,item_name,min_qty,max_qty,principal,user_id,deleted_at) AS (
      VALUES ('B','B',5::float8,20::float8,NULL::text,'fixture',NULL::timestamp)
    ), sales_line(item_code,item_name,sale_qty,sale_date,user_id,deleted_at) AS (
      VALUES ('C','C',90::float8,'2026-09-30'::timestamp,'fixture',NULL::timestamp),
        ('D','D',90,'2026-07-04'::timestamp,'fixture',NULL),
        (NULL,'E',90,'2026-09-30'::timestamp,'fixture',NULL)
    ), expiry_lot(id,item_code,item_name,exp_date,balance,user_id,deleted_at) AS (
      SELECT NULL::text,NULL::text,NULL::text,NULL::timestamp,NULL::float8,NULL::text,NULL::timestamp WHERE false
    ), store_in_lot(id,item_name,exp_date,qty_on_hand,batch_no,supplier_name,user_id,deleted_at) AS (
      SELECT NULL::text,NULL::text,NULL::timestamp,NULL::float8,NULL::text,NULL::text,NULL::text,NULL::timestamp WHERE false
    ), `;
    const fixtureInput = { userId: "fixture", asOf: new Date("2026-10-01"), since: new Date("2026-07-03"),
      until: new Date("2026-10-01"), page: 1, limit: 10, search: "", sort: "cover" as const };
    for (const [tab, expected] of [["stockout","A"],["belowMin","B"],["overstock","C"],["slowMoving","D"]] as const) {
      const query = inventoryQueries({ ...fixtureInput, tab }).selected;
      const result = await pool.query(fixtures + query.text.replace(/^WITH /, ""), query.values);
      expect(result.rows[0].rows.map((row: { itemCode: string }) => row.itemCode)).toEqual([expected]);
    }
    const reorder = inventoryQueries({ ...fixtureInput, tab: "reorder" }).selected;
    const candidates = (await pool.query(fixtures + reorder.text.replace(/^WITH /, ""), reorder.values)).rows[0].rows;
    expect(candidates.map((row: { itemCode: string }) => row.itemCode).sort()).toEqual(["B","D","E"]);
    expect(candidates.find((row: { itemCode: string }) => row.itemCode === "B").suggestedQty).toBe(18);
    const searched = inventoryQueries({ ...fixtureInput, tab: "reorder", search: "E" }).selected;
    const searchedResult = (await pool.query(fixtures + searched.text.replace(/^WITH /, ""), searched.values)).rows[0];
    expect(searchedResult.total).toBe(1);
    expect(searchedResult.rows[0].itemCode).toBe("E");
    const paged = inventoryQueries({ ...fixtureInput, tab: "reorder", sort: "qty", page: 2, limit: 1 }).selected;
    const pagedResult = (await pool.query(fixtures + paged.text.replace(/^WITH /, ""), paged.values)).rows[0];
    expect(pagedResult.total).toBe(3);
    expect(pagedResult.rows.map((row: { itemCode: string }) => row.itemCode)).toEqual(["E"]);
    const empty = inventoryQueries({ ...fixtureInput, tab: "reorder", page: 99 }).selected;
    expect((await pool.query(fixtures + empty.text.replace(/^WITH /, ""), empty.values)).rows[0]).toEqual({ total: 3, rows: [] });
    const summary = inventoryQueries({ ...fixtureInput, tab: "reorder" }).summary;
    expect((await pool.query(fixtures + summary.sql.replace(/^WITH /, ""), [...summary.values])).rows[0])
      .toEqual({ stockPeriod: "2026-09", skus: 5, value: 1017, stockout: 1, belowMin: 1, overstock: 1, slow: 1, reorder: 3, expired: 0, expiring90: 0 });
    for (const tab of ["stockout", "reorder", "expiring"] as const) {
      const queries = inventoryQueries({ userId: owner.rows[0].user_id, tab, sort: "cover", page: 1, limit: 10,
        search: "", asOf: now, since: new Date(now.getTime()-90*86400000), until: now });
      for (const [kind, query] of Object.entries(queries)) {
        const sql = "text" in query ? query.text : query.sql;
        const result = await pool.query(sql, [...query.values]);
        expect(result.rows.length).toBe(1);
        if (kind === "selected") expect(result.rows[0].rows.length).toBeLessThanOrEqual(10);
        const plan = await pool.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${sql}`, [...query.values]);
        console.log(`${tab}/${kind}\n${plan.rows.map(row => row["QUERY PLAN"]).join("\n")}`);
      }
    }
  } finally { await pool.end(); }
}, 120000);
