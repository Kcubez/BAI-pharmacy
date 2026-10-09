"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "motion/react";

/** Animated count-up for KPI numbers (motion). Returns the current display
 *  value; animates from previous to target on change. Respects
 *  prefers-reduced-motion (returns target directly, no animation). */
export function useCountUp(target: number, duration = 0.8): number {
  const [reduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [display, setDisplay] = useState(target);
  const prev = useRef(target);
  useEffect(() => {
    if (reduced) {
      prev.current = target;
      return;
    }
    const controls = animate(prev.current, target, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(v),
    });
    prev.current = target;
    return () => controls.stop();
  }, [target, duration, reduced]);
  return reduced ? target : display;
}
