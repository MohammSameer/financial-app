import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

/**
 * next/font self-hosts and preloads these at build time. That removes the
 * render-blocking request to Google's CDN and, more importantly, eliminates
 * the layout shift a late-arriving webfont causes in a dense table.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "CoinStack — spend and rewards",
  description:
    "Pay your card bills, track where the money goes, and turn spending into coins.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Not capped and not user-scalable:false. Blocking zoom is a genuine
  // accessibility failure for anyone with low vision, and it buys nothing.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1120" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Applies the saved theme before first paint. Doing this in an effect
          would render the light theme first and then flip, which is a jarring
          white flash for anyone using dark mode.

          suppressHydrationWarning above is required because this script
          mutates the html element before React hydrates.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var stored = localStorage.getItem('coinstack-theme');
                  var theme = stored ||
                    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
                  document.documentElement.setAttribute('data-theme', theme);
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className={`${inter.variable} ${jetbrains.variable}`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
