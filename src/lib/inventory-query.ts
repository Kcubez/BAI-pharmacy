import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { pharmacyInventorySummary } from "@/generated/prisma/sql";

export const inventoryOptions = z.object({
  tab: z.enum(["reorder", "belowMin", "stockout", "overstock", "slowMoving", "expiring"]).default("reorder"),
  sort: z.enum(["cover", "value", "qty"]).default("cover"),
});

export function inventoryQueries(input: z.infer<typeof inventoryOptions> & {
  userId: string; asOf: Date; since: Date; until: Date; page: number; limit: number; search: string;
}) {
  const { userId, asOf, since, until, tab, sort, page, limit } = input;
  const days = Math.max(1, Math.round((until.getTime() - since.getTime()) / 86400000));
  const search = `%${input.search.replace(/[\\%_]/g, "\\$&")}%`;
  const ctes = Prisma.sql`WITH snapshots AS (
    SELECT item_code,item_name,qty,unit_price,amount
    FROM stock_snapshot WHERE user_id=${userId} AND deleted_at IS NULL
      AND (year,month) = (
        SELECT year,month FROM stock_snapshot WHERE user_id=${userId} AND deleted_at IS NULL
          AND (year,month)<=(${asOf.getUTCFullYear()},${asOf.getUTCMonth()+1})
          AND (make_date(year,month,1) + interval '1 month - 1 day') <= ${asOf}::date
        ORDER BY year DESC,month DESC LIMIT 1
      )
  ), sales AS MATERIALIZED (
    SELECT item_code,lower(trim(item_name)) AS name,sale_qty,sale_date FROM sales_line
    WHERE user_id=${userId} AND deleted_at IS NULL AND sale_date>=${since} AND sale_date<${until}
  ), codes AS (
    SELECT item_code,COALESCE(sum(sale_qty),0) AS sold,max(sale_date) AS last_sale
    FROM sales WHERE item_code IS NOT NULL AND item_code<>'' GROUP BY item_code
  ), names AS (
    SELECT name,COALESCE(sum(sale_qty),0) AS sold,max(sale_date) AS last_sale
    FROM sales WHERE name IS NOT NULL AND name<>'' GROUP BY name
  ), base AS (
    SELECT s.*,p.min_qty,p.max_qty,p.principal,
      COALESCE(c.sold,n.sold,0)::double precision/${days} AS daily,
      CASE WHEN c.item_code IS NOT NULL THEN c.last_sale ELSE n.last_sale END AS last_sale,
      COALESCE(c.sold,n.sold,0) AS sold
    FROM snapshots s LEFT JOIN pharma_product p ON p.item_code=s.item_code AND p.user_id=${userId} AND p.deleted_at IS NULL
    LEFT JOIN codes c ON c.item_code=s.item_code LEFT JOIN names n ON n.name=lower(trim(s.item_name))
  ), covers AS (
    SELECT *,CASE WHEN daily>0 THEN qty/daily WHEN qty>0 THEN 9999 ELSE 0 END AS cover FROM base
  ), flags AS (
    SELECT *,CASE WHEN qty<=0 THEN 'stockout' WHEN qty<min_qty THEN 'low'
      WHEN cover>90 THEN 'overstock' WHEN sold=0 OR last_sale<${new Date(asOf.getTime()-60*86400000)} THEN 'slow' ELSE 'ok' END AS flag,
      round(daily::numeric,2)::double precision AS rounded_daily,
      CASE WHEN cover=9999 THEN NULL ELSE round(cover::numeric,1)::double precision END AS rounded_cover FROM covers
  ), inventory AS (
    SELECT *, (flag='low' OR (flag<>'stockout' AND rounded_cover<14 AND rounded_daily>0)) AS reorder FROM flags
  ), expiry AS (
    SELECT 'lot:'||e.id AS id,e.item_code,COALESCE(e.item_name,p.item_name) AS item_name,e.exp_date,e.balance,
      'lot' AS source,NULL::text AS batch_no,NULL::text AS supplier_name
    FROM expiry_lot e LEFT JOIN pharma_product p ON p.item_code=e.item_code AND p.user_id=${userId} AND p.deleted_at IS NULL
    WHERE e.user_id=${userId} AND e.deleted_at IS NULL AND e.exp_date<${new Date(asOf.getTime()+180*86400000)}
    UNION ALL
    SELECT 'storein:'||id,'',item_name,exp_date,qty_on_hand,'storein',batch_no,supplier_name
    FROM store_in_lot WHERE user_id=${userId} AND deleted_at IS NULL AND exp_date<${new Date(asOf.getTime()+180*86400000)}
  ), expiry_days AS (
    SELECT *,floor(extract(epoch FROM (exp_date-${asOf}::timestamp))/86400)::integer AS days FROM expiry
  )`;
  const summary = pharmacyInventorySummary(userId, asOf.getUTCFullYear(), asOf.getUTCMonth()+1, since, until, days, new Date(asOf.getTime()-60*86400000), new Date(asOf.getTime()+180*86400000), asOf);
  const predicates = { reorder: Prisma.sql`reorder`,belowMin: Prisma.sql`flag='low'`,stockout: Prisma.sql`flag='stockout'`,
    overstock: Prisma.sql`flag='overstock'`,slowMoving: Prisma.sql`flag='slow'`,expiring: Prisma.sql`TRUE` };
  const expiry = tab==='expiring';
  const order = expiry ? (sort==='qty' ? Prisma.sql`balance DESC NULLS LAST,exp_date,id` : Prisma.sql`exp_date,id`)
    : sort==='value' ? Prisma.sql`amount DESC NULLS LAST,item_code` : sort==='qty' ? Prisma.sql`qty DESC,item_code` : Prisma.sql`rounded_cover ASC NULLS LAST,item_code`;
  const projection = expiry ? Prisma.sql`item_code AS "itemCode",item_name AS "itemName",exp_date AS "expDate",balance,
    days AS "daysToExpiry",source,batch_no AS "batchNo",supplier_name AS "supplierName",
    CASE WHEN days<0 THEN 'expired' WHEN days<=90 THEN '90d' ELSE '180d' END AS bucket`
    : Prisma.sql`item_code AS "itemCode",item_name AS "itemName",qty,unit_price AS "unitPrice",amount,
      rounded_daily AS "avgDailySales",rounded_cover AS "coverDays",last_sale AS "lastSale",flag,
      min_qty AS "minQty",max_qty AS "maxQty",principal,
      CASE WHEN flag='low' AND COALESCE(max_qty,rounded_daily*30)-qty<=0 THEN greatest(1,ceil(COALESCE(min_qty,0)-qty))
      ELSE greatest(0,ceil(COALESCE(max_qty,rounded_daily*30)-qty)) END AS "suggestedQty"`;
  const selected = Prisma.sql`${ctes}, selected AS (
    SELECT * FROM ${expiry ? Prisma.sql`expiry_days` : Prisma.sql`inventory`} WHERE ${predicates[tab]}
      AND ${expiry ? Prisma.sql`concat_ws(' ',item_code,item_name,batch_no,supplier_name)` : Prisma.sql`concat_ws(' ',item_code,item_name,principal)`} ILIKE ${search}
  ), page_rows AS (SELECT ${projection} FROM selected ORDER BY ${order} LIMIT ${limit} OFFSET ${(page-1)*limit})
  SELECT (SELECT count(*)::integer FROM selected) AS total,
    COALESCE((SELECT jsonb_agg(to_jsonb(page_rows)) FROM page_rows),'[]'::jsonb) AS rows`;
  return { summary, selected };
}
