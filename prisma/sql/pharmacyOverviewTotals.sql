-- @param {String} $1:userId
-- @param {DateTime} $2:start
-- @param {DateTime} $3:end
-- @param {DateTime} $4:asOf
-- @param {DateTime} $5:expiryBefore
WITH sales AS (
  SELECT sum(amount) AS amount, count(*)::integer AS lines FROM sales_line
  WHERE user_id=$1 AND deleted_at IS NULL AND sale_date >= $2 AND sale_date < $3
), collected AS (
  SELECT sum(COALESCE(net_amount,amount,0)) AS amount, count(*)::integer AS lines FROM receivable
  WHERE user_id=$1 AND deleted_at IS NULL AND paid_date >= $2 AND paid_date < $3
), purchased AS (
  SELECT sum(COALESCE(net_amount,amount,0)) AS amount, count(*)::integer AS lines FROM purchase_invoice
  WHERE user_id=$1 AND deleted_at IS NULL AND invoice_date >= $2 AND invoice_date < $3
), stock AS MATERIALIZED (
  SELECT DISTINCT ON (item_code) item_code, amount, qty FROM stock_snapshot
  WHERE user_id=$1 AND deleted_at IS NULL
    AND (year,month)<=(extract(year FROM $4::timestamp)::int,extract(month FROM $4::timestamp)::int)
  ORDER BY item_code,year DESC,month DESC,id DESC
)
SELECT COALESCE(sales.amount,0)::double precision AS sales,
  sales.lines AS "salesLines", COALESCE(collected.amount,0)::double precision AS collected,
  collected.lines AS "collectionInvoices",
  COALESCE(purchased.amount,0)::double precision AS purchased,
  purchased.lines AS "purchaseInvoices",
  (SELECT COALESCE(sum(amount),0)::double precision FROM stock) AS "stockValue",
  (SELECT count(*)::integer FROM stock) AS "stockSkus",
  (SELECT COALESCE(jsonb_agg(b),'[]'::jsonb) FROM (
    SELECT bank, COALESCE(sum(COALESCE(net_amount,amount,0)),0)::double precision AS amount,
      count(*)::integer AS invoices FROM receivable
    WHERE user_id=$1 AND deleted_at IS NULL AND paid_date >= $2 AND paid_date < $3 GROUP BY bank
  ) b) AS "collectionByBank",
  (SELECT count(*)::integer FROM stock WHERE qty<=0) AS stockout,
  (SELECT count(*)::integer FROM expiry_lot WHERE user_id=$1 AND deleted_at IS NULL AND exp_date >= $4 AND exp_date < $5) AS "expiring90"
FROM sales CROSS JOIN collected CROSS JOIN purchased
