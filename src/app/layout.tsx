import type { Metadata } from "next";
import "./globals.css";
import { ThemeScript } from "@/components/theme-script";

export const metadata: Metadata = {
  title: "CopyTrade Cloud — MT5 Copy Trading Platform",
  description: "Cloud copy trading for MetaTrader 5. No VPS, no EA installation.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
