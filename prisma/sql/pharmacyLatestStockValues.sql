-- @param {String} $1:userId
SELECT amount FROM stock_snapshot
WHERE user_id=$1 AND deleted_at IS NULL AND (year,month) = (
  SELECT year,month FROM stock_snapshot WHERE user_id=$1 AND deleted_at IS NULL
  ORDER BY year DESC,month DESC LIMIT 1
)
