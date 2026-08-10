"use client";

import { useEffect, type RefObject } from "react";

/**
 * Selector for things that can actually receive focus.
 *
 * `:not([disabled])` matters because a disabled control still matches
 * `button` and would become a dead stop in the tab cycle. The negative
 * tabindex exclusion matters because those elements are focusable
 * programmatically but deliberately skipped by Tab.
 */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    // querySelectorAll finds elements inside a `display: none` subtree too.
    // offsetParent is null for those, and focusing one moves focus nowhere,
    // which looks to the user like Tab has simply stopped working.
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/**
 * Traps Tab focus inside a container while it is open, restores focus on
 * close, and locks background scroll.
 *
 * Written by hand rather than pulled from a library because the brief asks for
 * it, and because the three parts people usually forget — restoring focus to
 * the element that opened the dialog, compensating for scrollbar width, and
 * handling Shift+Tab off the first element — are exactly what makes a modal
 * feel broken to keyboard users when they are missing.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onEscape?: () => void,
) {
  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    // Remember where focus came from, so it can go back there on close. A
    // keyboard user who opens a dialog from row 40 of a table must not be
    // dumped back at the top of the document when it closes.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Move focus into the dialog. Prefer an element marked autofocus,
    // otherwise the first focusable, otherwise the container itself.
    const initial =
      container.querySelector<HTMLElement>("[data-autofocus]") ??
      focusableWithin(container)[0] ??
      container;
    initial.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && onEscape) {
        event.stopPropagation();
        onEscape();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = focusableWithin(container!);
      if (focusable.length === 0) {
        // Nothing to cycle through: keep focus on the container rather than
        // letting Tab escape to the page behind.
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;

      if (event.shiftKey && (current === first || current === container)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);

    // Lock background scroll. Removing the scrollbar changes the layout width,
    // so its width is added back as padding — otherwise the whole page visibly
    // jumps sideways the instant the dialog opens.
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const { overflow, paddingRight } = document.body.style;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      // Only restore focus if it is still inside the closing dialog. If the
      // user has already clicked elsewhere, yanking focus back would be worse
      // than leaving it alone.
      if (previouslyFocused?.isConnected && container?.contains(document.activeElement)) {
        previouslyFocused.focus();
      }
    };
  }, [ref, active, onEscape]);
}
