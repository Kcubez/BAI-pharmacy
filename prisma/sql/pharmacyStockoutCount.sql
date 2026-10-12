-- @param {String} $1:userId
-- @param {Int} $2:year
-- @param {Int} $3:month
WITH latest AS (
  SELECT DISTINCT ON(item_code) qty FROM stock_snapshot
  WHERE user_id=$1 AND deleted_at IS NULL AND (year,month)<=($2,$3)
  ORDER BY item_code,year DESC,month DESC,id DESC
)
SELECT count(*) AS n FROM latest WHERE qty<=0
