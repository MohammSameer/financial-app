"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import styles from "./MultiSelect.module.css";

export interface MultiSelectOption {
  value: string;
  label: string;
  count?: number;
  colour?: string | null;
}

export interface MultiSelectProps {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Trigger text when nothing is selected. */
  placeholder?: string;
}

/**
 * Checkbox multi-select in a popover.
 *
 * A native <select multiple> is the obvious alternative, but it needs
 * Ctrl+click to select more than one thing — which almost nobody discovers,
 * and which is unusable on touch. Since the brief calls for combinable
 * filters, the control has to make "more than one" the easy path.
 */
export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder = "All",
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  // Close on an outside click or Escape. Both listeners are only attached
  // while open — leaving a document-level listener running for every filter on
  // the page would be needless work on every click in the app.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        // Return focus to the trigger, or Escape leaves the keyboard user
        // stranded at the top of the document.
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Flip the popover above the trigger when it would otherwise run off the
  // bottom of the viewport. Measured in a layout effect so it happens before
  // paint and the user never sees it jump.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setDropUp(spaceBelow < 300 && rect.top > spaceBelow);
  }, [open]);

  function toggle(value: string) {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  }

  const triggerLabel =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
        : `${selected.length} selected`;

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${selected.length ? styles.triggerActive : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={open ? listId : undefined}
        aria-label={`${label}: ${triggerLabel}`}
      >
        <span className={styles.triggerLabel}>{triggerLabel}</span>
        {selected.length > 1 ? (
          <span className={styles.count}>{selected.length}</span>
        ) : (
          <svg
            className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}
            width="12"
            height="12"
            viewBox="0 0 12 12"
            aria-hidden="true"
          >
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      {open && (
        <div
          className={`${styles.popover} ${dropUp ? styles.popoverUp : ""}`}
          id={listId}
        >
          <div className={styles.list} role="group" aria-label={label}>
            {options.map((option) => {
              const checked = selected.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  className={styles.option}
                  // role=checkbox + aria-checked, because this is a toggle
                  // that stays open, not a menu item that dismisses.
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => toggle(option.value)}
                >
                  <span
                    className={`${styles.checkbox} ${checked ? styles.checkboxOn : ""}`}
                    aria-hidden="true"
                  >
                    <svg width="9" height="9" viewBox="0 0 10 10">
                      <path
                        d="M1.5 5l2.5 2.5 4.5-5"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  {option.colour && (
                    <span
                      className={styles.swatch}
                      style={{ background: option.colour }}
                      aria-hidden="true"
                    />
                  )}
                  <span className={styles.optionLabel}>{option.label}</span>
                  {option.count != null && (
                    <span className={styles.optionCount}>
                      {option.count.toLocaleString("en-IN")}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className={styles.footer}>
            <button
              type="button"
              className={styles.footerButton}
              onClick={() => onChange(options.map((o) => o.value))}
              disabled={selected.length === options.length}
            >
              Select all
            </button>
            <button
              type="button"
              className={styles.footerButton}
              onClick={() => onChange([])}
              disabled={selected.length === 0}
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
