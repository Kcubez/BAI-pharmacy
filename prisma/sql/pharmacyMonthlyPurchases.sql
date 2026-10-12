-- @param {String} $1:userId
-- @param {DateTime} $2:since
SELECT to_char(invoice_date, 'YYYY-MM') AS month, COALESCE(SUM(COALESCE(net_amount, amount)), 0) AS total
          FROM purchase_invoice
          WHERE user_id = $1 AND deleted_at IS NULL AND invoice_date >= $2
          GROUP BY 1
