// @vitest-environment node
import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ generate: vi.fn(), aggregate: vi.fn<(args: { where: { saleDate: { gte: Date; lt: Date } } }) => Promise<{ _sum: { amount: number }; _count: number }>>().mockResolvedValue({ _sum: { amount: 100 }, _count: 1 }) }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: async () => ({ user: { id: "test" } }) } } }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  salesLine: { aggregate: mocks.aggregate },
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
it("bounds the selected month in UTC and uses latest stock-out SKUs", async () => {
  mocks.generate.mockResolvedValue({ text: "[]" });
  const body = await (await GET(new NextRequest("http://localhost/api/pharmacy/recommendations?year=2026&month=6"))).json();
  expect(mocks.aggregate.mock.calls[0][0].where.saleDate).toEqual({ gte: new Date("2026-06-01"), lt: new Date("2026-07-01") });
  expect(mocks.aggregate.mock.calls[1][0].where.saleDate).toEqual({ gte: new Date("2026-05-01"), lt: new Date("2026-06-01") });
  expect(body.recommendations.some((row: { title: string }) => row.title === "Stock-out SKUs: 113")).toBe(true);
});
