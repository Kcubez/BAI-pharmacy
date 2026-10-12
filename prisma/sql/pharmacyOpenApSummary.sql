-- @param {DateTime} $1:asOf
-- @param {String} $2:userId
SELECT COALESCE(SUM(COALESCE(net_amount, amount)), 0)::double precision AS outstanding,
          COALESCE(SUM(CASE WHEN status = 'overdue' OR due_date < $1 THEN COALESCE(net_amount, amount) ELSE 0 END), 0)::double precision AS overdue,
          COUNT(*)::bigint AS invoices
        FROM purchase_invoice
        WHERE user_id = $2 AND deleted_at IS NULL
          AND status = ANY($3::text[])
