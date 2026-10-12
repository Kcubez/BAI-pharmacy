import { describe, expect, it } from "vitest";
import { parsePageRequest } from "@/lib/pagination";

describe("parsePageRequest", () => {
  it("uses safe defaults for missing or invalid page values", () => {
    expect(parsePageRequest(new URLSearchParams())).toEqual({ page: 1, limit: 20 });
    expect(parsePageRequest(new URLSearchParams("page=0&limit=-10"))).toEqual({ page: 1, limit: 20 });
    expect(parsePageRequest(new URLSearchParams("page=abc&limit=Infinity"))).toEqual({ page: 1, limit: 20 });
  });

  it("accepts valid values and caps oversized page sizes", () => {
    expect(parsePageRequest(new URLSearchParams("page=3&limit=50"))).toEqual({ page: 3, limit: 50 });
    expect(parsePageRequest(new URLSearchParams("page=2&limit=1000"))).toEqual({ page: 2, limit: 100 });
  });
});
