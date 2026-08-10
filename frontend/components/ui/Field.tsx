"use client";

import { forwardRef, useId } from "react";
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import styles from "./Field.module.css";

/** Label + control wrapper. Always renders a real <label for>. */
export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <span className={styles.hint}>{hint}</span>}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leadingIcon?: ReactNode;
  /** Shows a clear button when there is a value. */
  onClear?: () => void;
  /** Spinner in the trailing slot, for a debounced search in flight. */
  busy?: boolean;
  numeric?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { leadingIcon, onClear, busy, numeric, className, value, ...rest },
  ref,
) {
  const showClear = Boolean(onClear) && Boolean(value);
  const showTrailing = showClear || busy;

  return (
    <div className={styles.control}>
      {leadingIcon && (
        <span className={styles.leadingIcon} aria-hidden="true">
          {leadingIcon}
        </span>
      )}
      <input
        ref={ref}
        value={value}
        className={[
          styles.input,
          leadingIcon && styles.hasLeadingIcon,
          showTrailing && styles.hasTrailing,
          numeric && styles.numeric,
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      />
      {showTrailing && (
        <span className={styles.trailing}>
          {busy ? (
            <span className={styles.searchSpinner} aria-hidden="true" />
          ) : (
            <button
              type="button"
              className={styles.clear}
              onClick={onClear}
              aria-label="Clear"
            >
              <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
                <path
                  d="M3 3l6 6M9 3l-6 6"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </span>
      )}
    </div>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: string; label: string; count?: number }[];
  /** Shown as the value for "no filter". */
  placeholder?: string;
}

/**
 * A restyled native <select>.
 *
 * Deliberately native rather than a custom listbox: it gets keyboard
 * type-ahead, mobile wheel pickers and screen-reader support for free, all of
 * which a hand-rolled dropdown tends to get subtly wrong.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, placeholder, className, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={[styles.select, className].filter(Boolean).join(" ")}
      {...rest}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
          {o.count != null ? ` (${o.count.toLocaleString("en-IN")})` : ""}
        </option>
      ))}
    </select>
  );
});

/** Stable ids for label/control pairs. */
export function useFieldId(prefix: string) {
  const id = useId();
  return `${prefix}-${id}`;
}
