-- @param {String} $1:userId
-- @param {DateTime} $2:start
-- @param {DateTime} $3:end
SELECT COALESCE(NULLIF(TRIM(salesperson), ''), 'Unknown') AS salesperson, COALESCE(SUM(COALESCE(net_amount,amount,0)), 0)::double precision AS collected,
          COUNT(*)::bigint AS "paidCount"
        FROM receivable
        WHERE user_id = $1 AND deleted_at IS NULL
          AND paid_date >= $2 AND paid_date < $3
        GROUP BY COALESCE(NULLIF(TRIM(salesperson), ''), 'Unknown')
