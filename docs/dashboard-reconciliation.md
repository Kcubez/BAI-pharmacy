# Dashboard calculation reconciliation

Read-only reconciliation on 2026-10-12 found one active pharmacy inventory owner.
The database has sales in May–July 2026; October has no sales records.
Displayed MMK values are rounded to whole numbers by the UI.

Corrected rules:

- Stock-out counts select the latest active snapshot per item at or before the
  current month, then test `qty <= 0`. Dashboard, Attention queue and Smart
  Suggestions now count SKUs, rather than historical snapshot rows. Verified
  against real data: **113**, previously 158 on the dashboard and 200 in suggestions.
- Monthly suggestions use UTC `[month start, next month start)` boundaries.
  June sales reconcile to **1,034,577,057.11 MMK**, excluding July sales.
- Month/year comparisons use previous calendar months/years. Overall growth
  compares the last 30 days with the preceding 30 days, while overall KPI totals
  continue to show all-time amounts. The UI labels the comparison accordingly.
- A zero previous-sales baseline produces no percentage (`null`, displayed as
  `—`), rather than invented 0% or 100% growth.
- The former Cash Net card now shows **Collection − Purchases** in every period.
  It is an invoice comparison, not actual cash/bank balance; the model does not
  contain a payment ledger sufficient to calculate that balance.
- Purchase/AR amount fallbacks operate per invoice. Overdue supplier suggestions
  aggregate all qualifying invoices before choosing the highest balance; they
  include due-date-based overdue balances, matching Attention queue criteria.
- Calculation cache keys were bumped so old summaries/suggestions are not reused.

Verification:

```sh
npm test
MEASURE_INVENTORY=1 npm test -- tests/dashboard-database.test.ts --disableConsoleIntercept
npm run build
```

Database regression fixtures are read-only CTEs that shadow physical tables. They
cover historical/future/deleted/other-user snapshots, the next-month sales boundary,
and invoices with mixed null/non-null net amounts. No imported records were modified.
