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
  SELECT item_code, amount, qty, year, month FROM stock_snapshot
  WHERE user_id=$1 AND deleted_at IS NULL
    AND (year,month) = (
      SELECT year,month FROM stock_snapshot
      WHERE user_id=$1 AND deleted_at IS NULL
        AND (make_date(year,month,1) + interval '1 month - 1 day') <= $4::date
      ORDER BY year DESC,month DESC LIMIT 1
    )
)
SELECT COALESCE(sales.amount,0)::double precision AS sales,
  sales.lines AS "salesLines", COALESCE(collected.amount,0)::double precision AS collected,
  collected.lines AS "collectionInvoices",
  COALESCE(purchased.amount,0)::double precision AS purchased,
  purchased.lines AS "purchaseInvoices",
  (SELECT COALESCE(sum(amount),0)::double precision FROM stock) AS "stockValue",
  (SELECT count(*)::integer FROM stock) AS "stockSkus",
  (SELECT to_char(make_date(year,month,1),'YYYY-MM') FROM stock LIMIT 1) AS "stockPeriod",
  (SELECT COALESCE(jsonb_agg(b),'[]'::jsonb) FROM (
    SELECT bank, COALESCE(sum(COALESCE(net_amount,amount,0)),0)::double precision AS amount,
      count(*)::integer AS invoices FROM receivable
    WHERE user_id=$1 AND deleted_at IS NULL AND paid_date >= $2 AND paid_date < $3 GROUP BY bank
  ) b) AS "collectionByBank",
  (SELECT count(*)::integer FROM stock WHERE qty<=0) AS stockout,
  (SELECT count(*)::integer FROM expiry_lot WHERE user_id=$1 AND deleted_at IS NULL AND exp_date >= $4 AND exp_date < $5) AS "expiring90"
FROM sales CROSS JOIN collected CROSS JOIN purchased
