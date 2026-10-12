import { describe, expect, it } from "vitest";
import { inventoryOptions, inventoryQueries } from "@/lib/inventory-query";

const input = { userId: "owner", asOf: new Date("2026-10-01"), since: new Date("2026-07-01"),
  until: new Date("2026-10-01"), page: 3, limit: 10, search: "50%_off'" };
describe("inventory query inputs", () => {
  it("rejects untrusted tab and sort expressions", () => {
    expect(inventoryOptions.safeParse({ tab: "all" }).success).toBe(false);
    expect(inventoryOptions.safeParse({ sort: "qty; DROP TABLE sales_line" }).success).toBe(false);
  });
  it("binds literal searches and pagination instead of interpolating them", () => {
    const query = inventoryQueries({ ...input, tab: "stockout", sort: "qty" }).selected;
    expect(query.values).toContain("%50\\%\\_off'%");
    expect(query.values.slice(-2)).toEqual([10, 20]);
    expect(query.text).not.toContain(input.search);
    expect(query.text).toContain("flag='stockout'");
    expect(query.text).toContain("qty DESC,item_code");
  });
  it("paginates expiry sources together", () => {
    const query = inventoryQueries({ ...input, tab: "expiring", sort: "cover" }).selected;
    expect(query.text).toContain("UNION ALL");
    expect(query.text).toContain("FROM expiry_days WHERE TRUE");
    expect(query.text).toContain("exp_date,id");
  });
});
