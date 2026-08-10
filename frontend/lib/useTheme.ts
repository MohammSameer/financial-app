"use client";

import { useEffect, useState } from "react";

/**
 * Reports the active theme, and re-reports it when the toggle flips.
 *
 * The charts need this because their colours come from the API as two
 * explicit sets — a light hex and a dark hex per category — rather than from
 * CSS variables. SVG fills inside Recharts are set as attributes, so a
 * `var(--x)` would not re-resolve on a theme change; the component has to
 * re-render with a different value.
 *
 * A MutationObserver rather than a matchMedia listener: the theme is whatever
 * `data-theme` currently says, which may be an explicit user choice that
 * overrides the OS preference.
 */
export function useTheme(): "light" | "dark" {
  // Starts light so the server and the first client render agree; the effect
  // corrects it before paint if the real theme is dark.
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const root = document.documentElement;

    const read = () =>
      setTheme(root.getAttribute("data-theme") === "dark" ? "dark" : "light");

    read();

    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return theme;
}
