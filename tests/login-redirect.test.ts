import { expect, it } from "vitest";
import { getLoginRedirect } from "@/lib/login-redirect";

it.each(["/setup", "/setup/", "/setup?old=true", "/%73etup", "/api/setup", "/api/setup/old"])(
  "replaces retired callback %s with the portal destination", callback => {
    expect(getLoginRedirect(callback, "/pharmacy")).toBe("/pharmacy");
    expect(getLoginRedirect(callback, "/admin/users")).toBe("/admin/users");
  },
);
it.each([null, "", "https://example.com", "//example.com", "/\\example.com", "/%zz"])(
  "rejects invalid or external callback %s", callback => {
    expect(getLoginRedirect(callback, "/pharmacy")).toBe("/pharmacy");
  },
);
it("preserves valid internal destinations and query parameters", () => {
  expect(getLoginRedirect("/pharmacy/inventory?tab=stockout#table", "/pharmacy"))
    .toBe("/pharmacy/inventory?tab=stockout#table");
});
