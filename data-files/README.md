# data-files — Actual distributor workbooks (dev seed + owner demo)

Upload via **Pharmacy Import** page (auto-detect, zero-input). Folders group
files by decision domain — import in numeric order.

| Folder | Files | Answers demo question |
|---|---|---|
| `01-purchase/` | June/July/August Purchase Order And Invoice2026 + Purchase Order 6.7.8 (PO-only duplicate) | ⑤ Supplier payment priority (AP/Purchases) |
| `02-sales/` | june/july/august sales by items detail (MA EI + Mega) | ① Company health, ⑥ Target risk |
| `03-receivable/` | jun july aug receivable | ④ Customer AR follow-up |
| `04-stock/` | June,July,August 2026 Stock (snapshots) + JUNE/JULY/AUGUST 2026 STOCK (iStock movement) | ② Overstock, ③ Reorder qty |
| `05-lots-returns/` | STOCK BY PRICE (Min/Max) + Stock Status Exp Date (lots) + Exp Date Mega (lots) + EXP StoreIn List (name+batch lots) + RETURN QTY | ②/③ levels + near-expiry + returns |

> `Purchase Order 6.7.8.xlsx` duplicates the monthly PO sheets — safe to skip
> (importKey dedup skips it anyway).
