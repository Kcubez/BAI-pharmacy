import { test, expect } from "@playwright/test";

test("inventory sends tabs, search, sort and pages to the server", async ({ page, context }) => {
  // Cookie only opens the proxy gate; all session/data requests below are mocked.
  await context.addCookies([{ name: "better-auth.session_token", value: "inventory-ui-test", domain: "localhost", path: "/" }]);
  await page.route("**/api/auth/get-session**", route => route.fulfill({ headers: {
    "access-control-allow-origin": "http://localhost:3000",
    "access-control-allow-credentials": "true",
  }, json: {
    user: { id: "test", name: "Inventory Test", email: "test@example.com", role: "user" },
    session: { id: "test", expiresAt: "2099-01-01T00:00:00.000Z" },
  } }));
  await page.route("**/api/pharmacy/inventory?**", route => {
    const params = new URL(route.request().url()).searchParams;
    const tab = params.get("tab") ?? "reorder";
    return route.fulfill({ json: { totals: { skus: 25, value: 100, stockout: 25, belowMin: 0, overstock: 0, slow: 0, reorder: 25 },
      page: Number(params.get("page")), limit: Number(params.get("limit")), total: 25,
      stockout: [], belowMin: [], overstock: [], slowMoving: [], reorder: [], expiring: [],
      [tab]: tab === "expiring" ? [] : [{ itemCode: "A", itemName: "Test product", qty: 0, amount: 0, avgDailySales: 1, coverDays: 0, flag: "stockout" }],
    } });
  });
  await page.goto("/pharmacy/inventory");
  await expect(page.getByRole("heading", { name: "Inventory Control" })).toBeVisible();
  const request = (key: string, value: string) => page.waitForRequest(req => req.url().includes("/api/pharmacy/inventory?") && new URL(req.url()).searchParams.get(key) === value);
  let pending = request("tab", "stockout");
  await page.getByRole("button", { name: "Stockout", exact: true }).click();
  await pending;
  pending = request("page", "2");
  await page.getByRole("button", { name: "Next page" }).click();
  await pending;
  pending = request("q", "Test");
  await page.getByPlaceholder("Search code / name…").fill("Test");
  expect(new URL((await pending).url()).searchParams.get("page")).toBe("1");
  await page.getByRole("combobox").filter({ hasText: "Cover" }).click();
  pending = request("sort", "qty");
  await page.getByRole("option", { name: "Qty", exact: true }).click();
  await pending;
  pending = request("tab", "expiring");
  await page.getByRole("button", { name: "Near-expiry", exact: true }).click();
  await pending;
  await expect(page.getByRole("button", { name: "Next page" })).toBeVisible();
});
