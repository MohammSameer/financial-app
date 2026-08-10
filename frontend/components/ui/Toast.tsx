"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import styles from "./Toast.module.css";

type ToastTone = "success" | "error" | "info";

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
}

interface ToastContextValue {
  push: (toast: Omit<Toast, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = nextId++;
      setToasts((all) => [...all, { ...toast, id }]);
      // Errors linger, successes get out of the way. Someone who needs to read
      // and act on a failure should not be racing a timer.
      setTimeout(() => dismiss(id), toast.tone === "error" ? 7000 : 4000);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/*
        role="status" with aria-live="polite" announces the toast to a screen
        reader without interrupting whatever it is currently reading. The
        region is always in the DOM, empty or not — a live region added at the
        same moment as its content is frequently missed entirely.
      */}
      <div
        className={styles.viewport}
        role="status"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => (
          <div key={toast.id} className={`${styles.toast} ${styles[toast.tone]}`}>
            <span className={styles.icon} aria-hidden="true">
              {toast.tone === "success" ? (
                <svg width="15" height="15" viewBox="0 0 16 16">
                  <path
                    d="M3.5 8.5l3 3 6-6.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : toast.tone === "error" ? (
                <svg width="15" height="15" viewBox="0 0 16 16">
                  <path
                    d="M8 4.5v4.5M8 11.5h.01"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 16 16">
                  <path
                    d="M8 7.5v4M8 4.5h.01"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </span>
            <div className={styles.content}>
              <div className={styles.title}>{toast.title}</div>
              {toast.body && <div className={styles.body}>{toast.body}</div>}
            </div>
            <button
              type="button"
              className={styles.close}
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
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
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside a ToastProvider");
  return ctx;
}
