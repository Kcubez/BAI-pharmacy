import { RequestTiming } from "@/lib/request-timing";
import { comparisonRange, growthPercent, collectionPurchaseDifference } from "@/lib/pharmacy-calculations";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notDeleted } from "@/lib/soft-delete";
import { ownedByUserOrAdmin } from "@/lib/tenant-scope";
import { elapsedRatio, parsePeriodParams, resolvePeriodRange, targetAnchor } from "@/lib/period-range";
import type { ResolvedPeriod } from "@/lib/period-range";
import { OPEN_AP_STATUSES, OPEN_AR_STATUSES } from "@/lib/constants";
import { pharmacyOverviewTotals, pharmacyOpenArSummary, pharmacyOpenApSummary, pharmacyMonthlyCollections, pharmacyMonthlyPurchases, pharmacyMonthlySales } from "@/generated/prisma/sql";
import { z } from "zod";

const bankRowsSchema = z.array(z.object({ bank: z.string().nullable(), amount: z.number(), invoices: z.number() }));
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
export async function getPharmacyOverviewResponse(req: NextRequest) {
  const timing = new RequestTiming();
  const session = await timing.measure("auth", () => auth.api.getSession({ headers: req.headers }));
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const cacheKey = `overview-v7:${req.nextUrl.searchParams.toString()}`;
  const { data, hit } = await timing.measure("data", () => cached("pharmacy", session.user.id, cacheKey, 60, async () => timing.measure("db", async () => {
    const resolved = parsePeriodParams(req.nextUrl.searchParams);
    const { start, end } = resolvePeriodRange(resolved);
    const showPacing = paced(resolved);
    const ratio = resolved.period === "month" || resolved.period === "year" ? elapsedRatio(start, end) : 1;
    const anchor = pharmacyAnchor(resolved);
    const userWhere = ownedByUserOrAdmin(session);

    const now = new Date();
    const historical = end.getTime() <= now.getTime();
    const balanceCutoff = historical ? end : now;
    const balanceAsOf = new Date(balanceCutoff.getTime() - (historical ? 1 : 0)).toISOString().slice(0, 10);
    // ── Decision signals: company health, bank split, cashflow, alerts ──
    // Calendar comparisons use calendar boundaries; overall compares equal 30d windows.
    const DAY_MS = 86400000;
    const comparison = comparisonRange(resolved, now);
    const chartEnd = resolved.period === "overall" ? now : new Date(end.getTime() - 1);
    const chartMonths = resolved.period === "year" ? 12 : 6;
    const cfFrom = resolved.period === "custom" ? start : new Date(Date.UTC(chartEnd.getUTCFullYear(), chartEnd.getUTCMonth() - chartMonths + 1, 1));
    const cfUntil = resolved.period === "overall" ? now : end;
    // All independent reads start together; compact totals replace six reads.
    const [totalsRows, target, salesCur, salesPrev, arOpenRows, apOpenRows, cfCollectedRaw, cfPurchasedRaw, salesTrendRaw, arSources] = await Promise.all([
      prisma.$queryRawTyped(pharmacyOverviewTotals(session.user.id, start, end, new Date(balanceCutoff.getTime() - (historical ? 1 : 0)), new Date(balanceCutoff.getTime() + 90 * DAY_MS))),
      prisma.periodTarget.findFirst({
        where: { userId: session.user.id, ...anchor },
      }),
      prisma.salesLine.groupBy({
        by: ["principal"],
        where: { ...userWhere, ...notDeleted, saleDate: { gte: comparison.currentStart, lt: comparison.currentEnd } },
        _sum: { amount: true },
      }),
      prisma.salesLine.groupBy({
        by: ["principal"],
        where: { ...userWhere, ...notDeleted, saleDate: { gte: comparison.previousStart, lt: comparison.previousEnd } },
        _sum: { amount: true },
      }),
      prisma.$queryRawTyped(pharmacyOpenArSummary(balanceCutoff, session.user.id, OPEN_AR_STATUSES, historical)),
      prisma.$queryRawTyped(pharmacyOpenApSummary(now, session.user.id, OPEN_AP_STATUSES, start, end, resolved.period === "overall")),
      prisma.$queryRawTyped(pharmacyMonthlyCollections(session.user.id, cfFrom, cfUntil)),
      prisma.$queryRawTyped(pharmacyMonthlyPurchases(session.user.id, cfFrom, cfUntil)),
      prisma.$queryRawTyped(pharmacyMonthlySales(session.user.id, start, end)),
      prisma.receivable.groupBy({
        by: ["sourceSheet", "sourceFileName"],
        where: { userId: session.user.id, ...notDeleted },
        _max: { invoiceDate: true },
      }),
    ]);
    const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
    const arSource = arSources.map(row => {
      const month = monthNames.indexOf(row.sourceSheet?.trim().toLowerCase() ?? "");
      const year = Number(row.sourceFileName?.match(/(?:19|20)\d{2}/)?.[0]) || row._max.invoiceDate?.getUTCFullYear() || 0;
      return { month, year, rank: year * 12 + month };
    }).filter(row => row.month >= 0).sort((a, b) => b.rank - a.rank)[0];
    const arDataPeriod = arSource ? `${arSource.year || "Unknown year"}-${String(arSource.month + 1).padStart(2, "0")}` : null;
    const totals = totalsRows[0];
    const bankRows = bankRowsSchema.parse(totals?.collectionByBank ?? []);
    const salesTotal = totals?.sales ?? 0;
    const collectionTotal = totals?.collected ?? 0;
    const purchasesTotal = totals?.purchased ?? 0;
    const stockValue = totals?.stockValue ?? 0;
    const stockSkus = totals?.stockSkus ?? 0;
    const arAvailable = !arOpenRows.some(row => Number(row.unavailable ?? 0) > 0);
    const apAvailable = true;
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
        const momPct = growthPercent(total, prev);
        return { company, sales: total, prevSales: prev, momPct, arOverdue: arOverdueByCo.get(company) ?? 0 };
      })
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 8);

    const bankMap = new Map<string, { amount: number; count: number }>();
    for (const r of bankRows) {
      const k = (r.bank ?? "Unknown").trim() || "Unknown";
      const e = bankMap.get(k) ?? { amount: 0, count: 0 };
      e.amount += r.amount ?? 0;
      e.count += r.invoices ?? 0;
      bankMap.set(k, e);
    }
    const collectionByBank = [...bankMap.entries()]
      .map(([bank, v]) => ({ bank, ...v }))
      .sort((a, b) => b.amount - a.amount);

    // 6-month cashflow (collection vs purchases by calendar month) —
    // aggregated in Postgres, not 60k rows over the pooler.
    const cfCollectedMap = new Map(cfCollectedRaw.map((r) => [r.month, Number(r.total)]));
    const cfPurchasedMap = new Map(cfPurchasedRaw.map((r) => [r.month, Number(r.total)]));
    const cfMap = new Map<string, { collection: number; purchases: number }>();
    for (let i = chartMonths - 1; i >= 0; i--) {
      const dt = new Date(Date.UTC(chartEnd.getUTCFullYear(), chartEnd.getUTCMonth() - i, 1));
      const k = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
      if (dt < cfFrom && resolved.period === "custom") continue;
      cfMap.set(k, { collection: cfCollectedMap.get(k) ?? 0, purchases: cfPurchasedMap.get(k) ?? 0 });
    }
    const cashflow = [...cfMap.entries()].map(([month, v]) => ({ month, ...v }));

    const stockoutCount = totals?.stockout ?? 0;
    // Expiry lots have no historical inventory snapshot date; current lots cannot
    // establish which lots were held at a historical cutoff.
    const expiring90 = historical ? 0 : (totals?.expiring90 ?? 0);
    const hasData = (totals?.salesLines ?? 0) > 0 || (totals?.collectionInvoices ?? 0) > 0
      || (totals?.purchaseInvoices ?? 0) > 0 || stockSkus > 0
      || arOpenCount > 0 || apOpenCount > 0 || !arAvailable || !apAvailable || expiring90 > 0;

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
    const comparisonSales = [...salesByCo.values()].reduce((sum, amount) => sum+amount, 0);
    const momPct = growthPercent(comparisonSales, prevSalesTotal);
    if (comparisonSales > 0 && momPct != null && momPct < -10) {
      alerts.push({ title: `Sales ကျဆင်းနေတယ် (${momPct}%)`, detail: `ဒီကာလ ${Math.round(comparisonSales).toLocaleString()} vs အရင်ကာလ ${Math.round(prevSalesTotal).toLocaleString()}`, tone: "red", action: { label: "Review sales", href: "/pharmacy/sales" } });
    }
    if (salesKpiNow.status === "Below Target") {
      alerts.push({ title: "Sales target risk", detail: `Expected ${salesKpiNow.expected?.toLocaleString()} — လက်ရှိ ${Math.round(salesTotal).toLocaleString()}`, tone: "amber", action: { label: "Review sales", href: "/pharmacy/sales" } });
    }
    if (collectionKpiNow.status === "Below Target") {
      alerts.push({ title: "Collection target risk", detail: `Expected ${collectionKpiNow.expected?.toLocaleString()} — လက်ရှိ ${Math.round(collectionTotal).toLocaleString()}`, tone: "amber", action: { label: "Review AR", href: "/pharmacy/ar" } });
    }
    if (arAvailable && arOverdue > 0) {
      alerts.push({ title: `Overdue AR ${Math.round(arOverdue).toLocaleString()}`, detail: `${arOpenCount} open invoices need collection review.`, tone: "amber", action: { label: "Open priority queue", href: "/pharmacy/ar" } });
    }
    if (apAvailable && apOverdue > 0) {
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
      comparison: { label: comparison.label, currentStart: comparison.currentStart, currentEnd: comparison.currentEnd, previousStart: comparison.previousStart, previousEnd: comparison.previousEnd },
      anchor: { ...anchor, label: anchor.period === "year" ? `${anchor.year} (Yearly)` : `${anchor.year}-${String(anchor.month).padStart(2, "0")}` },
      ratio,
      targets: t,
      sales: { total: salesTotal, lines: (totals?.salesLines ?? 0), target: t.sales, kpi: trackKpi(salesTotal, t.sales, ratio, showPacing), momPct },
      collection: { total: collectionTotal, invoices: totals?.collectionInvoices ?? 0, target: t.collection, kpi: trackKpi(collectionTotal, t.collection, ratio, showPacing) },
      purchases: { total: purchasesTotal, invoices: totals?.purchaseInvoices ?? 0, target: t.expense, kpi: limitKpi(purchasesTotal, t.expense) },
      ar: {
        available: arAvailable, asOf: balanceAsOf, dataPeriod: arDataPeriod,
        outstanding: arOutstanding, overdue: arOverdue, openCount: arOpenCount,
        limit: t.arLimit, kpi: limitKpi(arOverdue, t.arLimit),
      },
      ap: {
        available: apAvailable, asOf: now.toISOString().slice(0, 10),
        outstanding: apOutstanding, overdue: apOverdue, openCount: apOpenCount,
        limit: t.apLimit, kpi: limitKpi(apOverdue, t.apLimit),
      },
      stock: { period: totals?.stockPeriod ?? null, asOf: balanceAsOf, value: stockValue, skus: stockSkus, stockout: stockoutCount, expiring90 },
      // Invoice comparison in the selected period; no cash payment ledger is available.
      cash: {
        net: collectionPurchaseDifference(collectionTotal, purchasesTotal),
        label: "collection − purchases",
      },
      hasData,
      alerts: hasData ? alerts : [],
      companyHealth,
      collectionByBank,
      cashflow: hasData ? cashflow : [],
      salesTrend: salesTrendRaw.map((row) => ({ month: row.month, amount: Number(row.total) })),
    };
  })));
  return NextResponse.json(data, { headers: { "Server-Timing": timing.header(), "X-Cache": hit ? "HIT" : "MISS" } });
}
