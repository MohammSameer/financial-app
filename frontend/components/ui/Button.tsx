import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "coin";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Shows a spinner and blocks clicks, without the button changing width. */
  loading?: boolean;
  fullWidth?: boolean;
  /** Square button for a bare icon. Requires `aria-label` from the caller. */
  iconOnly?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

/**
 * The one button in the app.
 *
 * forwardRef because the Modal needs a real DOM node to move focus to when it
 * opens, and to restore focus to on close.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    fullWidth = false,
    iconOnly = false,
    leadingIcon,
    trailingIcon,
    disabled,
    className,
    children,
    ...rest
  },
  ref,
) {
  const classes = [
    styles.button,
    styles[variant],
    size !== "md" && styles[size],
    fullWidth && styles.fullWidth,
    iconOnly && styles.iconOnly,
    loading && styles.loading,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      ref={ref}
      className={classes}
      // A loading button must not fire again on a second click, so it is
      // genuinely disabled rather than only looking busy.
      disabled={disabled || loading}
      // aria-busy tells a screen reader the control is working. Without it the
      // button simply goes quiet and unresponsive with no explanation.
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      <span className={`${styles.label} ${loading ? styles.loadingLabel : ""}`}>
        {leadingIcon}
        {children}
        {trailingIcon}
      </span>
    </button>
  );
});
