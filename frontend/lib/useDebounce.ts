"use client";

import { useEffect, useState } from "react";

/**
 * Delays a rapidly-changing value.
 *
 * The merchant search filters server-side, so firing on every keystroke would
 * send a query per character. 250ms is short enough to still feel like
 * as-you-type and long enough that a normal typing speed produces one request
 * per word rather than one per letter.
 */
export function useDebounce<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    // Clearing on every change is what makes this a debounce rather than a
    // throttle: the timer only fires once input actually pauses.
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
