"use client";

import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { useIsClient } from "@/lib/useTheme";
import styles from "./Modal.module.css";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** CSS width for the dialog. */
  width?: string;
  /**
   * Blocks closing via Escape or backdrop click. Used while a redeem request
   * is in flight, so the user can't dismiss the dialog and lose the outcome
   * of a call that is still going to land.
   */
  busy?: boolean;
}

/**
 * Hand-built modal dialog.
 *
 * No component library. It handles the things that make a dialog actually
 * usable rather than merely visible:
 *   - focus moves in on open and returns to the trigger on close
 *   - Tab and Shift+Tab cycle within the dialog
 *   - Escape closes, unless busy
 *   - background scroll locks without the page jumping
 *   - a backdrop click closes, but only if the drag started on the backdrop
 *   - rendered in a portal, so an ancestor's overflow or transform cannot clip
 *     or reposition it
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width,
  busy = false,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  // Portals need a document. False on the server and through hydration, so no
  // mismatch.
  const mounted = useIsClient();

  useFocusTrap(dialogRef, open && mounted, busy ? undefined : onClose);

  // Tracks whether the pointer went down on the backdrop itself. Without this,
  // selecting text inside the dialog and releasing the mouse over the backdrop
  // registers as a backdrop click and throws away what the user was doing.
  const pressedBackdrop = useRef(false);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (!busy && pressedBackdrop.current && e.target === e.currentTarget) {
          onClose();
        }
        pressedBackdrop.current = false;
      }}
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        style={width ? ({ "--modal-width": width } as React.CSSProperties) : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        // Makes the container itself a focus target when it holds no
        // focusable children.
        tabIndex={-1}
      >
        <div className={styles.header}>
          <div className={styles.titleWrap}>
            <h2 className={styles.title} id={titleId}>
              {title}
            </h2>
            {description && (
              <p className={styles.description} id={descId}>
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            disabled={busy}
            aria-label="Close dialog"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {children && <div className={styles.body}>{children}</div>}
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
