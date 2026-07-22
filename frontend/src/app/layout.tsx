import { MobileAppFloatingNav } from "@/components/mobile-app-floating-nav";
// ZAINEX_GLOBAL_MOBILE_FLOATING_NAV_V1_1
import type {
  Metadata,
} from "next";

import {
  Bricolage_Grotesque,
  Inter,
} from "next/font/google";

import { Providers } from "./providers";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// ZAINEX_PUBLIC_SITE_DISPLAY_TYPEFACE_V1
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default:
      "ZAINEX | AI-Native Market Intelligence",
    template:
      "%s | ZAINEX",
  },
  description:
    "ZAINEX unifies market intelligence, deterministic risk controls, manual execution, strategies, wallets, and AI credits in one professional platform.",
  keywords: [
    "ZAINEX",
    "AI trading platform",
    "trading",
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
    <html
      lang="en"
      className={`${inter.variable} ${bricolage.variable}`}
    >
      <body>
        <Providers>
          {children}
          <MobileAppFloatingNav />
        </Providers>
      </body>
    </html>
  );
}
