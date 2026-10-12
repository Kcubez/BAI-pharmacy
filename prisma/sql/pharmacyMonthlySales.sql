-- @param {String} $1:userId
-- @param {DateTime} $2:start
-- @param {DateTime} $3:end
SELECT to_char(sale_date, 'YYYY-MM') AS month, COALESCE(SUM(amount), 0) AS total
          FROM sales_line
          WHERE user_id = $1 AND deleted_at IS NULL
            AND sale_date >= $2 AND sale_date < $3
          GROUP BY 1 ORDER BY 1
