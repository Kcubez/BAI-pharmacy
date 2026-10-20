-- @param {String} $1:userId
-- @param {Int} $2:year
-- @param {Int} $3:month
-- @param {DateTime} $4:since
-- @param {DateTime} $5:until
-- @param {Float} $6:velocityDays
-- @param {DateTime} $7:slowBefore
-- @param {DateTime} $8:expiryBefore
-- @param {DateTime} $9:asOf
WITH snapshots AS (
    SELECT item_code,item_name,qty,unit_price,amount,year,month
    FROM stock_snapshot WHERE user_id=$1 AND deleted_at IS NULL
      AND (year,month) = (
        SELECT year,month FROM stock_snapshot WHERE user_id=$1 AND deleted_at IS NULL
          AND (year,month)<=($2,$3)
          AND (make_date(year,month,1) + interval '1 month - 1 day') <= $9::date
        ORDER BY year DESC,month DESC LIMIT 1
      )
  ), sales AS MATERIALIZED (
    SELECT item_code,lower(trim(item_name)) AS name,sale_qty,sale_date FROM sales_line
    WHERE user_id=$1 AND deleted_at IS NULL AND sale_date>=$4 AND sale_date<$5
  ), codes AS (
    SELECT item_code,COALESCE(sum(sale_qty),0) AS sold,max(sale_date) AS last_sale
    FROM sales WHERE item_code IS NOT NULL AND item_code<>'' GROUP BY item_code
  ), names AS (
    SELECT name,COALESCE(sum(sale_qty),0) AS sold,max(sale_date) AS last_sale
    FROM sales WHERE name IS NOT NULL AND name<>'' GROUP BY name
  ), base AS (
    SELECT s.*,p.min_qty,p.max_qty,p.principal,
      COALESCE(c.sold,n.sold,0)::double precision/$6 AS daily,
      CASE WHEN c.item_code IS NOT NULL THEN c.last_sale ELSE n.last_sale END AS last_sale,
      COALESCE(c.sold,n.sold,0) AS sold
    FROM snapshots s LEFT JOIN pharma_product p ON p.item_code=s.item_code AND p.user_id=$1 AND p.deleted_at IS NULL
    LEFT JOIN codes c ON c.item_code=s.item_code LEFT JOIN names n ON n.name=lower(trim(s.item_name))
  ), covers AS (
    SELECT *,CASE WHEN daily>0 THEN qty/daily WHEN qty>0 THEN 9999 ELSE 0 END AS cover FROM base
  ), flags AS (
    SELECT *,CASE WHEN qty<=0 THEN 'stockout' WHEN qty<min_qty THEN 'low'
      WHEN cover>90 THEN 'overstock' WHEN sold=0 OR last_sale<$7 THEN 'slow' ELSE 'ok' END AS flag,
      round(daily::numeric,2)::double precision AS rounded_daily,
      CASE WHEN cover=9999 THEN NULL ELSE round(cover::numeric,1)::double precision END AS rounded_cover FROM covers
  ), inventory AS (
    SELECT *, (flag='low' OR (flag<>'stockout' AND rounded_cover<14 AND rounded_daily>0)) AS reorder FROM flags
  ), expiry AS (
    SELECT 'lot:'||e.id AS id,e.item_code,COALESCE(e.item_name,p.item_name) AS item_name,e.exp_date,e.balance,
      'lot' AS source,NULL::text AS batch_no,NULL::text AS supplier_name
    FROM expiry_lot e LEFT JOIN pharma_product p ON p.item_code=e.item_code AND p.user_id=$1 AND p.deleted_at IS NULL
    WHERE e.user_id=$1 AND e.deleted_at IS NULL AND e.exp_date<$8
    UNION ALL
    SELECT 'storein:'||id,'',item_name,exp_date,qty_on_hand,'storein',batch_no,supplier_name
    FROM store_in_lot WHERE user_id=$1 AND deleted_at IS NULL AND exp_date<$8
  ), expiry_days AS (
    SELECT *,floor(extract(epoch FROM (exp_date-$9::timestamp))/86400)::integer AS days FROM expiry
  )
SELECT
 (SELECT to_char(make_date(year,month,1),'YYYY-MM') FROM snapshots LIMIT 1) AS "stockPeriod",
 (SELECT count(*)::integer FROM inventory) AS skus,
 (SELECT COALESCE(sum(amount),0)::double precision FROM inventory) AS value,
 (SELECT count(*)::integer FROM inventory WHERE flag='stockout') AS stockout,
 (SELECT count(*)::integer FROM inventory WHERE flag='low') AS "belowMin",
 (SELECT count(*)::integer FROM inventory WHERE flag='overstock') AS overstock,
 (SELECT count(*)::integer FROM inventory WHERE flag='slow') AS slow,
 (SELECT count(*)::integer FROM inventory WHERE reorder) AS reorder,
 (SELECT count(*)::integer FROM expiry_days WHERE days<0) AS expired,
 (SELECT count(*)::integer FROM expiry_days WHERE days BETWEEN 0 AND 90) AS "expiring90"
