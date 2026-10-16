// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ generate: vi.fn(), overview: vi.fn() }));
vi.mock("@/lib/pharmacy-overview", () => ({ getPharmacyOverviewResponse: mocks.overview }));
const facts = {
  hasData: true, anchor: { label: "2026-06" }, sales: { total: 100 }, collection: { total: 0 }, purchases: { total: 0 },
  ar: { available: true, outstanding: 0, asOf: "2026-06-30" }, ap: { available: true, outstanding: 0 },
  alerts: [{ title: "Stock-out SKUs: 113", detail: "Review reorder", tone: "amber", action: { href: "/pharmacy/inventory" } }],
};
beforeEach(() => { mocks.overview.mockImplementation(async () => Response.json(facts)); });
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: async () => ({ user: { id: "test" } }) } } }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  $queryRawTyped: async (query: { sql: string }) => query.sql.includes("AS supplier") ? [] : [{ n: BigInt(113) }],
  receivable: { findMany: async () => [] }, purchaseInvoice: { findMany: async () => [] },
  stockSnapshot: { count: async () => 0 }, expiryLot: { count: async () => 0 },
  botSettings: { findFirst: async () => ({ geminiApiKey: "test", geminiModel: "test" }) },
} }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class { models = { generateContent: mocks.generate }; } }));
vi.mock("@/lib/upstash", () => ({ cached: async (_a: string, _b: string, _c: string, _d: number, work: () => Promise<unknown>) => ({ data: await work(), hit: false }) }));
import { GET } from "@/app/api/pharmacy/recommendations/route";
it("returns heuristic recommendations and aborts when the AI stalls", async () => {
  vi.useFakeTimers();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.generate.mockImplementation(() => new Promise(() => {}));
  try {
    const response = GET(new NextRequest("http://localhost/api/pharmacy/recommendations?year=2026&month=10"));
    await vi.advanceTimersByTimeAsync(2000);
    const body = await (await response).json();
    expect(body.source).toBe("heuristic");
    expect(body.recommendations.length).toBeGreaterThan(0);
    expect(mocks.generate.mock.calls[0][0].config.abortSignal.aborted).toBe(true);
  } finally { vi.useRealTimers(); }
});
it("uses selected-period overview facts for suggestions", async () => {
  mocks.generate.mockResolvedValue({ text: "[]" });
  const request = new NextRequest("http://localhost/api/pharmacy/recommendations?period=year&year=2024");
  const body = await (await GET(request)).json();
  expect(mocks.overview).toHaveBeenCalledWith(request);
  expect(body.recommendations.some((row: { title: string }) => row.title === "Stock-out SKUs: 113")).toBe(true);
});
it("skips AI and suggestions for empty periods", async () => {
  mocks.generate.mockClear();
  mocks.overview.mockResolvedValue(Response.json({ ...facts, hasData: false, alerts: [] }));
  const body = await (await GET(new NextRequest("http://localhost/api/pharmacy/recommendations?period=year&year=2024"))).json();
  expect(body.recommendations).toEqual([]);
  expect(mocks.generate).not.toHaveBeenCalled();
});
