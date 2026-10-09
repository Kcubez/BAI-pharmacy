import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notDeleted } from "@/lib/soft-delete";
import { ownedByUserOrAdmin } from "@/lib/tenant-scope";
import { elapsedRatio, parsePeriodParams, resolvePeriodRange, targetAnchor } from "@/lib/period-range";
import type { ResolvedPeriod } from "@/lib/period-range";
import { OPEN_AP_STATUSES, OPEN_AR_STATUSES } from "@/lib/constants";
import { Prisma } from "@/generated/prisma/client";
import { cached } from "@/lib/upstash";
import { NextRequest, NextResponse } from "next/server";

/** Target anchor for pharma: month/year/day resolve normally; overall and
 *  custom anchor to a real calendar month (current month, or the custom
 *  range's start month) so targets never land on junk rows like 1900-01. */
function pharmacyAnchor(resolved: ResolvedPeriod): { period: "month" | "year"; year: number; month: number } {
  if (resolved.period === "custom" && resolved.from) {
    const m = resolved.from.match(/^(\d{4})-(\d{2})-\d{2}$/);
    if (m) return { period: "month", year: Number(m[1]), month: Number(m[2]) };
  }
  if (resolved.period === "overall" || resolved.period === "custom") {
    const now = new Date();
    return { period: "month", year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  return targetAnchor(resolved);
}

/** Pacing ("Expected: ...") is only meaningful for bounded calendar periods.
 *  Overall/custom ranges show totals without time expectations. */
function paced(resolved: ResolvedPeriod): boolean {
  return resolved.period === "month" || resolved.period === "year" || resolved.period === "day";
}

export type PharmaKpiTone = "emerald" | "red" | "sky" | "amber" | "slate";

export interface PharmaKpi {
  current: number;
  target: number | null;
  expected: number | null;
  status: string;
  tone: PharmaKpiTone;
  progress: number;
}

type ArOpenSummary = { company: string; outstanding: number; overdue: number; invoices: bigint };
type ApOpenSummary = { outstanding: number; overdue: number; invoices: bigint };

function progressOf(current: number, target: number | null): number {
  if (!target || target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
}

/** Higher-is-better KPI (sales, collection). `showExpected=false` hides the
 *  pacing line for unbounded ranges (overall/custom). */
function trackKpi(current: number, target: number | null, ratio: number, showExpected = true): PharmaKpi {
  if (target == null || target <= 0) {
    return { current, target: null, expected: null, status: "Not Set", tone: "slate", progress: 0 };
  }
  const expected = showExpected ? Math.round(target * ratio) : null;
  if (current >= target) {
    return { current, target, expected, status: "Achieved", tone: "emerald", progress: 100 };
  }
  if (expected != null && current >= expected) {
    return { current, target, expected, status: "On Track", tone: "emerald", progress: progressOf(current, target) };
  }
  return { current, target, expected, status: "Below Target", tone: "red", progress: progressOf(current, target) };
}

/** Lower-is-better KPI (overdue AR/AP vs limit, purchases vs expense limit). */
function limitKpi(current: number, limit: number | null): PharmaKpi {
  if (limit == null || limit <= 0) {
    return { current, target: null, expected: null, status: "Not Set", tone: "slate", progress: 0 };
  }
  if (current <= limit) {
    return { current, target: limit, expected: limit, status: "On Track", tone: "emerald", progress: progressOf(current, limit) };
  }
  return { current, target: limit, expected: limit, status: "Over Limit", tone: "red", progress: 100 };
}

// GET /api/pharmacy/overview — CEO KPIs with target pacing (commerce-style).
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const cacheKey = `overview:${req.nextUrl.searchParams.toString()}`;
  const { data, hit } = await cached("pharmacy", session.user.id, cacheKey, 60, async () => {
    const resolved = parsePeriodParams(req.nextUrl.searchParams);
    const { start, end } = resolvePeriodRange(resolved);
    const showPacing = paced(resolved);
    const ratio = showPacing ? elapsedRatio(start, end) : 1;
    const anchor = pharmacyAnchor(resolved);
    const userWhere = ownedByUserOrAdmin(session);
    const inRange = { gte: start, lt: end };

    const [sales, collected, purchased, monthTarget, yearTarget] = await Promise.all([
      prisma.salesLine.aggregate({
        where: { ...userWhere, ...notDeleted, saleDate: inRange },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.receivable.aggregate({
        where: { ...userWhere, ...notDeleted, paidDate: inRange },
        _sum: { netAmount: true },
        _count: true,
      }),
      prisma.purchaseInvoice.aggregate({
        where: { ...userWhere, ...notDeleted, invoiceDate: inRange },
        _sum: { netAmount: true, amount: true },
        _count: true,
      }),
      prisma.periodTarget.findFirst({
        where: { userId: session.user.id, period: "month", year: anchor.year, month: anchor.month },
      }),
      prisma.periodTarget.findFirst({
        where: { userId: session.user.id, period: "year", year: anchor.year, month: 0 },
      }),
    ]);
    const target = monthTarget ?? yearTarget;

    // Latest snapshot value — one query: newest (year, month) row per item.
    const latestRows = await prisma.$queryRaw<Array<{ amount: number | null }>>(
      Prisma.sql`SELECT DISTINCT ON (item_code) amount FROM stock_snapshot
        WHERE user_id = ${session.user.id} AND deleted_at IS NULL
        ORDER BY item_code, year DESC, month DESC`,
    );
    const stockValue = latestRows.reduce((s, r) => s + (r.amount ?? 0), 0);
    const stockSkus = latestRows.length;

    const now = new Date();
    const salesTotal = sales._sum.amount ?? 0;
    const collectionTotal = collected._sum.netAmount ?? 0;
    const purchasesTotal = purchased._sum.netAmount ?? purchased._sum.amount ?? 0;

    // ── Decision signals: company health, bank split, cashflow, alerts ──
    // Previous-window compare. For overall the range spans 1900→9999, so a
    // naive start−range underflows Postgres timestamptz (year −6200 → 500).
    // Clamp to 2000; overall falls back to trailing-30d vs prior-30d.
    const DAY_MS = 86400000;
    const isOverall = resolved.period === "overall";
    const cmpEnd = isOverall ? new Date(now.getTime() - 30 * DAY_MS) : start;
    const cmpStart = isOverall
      ? new Date(now.getTime() - 60 * DAY_MS)
      : new Date(Math.max(start.getTime() - (end.getTime() - start.getTime()), Date.UTC(2000, 0, 1)));
    const prevStart = cmpStart;
    const [salesCur, salesPrev, bankRows, stockoutRows, expiringRows, arOpenRows, apOpenRows] = await Promise.all([
      prisma.salesLine.groupBy({
        by: ["principal"],
        where: { ...userWhere, ...notDeleted, saleDate: inRange },
        _sum: { amount: true },
      }),
      prisma.salesLine.groupBy({
        by: ["principal"],
        where: { ...userWhere, ...notDeleted, saleDate: { gte: prevStart, lt: cmpEnd } },
        _sum: { amount: true },
      }),
      prisma.receivable.groupBy({
        by: ["bank"],
        where: { ...userWhere, ...notDeleted, paidDate: inRange },
        _sum: { netAmount: true },
        _count: true,
      }),
      prisma.$queryRaw<Array<{ n: bigint }>>(
        Prisma.sql`SELECT COUNT(*) AS n FROM (SELECT DISTINCT item_code FROM stock_snapshot
          WHERE user_id = ${session.user.id} AND deleted_at IS NULL AND qty <= 0) s`,
      ),
      prisma.expiryLot.count({
        where: { ...userWhere, ...notDeleted, expDate: { gte: now, lt: new Date(now.getTime() + 90 * 86400000) } },
      }),
      prisma.$queryRaw<ArOpenSummary[]>(Prisma.sql`
        SELECT COALESCE(NULLIF(TRIM(company_name), ''), 'Unknown') AS company,
          COALESCE(SUM(net_amount), 0)::double precision AS outstanding,
          COALESCE(SUM(CASE WHEN payment_status = 'overdue' OR due_date < ${now} THEN net_amount ELSE 0 END), 0)::double precision AS overdue,
          COUNT(*)::bigint AS invoices
        FROM receivable
        WHERE user_id = ${session.user.id} AND deleted_at IS NULL
          AND payment_status IN (${Prisma.join(OPEN_AR_STATUSES)})
        GROUP BY 1`),
      prisma.$queryRaw<ApOpenSummary[]>(Prisma.sql`
        SELECT COALESCE(SUM(COALESCE(net_amount, amount)), 0)::double precision AS outstanding,
          COALESCE(SUM(CASE WHEN status = 'overdue' OR due_date < ${now} THEN COALESCE(net_amount, amount) ELSE 0 END), 0)::double precision AS overdue,
          COUNT(*)::bigint AS invoices
        FROM purchase_invoice
        WHERE user_id = ${session.user.id} AND deleted_at IS NULL
          AND status IN (${Prisma.join(OPEN_AP_STATUSES)})`),
    ]);
    const arOutstanding = arOpenRows.reduce((sum, row) => sum + Number(row.outstanding), 0);
    const arOverdue = arOpenRows.reduce((sum, row) => sum + Number(row.overdue), 0);
    const arOpenCount = arOpenRows.reduce((sum, row) => sum + Number(row.invoices), 0);
    const apOpen = apOpenRows[0];
    const apOutstanding = Number(apOpen?.outstanding ?? 0);
    const apOverdue = Number(apOpen?.overdue ?? 0);
    const apOpenCount = Number(apOpen?.invoices ?? 0);

    const salesByCo = new Map<string, number>();
    for (const l of salesCur) {
      const k = (l.principal ?? "Unknown").trim() || "Unknown";
      salesByCo.set(k, (salesByCo.get(k) ?? 0) + (l._sum.amount ?? 0));
    }
    const prevByCo = new Map<string, number>();
    for (const l of salesPrev) {
      const k = (l.principal ?? "Unknown").trim() || "Unknown";
      prevByCo.set(k, (prevByCo.get(k) ?? 0) + (l._sum.amount ?? 0));
    }
    const arOverdueByCo = new Map(arOpenRows.map((row) => [row.company, Number(row.overdue)]));
    const companyHealth = [...salesByCo.entries()]
      .map(([company, total]) => {
        const prev = prevByCo.get(company) ?? 0;
        const momPct = prev > 0 ? Math.round(((total - prev) / prev) * 100) : total > 0 ? 100 : 0;
        return { company, sales: total, prevSales: prev, momPct, arOverdue: arOverdueByCo.get(company) ?? 0 };
      })
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 8);

    const bankMap = new Map<string, { amount: number; count: number }>();
    for (const r of bankRows) {
      const k = (r.bank ?? "Unknown").trim() || "Unknown";
      const e = bankMap.get(k) ?? { amount: 0, count: 0 };
      e.amount += r._sum.netAmount ?? 0;
      e.count += r._count;
      bankMap.set(k, e);
    }
    const collectionByBank = [...bankMap.entries()]
      .map(([bank, v]) => ({ bank, ...v }))
      .sort((a, b) => b.amount - a.amount);

    // 6-month cashflow (collection vs purchases by calendar month) —
    // aggregated in Postgres, not 60k rows over the pooler.
    const cfFrom = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const [cfCollectedRaw, cfPurchasedRaw, salesTrendRaw] = await Promise.all([
      prisma.$queryRaw<Array<{ month: string; total: number }>>(
        Prisma.sql`SELECT to_char(paid_date, 'YYYY-MM') AS month, COALESCE(SUM(net_amount), 0) AS total
          FROM receivable
          WHERE user_id = ${session.user.id} AND deleted_at IS NULL AND paid_date >= ${cfFrom}
          GROUP BY 1`,
      ),
      prisma.$queryRaw<Array<{ month: string; total: number }>>(
        Prisma.sql`SELECT to_char(invoice_date, 'YYYY-MM') AS month, COALESCE(SUM(COALESCE(net_amount, amount)), 0) AS total
          FROM purchase_invoice
          WHERE user_id = ${session.user.id} AND deleted_at IS NULL AND invoice_date >= ${cfFrom}
          GROUP BY 1`,
      ),
      prisma.$queryRaw<Array<{ month: string; total: number }>>(
        Prisma.sql`SELECT to_char(sale_date, 'YYYY-MM') AS month, COALESCE(SUM(amount), 0) AS total
          FROM sales_line
          WHERE user_id = ${session.user.id} AND deleted_at IS NULL
            AND sale_date >= ${start} AND sale_date < ${end}
          GROUP BY 1 ORDER BY 1`,
      ),
    ]);
    const cfCollectedMap = new Map(cfCollectedRaw.map((r) => [r.month, Number(r.total)]));
    const cfPurchasedMap = new Map(cfPurchasedRaw.map((r) => [r.month, Number(r.total)]));
    const cfMap = new Map<string, { collection: number; purchases: number }>();
    for (let i = 5; i >= 0; i--) {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const k = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      cfMap.set(k, { collection: cfCollectedMap.get(k) ?? 0, purchases: cfPurchasedMap.get(k) ?? 0 });
    }
    const cashflow = [...cfMap.entries()].map(([month, v]) => ({ month, ...v }));

    const stockoutCount = Number(stockoutRows[0]?.n ?? 0);
    const expiring90 = expiringRows;

    const t = {
      sales: target?.targetSalesAmount ?? null,
      collection: target?.targetCollectionAmount ?? null,
      expense: target?.targetExpenseAmount ?? null,
      arLimit: target?.targetArLimit ?? null,
      apLimit: target?.targetApLimit ?? null,
    };
    // Management alerts (heuristic, always on — Gemini enriches on demand).
    type AlertTone = "red" | "amber" | "emerald";
    const alerts: Array<{ title: string; detail: string; tone: AlertTone; action: { label: string; href: string } }> = [];
    const salesKpiNow = trackKpi(salesTotal, t.sales, ratio, showPacing);
    const collectionKpiNow = trackKpi(collectionTotal, t.collection, ratio, showPacing);
    const prevSalesTotal = [...prevByCo.values()].reduce((s, v) => s + v, 0);
    const momPct = prevSalesTotal > 0 ? Math.round(((salesTotal - prevSalesTotal) / prevSalesTotal) * 100) : 0;
    if (sales._count > 0 && momPct < -10) {
      alerts.push({ title: `Sales ကျဆင်းနေတယ် (${momPct}%)`, detail: `ဒီကာလ ${Math.round(salesTotal).toLocaleString()} vs အရင်ကာလ ${Math.round(prevSalesTotal).toLocaleString()}`, tone: "red", action: { label: "Review sales", href: "/pharmacy/sales" } });
    }
    if (salesKpiNow.status === "Below Target") {
      alerts.push({ title: "Sales target risk", detail: `Expected ${salesKpiNow.expected?.toLocaleString()} — လက်ရှိ ${Math.round(salesTotal).toLocaleString()}`, tone: "amber", action: { label: "Review sales", href: "/pharmacy/sales" } });
    }
    if (collectionKpiNow.status === "Below Target") {
      alerts.push({ title: "Collection target risk", detail: `Expected ${collectionKpiNow.expected?.toLocaleString()} — လက်ရှိ ${Math.round(collectionTotal).toLocaleString()}`, tone: "amber", action: { label: "Review AR", href: "/pharmacy/ar" } });
    }
    if (arOverdue > 0) {
      alerts.push({ title: `Overdue AR ${Math.round(arOverdue).toLocaleString()}`, detail: `${arOpenCount} open invoices need collection review.`, tone: "amber", action: { label: "Open priority queue", href: "/pharmacy/ar" } });
    }
    if (apOverdue > 0) {
      alerts.push({ title: `Overdue AP ${Math.round(apOverdue).toLocaleString()}`, detail: "Review payment priority before discounts are lost.", tone: "amber", action: { label: "Review payables", href: "/pharmacy/payables" } });
    }
    if (stockoutCount > 0) {
      alerts.push({ title: `Stock-out SKUs: ${stockoutCount}`, detail: "Review suggested quantities and create a replenishment plan.", tone: "red", action: { label: "Open stock-outs", href: "/pharmacy/inventory?inv-tab=stockout" } });
    }
    if (expiring90 > 0) {
      alerts.push({ title: `Near-expiry lots (90d): ${expiring90}`, detail: "Review lots for push-sale, transfer, or supplier return.", tone: "amber", action: { label: "Review expiry lots", href: "/pharmacy/inventory?inv-tab=expiring" } });
    }
    if (alerts.length === 0) {
      alerts.push({ title: "အခြေအနေကောင်းမွန်နေပါတယ်", detail: "ထူးခြားတဲ့ alert မရှိပါ", tone: "emerald", action: { label: "View inventory", href: "/pharmacy/inventory" } });
    }

    return {
      period: resolved.period,
      anchor: { ...anchor, label: anchor.period === "year" ? `${anchor.year} (Yearly)` : `${anchor.year}-${String(anchor.month).padStart(2, "0")}` },
      ratio,
      targets: t,
      sales: { total: salesTotal, lines: sales._count, target: t.sales, kpi: trackKpi(salesTotal, t.sales, ratio, showPacing), momPct },
      collection: { total: collectionTotal, invoices: collected._count, target: t.collection, kpi: trackKpi(collectionTotal, t.collection, ratio, showPacing) },
      purchases: { total: purchasesTotal, invoices: purchased._count, target: t.expense, kpi: limitKpi(purchasesTotal, t.expense) },
      ar: {
        outstanding: arOutstanding, overdue: arOverdue, openCount: arOpenCount,
        limit: t.arLimit, kpi: limitKpi(arOverdue, t.arLimit),
      },
      ap: {
        outstanding: apOutstanding, overdue: apOverdue, openCount: apOpenCount,
        limit: t.apLimit, kpi: limitKpi(apOverdue, t.apLimit),
      },
      stock: { value: stockValue, skus: stockSkus, stockout: stockoutCount, expiring90 },
      // Period-matched cashflow (collection − purchases in the same period).
      // Overall keeps the all-time view (collection − AP outstanding).
      cash: {
        net: resolved.period === "overall" ? collectionTotal - apOutstanding : collectionTotal - purchasesTotal,
        label: resolved.period === "overall" ? "collection − AP" : "collection − purchases",
      },
      alerts,
      companyHealth,
      collectionByBank,
      cashflow,
      salesTrend: salesTrendRaw.map((row) => ({ month: row.month, amount: Number(row.total) })),
    };
  });
  return NextResponse.json(data, { headers: { "X-Cache": hit ? "HIT" : "MISS" } });
}
