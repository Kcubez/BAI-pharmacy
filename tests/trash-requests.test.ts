// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ session: vi.fn(), requests: vi.fn(), meta: vi.fn(), list: vi.fn(), count: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.session } } }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  restoreRequest: { findMany: mocks.requests, groupBy: mocks.meta },
  stockSnapshot: { findMany: mocks.list, count: mocks.count },
} }));
import { GET } from "@/app/api/trash/route";
beforeEach(() => {
  mocks.session.mockResolvedValue({ user: { id: "admin-id", role: "admin" } });
  mocks.requests.mockResolvedValue([{ recordId: "requested-stock" }]);
  mocks.list.mockResolvedValue([{ id: "requested-stock", deletedAt: new Date("2026-10-20"), itemCode: "SKU" }]);
  mocks.count.mockResolvedValue(1);
  mocks.meta.mockResolvedValue([{ recordType: "pharma_stock", recordId: "requested-stock", _count: { _all: 1 } }]);
});
it("shows admins their own trash and pending requested records with request metadata", async () => {
  const response = await GET(new NextRequest("http://localhost/api/trash?type=pharma_stock"));
  const body = await response.json();
  expect(mocks.requests).toHaveBeenCalledWith({ where: { recordType: "pharma_stock", status: "pending" }, select: { recordId: true } });
  const where = mocks.list.mock.calls[0][0].where;
  expect(where).toMatchObject({ deletedAt: { not: null }, OR: [{ userId: "admin-id" }, { id: { in: ["requested-stock"] } }] });
  expect(mocks.count).toHaveBeenCalledWith({ where });
  expect(body.records[0]).toMatchObject({ id: "requested-stock", restoreRequested: true, restoreRequestCount: 1 });
  expect(body.canRestore).toBe(true);
});
it("keeps regular users restricted to their own trash", async () => {
  mocks.session.mockResolvedValue({ user: { id: "user-id", role: "user" } });
  const body = await (await GET(new NextRequest("http://localhost/api/trash?type=pharma_stock"))).json();
  expect(mocks.requests).not.toHaveBeenCalled();
  expect(mocks.list.mock.calls[0][0].where.OR).toEqual([{ userId: "user-id" }]);
  expect(body.canRestore).toBe(false);
});
it("exposes no foreign records without pending requests and preserves date filters", async () => {
  mocks.requests.mockResolvedValue([]);
  await GET(new NextRequest("http://localhost/api/trash?type=pharma_stock&dateFrom=2026-10-01&dateTo=2026-10-20"));
  expect(mocks.list.mock.calls[0][0].where).toMatchObject({ OR: [{ userId: "admin-id" }], deletedAt: { gte: new Date("2026-10-01T00:00:00Z"), lte: new Date("2026-10-20T23:59:59.999Z") } });
});
