-- @param {String} $1:userId
-- @param {Int} $2:year
-- @param {Int} $3:month
WITH latest AS (
  SELECT qty FROM stock_snapshot
  WHERE user_id=$1 AND deleted_at IS NULL AND (year,month) = (
    SELECT year,month FROM stock_snapshot WHERE user_id=$1 AND deleted_at IS NULL
      AND (year,month)<=($2,$3) ORDER BY year DESC,month DESC LIMIT 1
  )
)
SELECT count(*) AS n FROM latest WHERE qty<=0
