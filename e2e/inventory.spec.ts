import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page, context, baseURL }) => {
  test.setTimeout(60000);
  const origin = new URL(baseURL!).origin;
  // Cookie only opens the proxy gate; all session/data requests below are mocked.
  await context.addCookies([{ name: "better-auth.session_token", value: "inventory-ui-test", domain: new URL(origin).hostname, path: "/" }]);
  await page.route("**/api/auth/get-session**", route => route.fulfill({ headers: {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
  }, json: {
    user: { id: "test", name: "Inventory Test", email: "test@example.com", role: "user" },
    session: { id: "test", expiresAt: "2099-01-01T00:00:00.000Z" },
  } }));
  await page.route("**/api/pharmacy/inventory?**", route => {
    const params = new URL(route.request().url()).searchParams;
    const tab = params.get("tab") ?? "reorder";
    return route.fulfill({ json: { totals: { skus: 25, value: 100, stockout: 25, belowMin: 0, overstock: 0, slow: 0, reorder: 25 },
      page: Number(params.get("page")), limit: Number(params.get("limit")), total: tab === "expiring" ? 130 : 25,
      stockout: [], belowMin: [], overstock: [], slowMoving: [], reorder: [], expiring: [],
      [tab]: tab === "expiring" ? Array.from({ length: 10 }, (_, index) => ({
        itemCode: `LOT-${params.get("page")}-${index}`, itemName: `Expiry product ${params.get("page")}-${index}`,
        expDate: "2026-09-30T00:00:00.000Z", balance: index, daysToExpiry: -31, source: "lot", bucket: "expired",
      })) : [{ itemCode: "A", itemName: "Test product", qty: 0, amount: 0, avgDailySales: 1, coverDays: 0, flag: "stockout" }],
    } });
  });
  // Exercise URL updates while server navigation is slow.
  await page.route(/^https?:\/\/[^/]+\/pharmacy\/inventory\?/, async route => {
    if (route.request().headers()["rsc"] === "1") {
      const response = await route.fetch();
      await new Promise(resolve => setTimeout(resolve, 1500));
      await route.fulfill({ response });
    } else {
      await route.continue();
    }
  });
});

test("inventory sends tabs, search, sort and pages to the server", async ({ page }) => {
  await page.goto("/pharmacy/inventory?period=month&year=2026&month=10");
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
  await expect(page.getByRole("heading", { name: "Near-expiry Lots" })).toBeVisible();
  pending = request("page", "2");
  await page.getByRole("button", { name: "Next page" }).click();
  await pending;
  await expect(page).toHaveURL(/inv-page=2/);
  await expect(page).toHaveURL(/inv-tab=expiring/);
  await expect(page.getByText("2 / 13", { exact: true })).toBeVisible();
  // Let both the URL adapter and any server navigation finish before checking
  // that pagination has not silently returned to the default Reorder tab.
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Near-expiry Lots" })).toBeVisible();
  await expect(page).toHaveURL(/inv-tab=expiring/);
  await expect(page).toHaveURL(/inv-page=2/);
  await page.unrouteAll({ behavior: "wait" });
  await expect(page.getByRole("heading", { name: "Near-expiry Lots" })).toBeVisible();
  await expect(page).toHaveURL(/inv-page=2/);
});

test("near-expiry pagination preserves the tab after slow navigation settles", async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const history: string[] = [];
  const serverNavigations: string[] = [];
  page.on("request", request => {
    if (request.headers()["rsc"] === "1" && !request.headers()["next-router-prefetch"] &&
        !request.headers()["next-router-segment-prefetch"] && new URL(request.url()).pathname === "/pharmacy/inventory") {
      serverNavigations.push(request.url());
    }
  });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.stack ?? error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });

  page.on("framenavigated", frame => {
    if (frame === page.mainFrame()) history.push(frame.url());
  });
  await page.goto("/pharmacy/inventory?period=month&year=2026&month=10");
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      await page.getByRole("button", { name: "Near-expiry", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Near-expiry Lots" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Next page" })).toBeEnabled();
      await page.getByRole("button", { name: "Next page" }).click();
      await expect(page.getByText("2 / 13", { exact: true })).toBeVisible();
      // Check the selected tab after network activity settles.
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/inv-tab=expiring/);
      await expect(page).toHaveURL(/inv-page=2/);
      await expect(page.getByRole("heading", { name: "Near-expiry Lots" })).toBeVisible();
      await page.getByRole("button", { name: "Previous page" }).click();
      await expect(page.getByText("1 / 13", { exact: true })).toBeVisible();
    }
    await page.unrouteAll({ behavior: "wait" });
    expect(serverNavigations, "tab/page changes must not start date-filter server navigation").toEqual([]);
    await expect(page.getByRole("heading", { name: "Near-expiry Lots" })).toBeVisible();
  } finally {
    await test.info().attach("browser-errors", { body: JSON.stringify(errors, null, 2), contentType: "application/json" });
    await test.info().attach("url-history", { body: JSON.stringify(history, null, 2), contentType: "application/json" });
  }
});
