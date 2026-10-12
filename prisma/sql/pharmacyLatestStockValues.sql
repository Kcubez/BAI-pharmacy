-- @param {String} $1:userId
SELECT DISTINCT ON (item_code) amount FROM stock_snapshot
        WHERE user_id = $1 AND deleted_at IS NULL
        ORDER BY item_code, year DESC, month DESC
