// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ session: vi.fn(), raw: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.session } } }));
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: mocks.raw, $queryRawTyped: mocks.raw } }));
vi.mock("@/lib/upstash", () => ({ cached: async (_a: string, _b: string, _c: string, _d: number, fn: () => Promise<unknown>) => ({ data: await fn(), hit: false }) }));
import { GET } from "@/app/api/pharmacy/inventory/route";
beforeEach(() => {
  mocks.session.mockResolvedValue({ user: { id: "owner" } });
  mocks.raw.mockImplementation(async (query) => (query.text ?? query.sql).includes("AS skus")
    ? [{ stockout: 12 }] : [{ total: 12, rows: [{ itemCode: "A", qty: 0 }] }]);
});
it("rejects unauthenticated requests without querying", async () => {
  mocks.session.mockResolvedValue(null);
  expect((await GET(new NextRequest("http://localhost/api/pharmacy/inventory"))).status).toBe(401);
  expect(mocks.raw).not.toHaveBeenCalled();
});
it("rejects invalid pagination and sort", async () => {
  for (const params of ["page=0", "sort=unsafe", "tab=unknown"]) {
    expect((await GET(new NextRequest(`http://localhost/api/pharmacy/inventory?${params}`))).status).toBe(400);
  }
  expect(mocks.raw).not.toHaveBeenCalled();
});
it("returns only the active tab with a count", async () => {
  const response = await GET(new NextRequest("http://localhost/api/pharmacy/inventory?tab=stockout&page=2&limit=10"));
  const body = await response.json();
  expect(body).toMatchObject({ page: 2, limit: 10, total: 12, stockout: [{ itemCode: "A" }], reorder: [] });
  expect(mocks.raw).toHaveBeenCalledTimes(2);
  expect(mocks.raw.mock.calls.every(([query]) => query.values.includes("owner"))).toBe(true);
});
it("preserves the total when a page has no rows", async () => {
  mocks.raw.mockImplementation(async (query) => (query.text ?? query.sql).includes("AS skus")
    ? [{ stockout: 12 }] : [{ total: 12, rows: [] }]);
  const body = await (await GET(new NextRequest("http://localhost/api/pharmacy/inventory?tab=stockout&page=99"))).json();
  expect(body.total).toBe(12);
  expect(body.stockout).toEqual([]);
});
