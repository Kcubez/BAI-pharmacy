"use client";

import { useEffect, useState } from "react";
import { debounce } from "es-toolkit";

/** Debounced value (es-toolkit). Updates 300ms after the source stops changing. */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const d = debounce(() => setDebounced(value), delay);
    d();
    return () => d.cancel();
  }, [value, delay]);
  return debounced;
}
