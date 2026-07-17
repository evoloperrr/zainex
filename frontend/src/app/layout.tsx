import { MobileAppFloatingNav } from "@/components/mobile-app-floating-nav";
// ZAINEX_GLOBAL_MOBILE_FLOATING_NAV_V1_1
import type {
  Metadata,
} from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default:
      "ZAINEX | AI-Native Market Intelligence",
    template:
      "%s | ZAINEX",
  },
  description:
    "ZAINEX unifies market intelligence, deterministic risk controls, manual paper execution, strategies, wallets, and AI credits in one professional platform.",
  keywords: [
    "ZAINEX",
    "AI trading platform",
    "paper trading",
    "market intelligence",
    "risk management",
    "crypto trading",
  ],
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}<MobileAppFloatingNav /></body>
    </html>
  );
}
