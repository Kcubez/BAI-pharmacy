// @vitest-environment node
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.hoisted(() => {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
});
const mocks = vi.hoisted(() => ({ session: vi.fn(), find: vi.fn(), save: vi.fn(), raw: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.session } } }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  periodTarget: { findFirst: mocks.find, upsert: mocks.save },
  salesLine: { groupBy: async () => [] },
  receivable: { groupBy: async () => [] },
  $queryRawTyped: mocks.raw,
} }));
vi.mock("@/generated/prisma/sql", () => Object.fromEntries([
  "pharmacyOverviewTotals", "pharmacyOpenArSummary", "pharmacyOpenApSummary",
  "pharmacyMonthlyCollections", "pharmacyMonthlyPurchases", "pharmacyMonthlySales",
].map((kind) => [kind, (...args: unknown[]) => ({ kind, args })])));

import { GET as overview } from "@/app/api/pharmacy/overview/route";
import { PUT, GET as getTarget } from "@/app/api/settings/target/route";
import { bumpCacheVersion } from "@/lib/upstash";

type Target = Record<string, unknown>;
const rows = new Map<string, Target>();
const key = (row: Target) => `${row.userId}:${row.period}:${row.year}:${row.month}`;
const month = { period: "month", year: 2026, month: 10 };
const put = (body: Target) => PUT(new NextRequest("http://localhost/api/settings/target", {
  method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
}));
const read = async (period = "month") => (await overview(new NextRequest(`http://localhost/api/pharmacy/overview?period=${period}&year=2026&month=10&day=16`))).json();

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
  rows.clear();
  await bumpCacheVersion("pharmacy", "target-owner");
  mocks.session.mockResolvedValue({ user: { id: "target-owner", role: "user" } });
  mocks.find.mockImplementation(async ({ where }) => rows.get(key(where)) ?? null);
  mocks.save.mockImplementation(async ({ where, create, update }) => {
    const id = key(where.userId_period_year_month);
    const saved = rows.has(id) ? { ...rows.get(id), ...update } : create;
    rows.set(id, saved);
    return saved;
  });
  mocks.raw.mockImplementation(async ({ kind }) => {
    if (kind === "pharmacyOverviewTotals") return [{ sales: 400, collected: 800, purchased: 200, collectionByBank: [] }];
    if (kind === "pharmacyOpenArSummary") return [{ outstanding: 100, overdue: 20, invoices: 3 }];
    if (kind === "pharmacyOpenApSummary") return [{ outstanding: 200, overdue: 75, invoices: 2 }];
    return [];
  });
});
afterAll(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it("refreshes a cached overview immediately after saving and clearing targets", async () => {
  expect((await read()).sales.kpi).toMatchObject({ progress: 0, status: "Not Set" });
  expect((await put({ ...month, targetSalesAmount: 1000, targetCollectionAmount: 1000, targetExpenseAmount: 500, targetArLimit: 50, targetApLimit: 50 })).status).toBe(200);
  const saved = await read();
  expect(saved.sales.kpi).toMatchObject({ progress: 40, expected: 500, status: "Below Target" });
  expect(saved.collection.kpi).toMatchObject({ progress: 80, status: "On Track" });
  expect(saved.purchases.kpi).toMatchObject({ progress: 40, status: "On Track" });
  expect(saved.ar.kpi).toMatchObject({ current: 20, progress: 40, status: "On Track" });
  expect(saved.ap.kpi).toMatchObject({ current: 75, progress: 100, status: "Over Limit" });
  const reloaded = await (await getTarget(new NextRequest("http://localhost/api/settings/target?period=month&year=2026&month=10"))).json();
  expect(reloaded.target.targetSalesAmount).toBe(1000);
  await put({ ...month, targetSalesAmount: "" });
  expect((await read()).sales.kpi).toMatchObject({ target: null, progress: 0, status: "Not Set" });
  expect((await read()).collection.target).toBe(1000);
});

it("keeps yearly and monthly targets separate, without fallback", async () => {
  await put({ ...month, targetSalesAmount: 1000 });
  expect((await read("year")).sales.target).toBeNull();
  await put({ period: "year", year: 2026, month: 0, targetSalesAmount: 2000 });
  expect((await read("year")).sales.kpi).toMatchObject({ target: 2000, progress: 20 });
  expect((await read()).sales.kpi).toMatchObject({ target: 1000, progress: 40 });
});

it("uses the full monthly target in a daily view, like the service dashboard", async () => {
  await put({ ...month, targetSalesAmount: 1000 });
  expect((await read("day")).sales.kpi.expected).toBe(1000);
});

it("caps achieved bars and leaves zero or unset targets empty", async () => {
  await put({ ...month, targetSalesAmount: 100, targetCollectionAmount: 0 });
  const data = await read();
  expect(data.sales.kpi).toMatchObject({ progress: 100, status: "Achieved" });
  expect(data.collection.kpi).toMatchObject({ progress: 0, status: "Not Set" });
});

it.each([{ targetSalesAmount: -1 }, { targetSalesAmount: "abc" }, { month: 13 }, { period: "unknown" }])("rejects invalid targets before writing: %j", async (invalid) => {
  expect((await put({ ...month, ...invalid })).status).toBe(400);
  expect(mocks.save).not.toHaveBeenCalled();
});

it("requires a session to save targets", async () => {
  mocks.session.mockResolvedValue(null);
  expect((await put(month)).status).toBe(401);
  expect(mocks.save).not.toHaveBeenCalled();
});

it("uses historical AR dates but current AP balances for the selected invoice period", async () => {
  mocks.raw.mockImplementation(async ({ kind }) => {
    if (kind === "pharmacyOverviewTotals") return [{ collectionByBank: [] }];
    if (kind === "pharmacyOpenArSummary") return [{ outstanding: 0, overdue: 0, invoices: 0, unavailable: 0 }];
    if (kind === "pharmacyOpenApSummary") return [{ outstanding: 100, overdue: 100, invoices: 1, unavailable: 1 }];
    return [];
  });
  const result = await (await overview(new NextRequest("http://localhost/api/pharmacy/overview?period=month&year=2024&month=3"))).json();
  expect(result.ar).toMatchObject({ asOf: "2024-03-31", available: true, outstanding: 0 });
  expect(result.ap).toMatchObject({ asOf: "2026-10-16", available: true, outstanding: 100 });
  expect(result.alerts.some((alert: { title: string }) => alert.title.startsWith("Overdue AP"))).toBe(true);
});

it("uses historical AR cutoffs and current AP status within the selected invoice period", async () => {
  for (const [period, date, historical] of [
    ["month", "2024-04-01T00:00:00.000Z", true],
    ["year", "2025-01-01T00:00:00.000Z", true],
    ["overall", "2026-10-16T12:00:00.000Z", false],
  ] as const) {
    mocks.raw.mockClear();
    await overview(new NextRequest(`http://localhost/api/pharmacy/overview?period=${period}&year=2024&month=3&balance-test=1`));
    for (const kind of ["pharmacyOpenArSummary"]) {
      const query = mocks.raw.mock.calls.find(([query]) => query.kind === kind)?.[0];
      expect(query.args[0].toISOString()).toBe(date);
      expect(query.args[1]).toBe("target-owner");
      expect(query.args[3]).toBe(historical);
    }
    const ap = mocks.raw.mock.calls.find(([query]) => query.kind === "pharmacyOpenApSummary")?.[0];
    expect(ap.args[0].toISOString()).toBe("2026-10-16T12:00:00.000Z");
    expect(ap.args[5]).toBe(period === "overall");
    if (period !== "overall") {
      expect(ap.args[3].toISOString()).toBe(period === "year" ? "2024-01-01T00:00:00.000Z" : "2024-03-01T00:00:00.000Z");
      expect(ap.args[4].toISOString()).toBe(date);
    }
  }
});

it("keeps an empty historical overview free of today's expiry alerts and chart data", async () => {
  mocks.raw.mockImplementation(async ({ kind }) => {
    if (kind === "pharmacyOverviewTotals") return [{ collectionByBank: [], expiring90: 10, salesLines: 0, collectionInvoices: 0, purchaseInvoices: 0, stockSkus: 0 }];
    if (kind === "pharmacyMonthlyCollections") return [{ month: "2026-07", total: 900 }];
    return [];
  });
  const request = new NextRequest("http://localhost/api/pharmacy/overview?period=month&year=2024&month=7");
  const result = await (await overview(request)).json();
  expect(result).toMatchObject({ hasData: false, alerts: [], cashflow: [], stock: { expiring90: 0 } });
  for (const kind of ["pharmacyMonthlyCollections", "pharmacyMonthlyPurchases"]) {
    const query = mocks.raw.mock.calls.findLast(([query]) => query.kind === kind)?.[0];
    expect(query.args[1].toISOString()).toBe("2024-02-01T00:00:00.000Z");
    expect(query.args[2].toISOString()).toBe("2024-08-01T00:00:00.000Z");
  }
  const { GET: recommendations } = await import("@/app/api/pharmacy/recommendations/route");
  const rec = await (await recommendations(request)).json();
  expect(rec.recommendations).toEqual([]);
});

it("anchors populated yearly charts to the selected year", async () => {
  const result = await (await overview(new NextRequest("http://localhost/api/pharmacy/overview?period=year&year=2024"))).json();
  expect(result.hasData).toBe(true);
  expect(result.cashflow).toHaveLength(12);
  expect(result.cashflow[0].month).toBe("2024-01");
  expect(result.cashflow[11].month).toBe("2024-12");
});
