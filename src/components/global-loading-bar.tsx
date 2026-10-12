"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useIsFetching } from "@tanstack/react-query";

const COMPLETE_DELAY_MS = 200;

function GlobalLoadingBarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fetchingCount = useIsFetching({ predicate: (query) => query.meta?.background !== true });
  const [isVisible, setIsVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousLocation = useRef<string | null>(null);
  const navigationPending = useRef(false);

  const stopTimers = useCallback(() => {
    if (progressInterval.current) clearInterval(progressInterval.current);
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    progressInterval.current = null;
    hideTimeout.current = null;
  }, []);

  const startProgress = useCallback(() => {
    if (hideTimeout.current) clearTimeout(hideTimeout.current);

    setIsVisible(true);
    setProgress((current) => (current > 0 ? current : 8));

    if (progressInterval.current) return;

    progressInterval.current = setInterval(() => {
      setProgress((current) => {
        if (current >= 90) return current;
        // Match Foodie POS: visibly quick at first, then deliberately slower.
        const increment = Math.max(1, 10 - Math.floor(current / 10));
        return Math.min(90, current + increment);
      });
    }, 100);
  }, []);

  const completeProgress = useCallback(() => {
    if (progressInterval.current) clearInterval(progressInterval.current);
    progressInterval.current = null;
    setProgress(100);

    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    hideTimeout.current = setTimeout(() => {
      setIsVisible(false);
      setProgress(0);
      hideTimeout.current = null;
    }, COMPLETE_DELAY_MS);
  }, []);

  useEffect(() => {
    const location = `${pathname}?${searchParams.toString()}`;
    const locationChanged =
      previousLocation.current !== null && previousLocation.current !== location;
    previousLocation.current = location;

    if (locationChanged) {
      navigationPending.current = false;
      if (fetchingCount === 0) {
        const completionFrame = requestAnimationFrame(completeProgress);
        return () => cancelAnimationFrame(completionFrame);
      }
    }
  }, [completeProgress, fetchingCount, pathname, searchParams]);

  useEffect(() => {
    const progressFrame = requestAnimationFrame(() => {
      if (fetchingCount > 0) {
        startProgress();
      } else if (!navigationPending.current && isVisible) {
        completeProgress();
      }
    });

    return () => cancelAnimationFrame(progressFrame);
  }, [completeProgress, fetchingCount, isVisible, startProgress]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest("a");
      const href = link?.getAttribute("href");
      const currentLocation = `${pathname}${searchParams.size ? `?${searchParams}` : ""}`;

      if (
        href &&
        href.startsWith("/") &&
        href !== currentLocation &&
        !link?.hasAttribute("download") &&
        link?.target !== "_blank" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey
      ) {
        navigationPending.current = true;
        startProgress();
      }
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [pathname, searchParams, startProgress]);

  useEffect(() => stopTimers, [stopTimers]);

  if (!isVisible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 bg-sky-500/20"
      role="progressbar"
      aria-label="Loading"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress)}
    >
      <div
        className="h-full bg-sky-500 transition-[width] duration-100 ease-linear"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

/** Top-level navigation and data-refresh feedback, modelled on Foodie POS. */
export function GlobalLoadingBar() {
  return (
    <Suspense fallback={null}>
      <GlobalLoadingBarInner />
    </Suspense>
  );
}
