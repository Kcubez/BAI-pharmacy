# Analytics SQL strategy

Use Prisma model methods for CRUD and straightforward aggregates. Use TypedSQL
for reports with a stable query structure, even when user IDs, dates, limits or
status arrays change. Use parameterized `Prisma.sql` with `$queryRaw` when the UI
changes predicates, selected columns or ordering at runtime.

The pharmacy sales analysis, team reports, overview aggregates and inventory KPI
summary now use TypedSQL queries in `prisma/sql/`. Inputs and result types are generated
into `src/generated/prisma/sql`; application code calls `$queryRawTyped`.
Inventory pages and AR/AP dashboards retain dynamically composed SQL.

Add unique `@param` aliases to SQL files so generated TypeScript parameter names
do not collide. Keep user scoping and `deleted_at IS NULL` in every domain query.
Do not interpolate user-selected identifiers or SQL text.

```sh
npm run db:generate
npm test
MEASURE_INVENTORY=1 npm test -- tests/inventory-database.test.ts tests/typed-analytics-database.test.ts
```

`db:generate`, `postinstall` and `build` run `prisma generate --sql`. They require
the `DIRECT_URL` from `prisma.config.ts` to point at a reachable database with the
matching schema. Configure this in CI/deployment as well as locally. Generation
introspects SQL types; it does not push schema changes or write report data.
Generated files remain ignored by Git and are recreated before builds.

This change adds no database tables and needs no `prisma db push`. Dashboard
summary tables/import upserts remain a separate performance phase.
