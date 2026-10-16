import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDateFilter } from "@/hooks/use-date-filter";

const navigation = vi.hoisted(() => ({
  params: new URLSearchParams(),
  router: { replace: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => navigation.router,
  usePathname: () => "/pharmacy/inventory",
  useSearchParams: () => navigation.params,
}));

afterEach(cleanup);

beforeEach(() => {
  sessionStorage.clear();
  navigation.params = new URLSearchParams("period=month&year=2026&month=10");
});

describe("date-filter navigation", () => {
  it("does not start server navigation when inventory adds a tab or page", async () => {
    const { result, rerender } = renderHook(() => useDateFilter("inventory"));
    await waitFor(() => expect(result.current.isReady).toBe(true));
    for (const query of [
      "period=month&year=2026&month=10&inv-tab=expiring",
      "period=month&year=2026&month=10&inv-tab=expiring&inv-page=2",
    ]) {
      navigation.params = new URLSearchParams(query);
      rerender();
      expect(result.current.isReady).toBe(true);
      expect(navigation.router.replace).not.toHaveBeenCalled();
    }
  });

  it("normalizes invalid dates while preserving the selected inventory tab and page", () => {
    navigation.params = new URLSearchParams("period=month&year=2026&month=99&inv-tab=expiring&inv-page=2");
    renderHook(() => useDateFilter("inventory"));
    expect(navigation.router.replace).toHaveBeenCalledOnce();
    const url = new URL(navigation.router.replace.mock.calls[0][0], "http://localhost");
    expect(url.searchParams.get("month")).toBe("12");
    expect(url.searchParams.get("inv-tab")).toBe("expiring");
    expect(url.searchParams.get("inv-page")).toBe("2");
  });
});
