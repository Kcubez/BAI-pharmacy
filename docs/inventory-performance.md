# Inventory query measurements

Measured against the configured Supabase PostgreSQL database on 2026-10-12 using
`EXPLAIN (ANALYZE, BUFFERS)` with a representative owner, overall period,
90-day velocity, empty search, cover ordering and a 10-row page.
No application records were changed.

| Query | PostgreSQL execution time |
| --- | ---: |
| Inventory KPI summary | 13.269 ms |
| Stock-out count + page | 13.176 ms |
| Reorder count + page | 13.200 ms |
| Expiry count + page | 1.316 ms |

The snapshot scan visited 2,235 rows and produced 894 latest SKUs. The velocity
scan visited 940 sales lines. Stock-out matched 113 rows; reorder matched 23;
expiry matched 14. Each page returned at most 10 rows.

Observed plan nodes:

- Snapshot: `Index Scan stock_snapshot_user_id_item_code_idx` → incremental sort
  → unique. PostgreSQL preferred the existing index over the new composite index.
- Sales: `Index Scan sales_line_user_id_deleted_at_sale_date_idx`, with user,
  active-row and date-range index conditions.
- Expiry: `Index Scan expiry_lot_user_id_deleted_at_exp_date_idx`.
- Store-in: `Index Scan store_in_lot_user_id_deleted_at_exp_date_idx`.
- Products: sequential scan of 2,022 scoped rows followed by hash joins.
- Page: top-N sort + limit; count and page reuse the selected CTE.
- Expiry page: sales CTE was never executed; stock classification was omitted
  by the PostgreSQL planner.

These are warm database execution times, not API network latency or a measured
before/after speedup. No additional index was justified by this small dataset.
Re-measure after imports grow before adding partial/covering indexes.

Reproduce the read-only database integration check and full plans:

```sh
MEASURE_INVENTORY=1 npm test -- tests/inventory-database.test.ts --disableConsoleIntercept
```

Normal `npm test` skips the real-database check. Endpoint tests mock the database
and cache; Playwright tests mock session and inventory responses to verify the UI
request contract. Dashboard fact tables/import upserts remain a separate phase.
