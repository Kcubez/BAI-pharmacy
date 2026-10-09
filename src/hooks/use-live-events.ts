"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { pharmacyKeys } from "@/hooks/use-pharmacy";

/**
 * Live dashboard updates over Server-Sent Events (replaces sync-polling).
 * The server pushes `data-changed` when imports land or Telegram data is
 * processed; the client invalidates pharmacy queries and toasts.
 * EventSource reconnects natively (incl. the Hobby ~5min stream cap).
 */
export function useLiveEvents(enabled = true) {
  const queryClient = useQueryClient();
  const toastShownAt = useRef(0);

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof EventSource === "undefined") return;

    const src = new EventSource("/api/events");
    src.addEventListener("data-changed", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data as string) as {
          scope?: string;
        };
        if (data.scope && data.scope !== "pharmacy" && data.scope !== "commerce") return;
      } catch {
        return;
      }
      void queryClient.invalidateQueries({ queryKey: pharmacyKeys.all });
      const now = Date.now();
      if (now - toastShownAt.current > 10_000) {
        toastShownAt.current = now;
        toast.success("New data received — dashboard updated");
      }
    });
    src.onerror = () => {
      // EventSource retries automatically with backoff; nothing to do.
    };
    return () => {
      src.close();
    };
  }, [enabled, queryClient]);
}
