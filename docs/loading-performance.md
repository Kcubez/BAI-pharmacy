# Loading performance fixes

Read-only measurements on 2026-10-12 found a cold `SELECT 1` round trip of
3,261 ms, warm round trips of 430–571 ms, and Redis reads of 780–1,839 ms.
These include connection/network time; the prior ~13 ms inventory query plans
only measured execution inside PostgreSQL.

Changes:

- Development dashboard caching uses process-local storage without Redis reads.
  Cache entries expire, are capped at 500, and are invalidated by imports.
- Production retains Redis version checks for cross-instance invalidation, with
  a 150 ms per-cache-operation budget. Failed reads open a 30-second cooldown
  using bounded-TTL local fallback. During an outage, changes from another
  instance may remain invisible until recovery or local TTL expiration.
- Inventory and overview expose `Server-Timing` and `X-Cache` response headers.
  `db` is cold-cache database work; `data` includes cache lookup and database
  work. Parallel durations must not be added together.
- Overview replaces six reads with one TypedSQL totals query, combines target
  lookups, and starts independent reads together (previously sixteen
  reads across sequential batches). API calculations and response fields remain
  compatible. Real-database tests verify totals and invoice counts.
- Recommendations cache their result for five minutes, remove unused queries,
  and abort the entire Gemini call after two seconds, including retries.
  Failed/invalid responses use heuristics. This deadline applies to AI work,
  not the preceding database reads. Recommendations do not hold the global
  navigation/data loading bar open.
- Development reuses both the Prisma client and its pg pool across reloads.

The new consolidated overview totals query took **497 ms** for one real-database
round trip during verification. This is not a full authenticated page benchmark
or a guaranteed latency. External database/network delays still affect cold
requests; moving compute closer to the database is a deployment decision.

Production checks:

```sh
npm run build
npm run start
```

In the browser Network panel, compare the same API request twice within its TTL.
Check `X-Cache` and `Server-Timing` to distinguish cold DB work, auth and cache
overhead. Test AI failures separately; do not treat `/api/events` stream lifetime
as page loading time. Login rate limiting remains separate from optional caching.
