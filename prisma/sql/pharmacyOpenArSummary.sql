-- @param {DateTime} $1:asOf
-- @param {String} $2:userId
-- @param {Boolean} $4:historical
-- asOf is an exclusive cutoff. Missing settlement history must not become a zero balance.
WITH eligible AS (
  SELECT *, ($4 AND (invoice_date IS NULL OR COALESCE(payment_status = 'partial', false) OR (COALESCE(payment_status = 'paid', false) AND paid_date IS NULL))) AS unavailable
  FROM receivable
  WHERE user_id = $2 AND deleted_at IS NULL
    AND (invoice_date < $1 OR invoice_date IS NULL)
)
SELECT COALESCE(NULLIF(TRIM(company_name), ''), 'Unknown') AS company,
  COALESCE(SUM(COALESCE(net_amount,amount,0)) FILTER (WHERE NOT unavailable),0)::double precision AS outstanding,
  COALESCE(SUM(COALESCE(net_amount,amount,0)) FILTER (WHERE NOT unavailable AND
    (due_date < $1 OR (NOT $4 AND payment_status = 'overdue'))),0)::double precision AS overdue,
  COUNT(*) FILTER (WHERE NOT unavailable)::bigint AS invoices,
  COUNT(*) FILTER (WHERE unavailable)::bigint AS unavailable
FROM eligible
WHERE unavailable OR ((payment_status = ANY($3::text[]) AND (paid_date IS NULL OR paid_date >= $1)) OR ($4 AND paid_date >= $1))
GROUP BY 1
