-- @param {String} $1:userId
-- @param {DateTime} $2:start
-- @param {DateTime} $3:end
SELECT COALESCE(NULLIF(TRIM(tsp_area), ''), 'Unknown') AS area,
          COALESCE(SUM(amount), 0)::double precision AS amount, COUNT(*)::bigint AS lines
        FROM sales_line
        WHERE user_id = $1 AND deleted_at IS NULL
          AND sale_date >= $2 AND sale_date < $3
        GROUP BY 1 ORDER BY amount DESC LIMIT 20
