// @vitest-environment node
import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ cookie: vi.fn() }));
vi.mock("better-auth/cookies", () => ({ getSessionCookie: mocks.cookie }));
vi.mock("@/lib/upstash", () => ({ checkRateLimit: vi.fn() }));
import { proxy } from "@/proxy";

it.each([undefined, "session"])("redirects retired setup before authentication (cookie: %s)", async cookie => {
  mocks.cookie.mockReturnValue(cookie);
  const response = await proxy(new NextRequest("https://example.com/setup?old=true"));
  expect(response.headers.get("location")).toBe("https://example.com/pharmacy");
});
it("keeps the retired setup API unavailable without prompting for login", async () => {
  const response = await proxy(new NextRequest("https://example.com/api/setup", { method: "POST" }));
  expect(response.status).toBe(404);
  expect(response.headers.get("location")).toBeNull();
});
it("keeps login callbacks for existing protected pages", async () => {
  mocks.cookie.mockReturnValue(undefined);
  const response = await proxy(new NextRequest("https://example.com/pharmacy/inventory"));
  expect(response.headers.get("location")).toBe("https://example.com/login?callbackUrl=%2Fpharmacy%2Finventory");
});
