"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BalanceProvider } from "@/lib/BalanceContext";
import { MetaProvider } from "@/lib/MetaContext";
import { useTheme } from "@/lib/useTheme";
import { CoinPill } from "./CoinPill";
import { ToastProvider } from "./ui/Toast";
import styles from "./AppShell.module.css";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/rewards", label: "Rewards" },
];

function ThemeToggle() {
  // Reads the attribute the inline script in layout.tsx already applied. The
  // DOM is the single source of truth for the theme — there is no React copy of
  // it to fall out of step, and writing the attribute below is what re-renders
  // every subscriber, including the charts.
  const theme = useTheme();

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("coinstack-theme", next);
    } catch {
      // Private browsing can refuse localStorage. The toggle should still
      // work for this session rather than throwing.
    }
  }

  return (
    <button
      type="button"
      className={styles.themeToggle}
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
    >
      {theme === "dark" ? (
        <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="3.6" fill="currentColor" />
          <path
            d="M10 1.5v2M10 16.5v2M18.5 10h-2M3.5 10h-2M15.9 4.1l-1.4 1.4M5.5 14.5l-1.4 1.4M15.9 15.9l-1.4-1.4M5.5 5.5L4.1 4.1"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
          <path
            d="M17 12.3A7.5 7.5 0 017.7 3a7.5 7.5 0 109.3 9.3z"
            fill="currentColor"
          />
        </svg>
      )}
    </button>
  );
}

/**
 * App chrome: header, nav, the always-visible coin balance, and the providers
 * every page needs.
 *
 * The balance lives up here because the brief requires it to be visible at all
 * times, not only on the rewards page.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <ToastProvider>
      <MetaProvider>
        <BalanceProvider>
        <div className={styles.shell}>
          {/* First tab stop on the page, so a keyboard user can jump the
              filter bar and land on the table. */}
          <a href="#main" className="skipLink">
            Skip to content
          </a>

          <header className={styles.header}>
            <Link href="/" className={styles.brand}>
              <span className={styles.logo} aria-hidden="true">
                C
              </span>
              <span className={styles.brandText}>CoinStack</span>
            </Link>

            <nav className={styles.nav} aria-label="Main">
              {NAV.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
                    // Tells a screen reader which page it is on, which the
                    // colour change alone does not.
                    aria-current={active ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className={styles.spacer} />

            <div className={styles.headerRight}>
              <CoinPill />
              <ThemeToggle />
            </div>
          </header>

          <main className={styles.main} id="main">
            {children}
          </main>

          <footer className={styles.footer}>
            CoinStack · built for the Digital Alpha take-home · data is synthetic
          </footer>
          </div>
        </BalanceProvider>
      </MetaProvider>
    </ToastProvider>
  );
}
