-- @param {String} $1:userId
-- @param {DateTime} $2:start
-- @param {DateTime} $3:end
-- @param {Int} $4:topN
WITH base AS MATERIALIZED (
        SELECT principal, item_code, item_name, customer_name, channel, sale_date,
          COALESCE(amount, 0)::double precision AS amount,
          COALESCE(sale_qty, 0)::double precision AS qty,
          COALESCE(foc_qty, 0)::double precision AS foc,
          COALESCE(return_qty, 0)::double precision AS ret
        FROM sales_line
        WHERE user_id = $1 AND deleted_at IS NULL
          AND sale_date >= $2 AND sale_date < $3
      ),
      company AS (
        SELECT COALESCE(NULLIF(TRIM(principal), ''), 'Unknown') AS key,
          SUM(amount)::double precision AS amount, SUM(qty)::double precision AS qty, COUNT(*)::bigint AS lines
        FROM base GROUP BY 1 ORDER BY amount DESC LIMIT $4
      ),
      product AS (
        SELECT COALESCE(NULLIF(item_code, ''), NULLIF(item_name, ''), 'Unknown') AS key,
          MAX(item_name) AS name, SUM(amount)::double precision AS amount, SUM(qty)::double precision AS qty,
          SUM(foc)::double precision AS foc, SUM(ret)::double precision AS ret
        FROM base GROUP BY 1 ORDER BY amount DESC LIMIT $4
      ),
      customer AS (
        SELECT COALESCE(NULLIF(TRIM(customer_name), ''), 'Unknown') AS key,
          SUM(amount)::double precision AS amount, COUNT(*)::bigint AS lines
        FROM base GROUP BY 1 ORDER BY amount DESC LIMIT $4
      ),
      channel AS (
        SELECT channel AS key, SUM(amount)::double precision AS amount, COUNT(*)::bigint AS lines
        FROM base GROUP BY 1 ORDER BY amount DESC
      ),
      trend AS (
        SELECT to_char(sale_date, 'YYYY-MM') AS month, SUM(amount)::double precision AS amount
        FROM base GROUP BY 1 ORDER BY 1
      )
      SELECT 'total'::text AS kind, NULL::text AS key, NULL::text AS name, NULL::text AS month,
        COALESCE(SUM(amount), 0)::double precision AS amount, COALESCE(SUM(qty), 0)::double precision AS qty,
        0::double precision AS foc, 0::double precision AS ret, COUNT(*)::bigint AS lines
      FROM base
      UNION ALL SELECT 'company', key, NULL, NULL, amount, qty, 0::double precision, 0::double precision, lines FROM company
      UNION ALL SELECT 'product', key, name, NULL, amount, qty, foc, ret, 0::bigint FROM product
      UNION ALL SELECT 'customer', key, NULL, NULL, amount, 0::double precision, 0::double precision, 0::double precision, lines FROM customer
      UNION ALL SELECT 'channel', key, NULL, NULL, amount, 0::double precision, 0::double precision, 0::double precision, lines FROM channel
      UNION ALL SELECT 'trend', NULL, NULL, month, amount, 0::double precision, 0::double precision, 0::double precision, 0::bigint FROM trend
