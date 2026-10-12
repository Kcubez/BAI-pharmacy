import { expect, it, vi } from "vitest";
import { withDeadline } from "@/lib/with-deadline";
it("aborts stalled AI calls and rejects at the full-operation deadline", async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  try {
    const result = withDeadline(s => { signal=s; return new Promise(() => {}); }, 2000);
    const assertion = expect(result).rejects.toThrow("deadline");
    await vi.advanceTimersByTimeAsync(2000);
    await assertion;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});
it("clears the deadline on success", async () => {
  expect(await withDeadline(async () => "done", 2000)).toBe("done");
});
