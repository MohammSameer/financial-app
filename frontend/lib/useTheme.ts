"use client";

import { useSyncExternalStore } from "react";

/**
 * Subscribe to changes of the `data-theme` attribute on <html>.
 *
 * useSyncExternalStore rather than useState + useEffect. The theme genuinely
 * *is* external state — it lives on a DOM attribute, written by the inline
 * script in layout.tsx before React boots and by the header toggle afterwards.
 * Mirroring it into React state means a render, then an effect, then a second
 * render; this reads it during render and re-renders only when it actually
 * changes.
 *
 * A MutationObserver rather than a matchMedia listener, because the attribute
 * reflects an explicit user choice that can override the OS preference.
 */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function getSnapshot(): "light" | "dark" {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

/**
 * The server has no DOM, so it always renders the light theme. The inline
 * script has already stamped the real theme on <html> before hydration, so the
 * first client render corrects it without a visible flash.
 */
function getServerSnapshot(): "light" | "dark" {
  return "light";
}

export function useTheme(): "light" | "dark" {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

const noopSubscribe = () => () => {};

/**
 * False during server render and the hydration pass, true afterwards.
 *
 * Portals need a real `document`, so Modal and Drawer must not render one until
 * the client has taken over. The usual `useState(false)` + `useEffect(setTrue)`
 * does this with an extra render; this expresses the same thing as what it
 * actually is — a value that differs between the server and client snapshots.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
