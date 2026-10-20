// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ session: vi.fn(), count: vi.fn(), updateMany: vi.fn(), bump: vi.fn(), publish: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.session } } }));
vi.mock("@/lib/prisma", () => ({ prisma: Object.fromEntries([
  "purchaseOrder", "purchaseInvoice", "salesLine", "receivable", "stockSnapshot", "stockMovement",
  "expiryLot", "stockReturn", "storeInLot", "supplier", "pharmaProduct",
].map(key => [key, { count: mocks.count, updateMany: mocks.updateMany }])) }));
vi.mock("@/lib/upstash", () => ({ bumpCacheVersion: mocks.bump, publishEvent: mocks.publish }));
import { GET, DELETE } from "@/app/api/pharmacy/delete-all/route";
beforeEach(() => {
  mocks.session.mockResolvedValue({ user: { id: "owner", role: "user" } });
  mocks.count.mockResolvedValue(2);
  mocks.updateMany.mockResolvedValue({ count: 2 });
});
it("requires authentication for preview and reset", async () => {
  mocks.session.mockResolvedValue(null);
  for (const method of [GET, DELETE]) expect((await method(new NextRequest("http://localhost/api/pharmacy/delete-all?scope=all"))).status).toBe(401);
  expect(mocks.count).not.toHaveBeenCalled();
  expect(mocks.updateMany).not.toHaveBeenCalled();
});
it("previews all 11 record types, including masters, scoped to the current account", async () => {
  const result = await (await GET(new NextRequest("http://localhost/api/pharmacy/delete-all"))).json();
  expect(result).toMatchObject({ total: 22, counts: { products: 2, suppliers: 2 } });
  expect(mocks.count).toHaveBeenCalledTimes(11);
  for (const [args] of mocks.count.mock.calls) expect(args.where).toEqual({ userId: "owner", deletedAt: null });
  expect(mocks.updateMany).not.toHaveBeenCalled();
});
it("rejects an all-data reset without its explicit confirmation", async () => {
  expect((await DELETE(new NextRequest("http://localhost/api/pharmacy/delete-all?scope=all", { method: "DELETE" }))).status).toBe(400);
  expect(mocks.updateMany).not.toHaveBeenCalled();
});
it("moves only the owner's active records to Trash, preserving product levels", async () => {
  const response = await DELETE(new NextRequest("http://localhost/api/pharmacy/delete-all?scope=all", { method: "DELETE", headers: { "x-pharmacy-confirmation": "RESET" } }));
  expect(await response.json()).toMatchObject({ success: true, total: 22, counts: { products: 2, suppliers: 2 } });
  expect(mocks.updateMany).toHaveBeenCalledTimes(11);
  for (const [args] of mocks.updateMany.mock.calls) {
    expect(args.where).toEqual({ userId: "owner", deletedAt: null });
    expect(args.data).toMatchObject({ deletedAt: expect.any(Date), deletedByUserId: "owner" });
    expect(args.data).not.toHaveProperty("minQty");
  }
  expect(mocks.bump).toHaveBeenCalledWith("pharmacy", "owner");
});
