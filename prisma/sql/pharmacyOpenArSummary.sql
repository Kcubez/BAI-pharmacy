-- @param {DateTime} $1:asOf
-- @param {String} $2:userId
SELECT COALESCE(NULLIF(TRIM(company_name), ''), 'Unknown') AS company,
          COALESCE(SUM(COALESCE(net_amount,amount,0)), 0)::double precision AS outstanding,
          COALESCE(SUM(CASE WHEN payment_status = 'overdue' OR due_date < $1 THEN COALESCE(net_amount,amount,0) ELSE 0 END), 0)::double precision AS overdue,
          COUNT(*)::bigint AS invoices
        FROM receivable
        WHERE user_id = $2 AND deleted_at IS NULL
          AND payment_status = ANY($3::text[])
        GROUP BY 1
