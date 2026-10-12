-- @param {String} $1:userId
-- @param {DateTime} $2:asOf
SELECT COALESCE(NULLIF(trim(supplier_name),''),'Unknown') AS supplier,
  COALESCE(sum(COALESCE(net_amount,amount,0)),0)::double precision AS amount
FROM purchase_invoice
WHERE user_id=$1 AND deleted_at IS NULL AND status=ANY($3::text[])
  AND (status='overdue' OR due_date<$2)
GROUP BY 1 ORDER BY amount DESC,supplier LIMIT 1
