"use client";

// ZAINEX_DASHBOARD_CURRENCY_V1

import { CurrencyProvider } from "@/components/currency-provider";

export function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CurrencyProvider>
      {children}
    </CurrencyProvider>
  );
}
