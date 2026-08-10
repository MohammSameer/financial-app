"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "@/lib/useFocusTrap";
import styles from "./Drawer.module.css";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  eyebrow?: string;
  children: ReactNode;
}

/**
 * Right-hand detail drawer, sharing the modal's focus-trap behaviour.
 *
 * A drawer rather than a modal for transaction detail: it keeps the table
 * visible behind it, so a user comparing several rows can open, glance, close
 * and move to the next without losing their place in a 10,000-row list.
 */
export function Drawer({ open, onClose, title, eyebrow, children }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useFocusTrap(panelRef, open && mounted, onClose);

  if (!open || !mounted) return null;

  return createPortal(
    <>
      {/* Presentational: the real close affordances are the button and
          Escape, both of which are keyboard reachable. */}
      <div className={styles.overlay} onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className={styles.header}>
          <div className={styles.titleWrap}>
            {eyebrow && <div className={styles.eyebrow}>{eyebrow}</div>}
            <h2 className={styles.title} id={titleId}>
              {title}
            </h2>
          </div>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close details"
            data-autofocus
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
        <div className={styles.body}>{children}</div>
      </div>
    </>,
    document.body,
  );
}
