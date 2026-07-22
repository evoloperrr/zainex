"use client";

// ZAINEX_DASHBOARD_CURRENCY_V1

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  CurrencyCode,
  FALLBACK_RATES,
  fetchLiveRates,
  formatCurrency,
  formatSignedCurrency,
} from "@/lib/currency";

const STORAGE_KEY =
  "zainex_display_currency_v1";

type CurrencyContextValue = {
  currency: CurrencyCode;
  setCurrency: (
    code: CurrencyCode,
  ) => void;
  formatUsd: (
    amountUsd: number,
  ) => string;
  formatSignedUsd: (
    amountUsd: number,
  ) => string;
};

const CurrencyContext =
  createContext<CurrencyContextValue | null>(
    null,
  );

export function CurrencyProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [currency, setCurrencyState] =
    useState<CurrencyCode>("USD");

  const [rates, setRates] = useState<
    Record<string, number>
  >(FALLBACK_RATES);

  useEffect(() => {
    const stored =
      window.localStorage.getItem(
        STORAGE_KEY,
      );

    if (stored) {
      setCurrencyState(
        stored as CurrencyCode,
      );
    }

    let cancelled = false;

    fetchLiveRates().then(
      (liveRates) => {
        if (
          !cancelled &&
          liveRates
        ) {
          setRates(liveRates);
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  const setCurrency = useCallback(
    (code: CurrencyCode) => {
      setCurrencyState(code);

      window.localStorage.setItem(
        STORAGE_KEY,
        code,
      );
    },
    [],
  );

  const formatUsd = useCallback(
    (amountUsd: number) =>
      formatCurrency(
        amountUsd,
        currency,
        rates,
      ),
    [currency, rates],
  );

  const formatSignedUsd = useCallback(
    (amountUsd: number) =>
      formatSignedCurrency(
        amountUsd,
        currency,
        rates,
      ),
    [currency, rates],
  );

  const value = useMemo(
    () => ({
      currency,
      setCurrency,
      formatUsd,
      formatSignedUsd,
    }),
    [
      currency,
      setCurrency,
      formatUsd,
      formatSignedUsd,
    ],
  );

  return (
    <CurrencyContext.Provider
      value={value}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyContextValue {
  const context = useContext(
    CurrencyContext,
  );

  if (!context) {
    throw new Error(
      "useCurrency must be used within a CurrencyProvider",
    );
  }

  return context;
}
