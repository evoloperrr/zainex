"use client";

// ZAINEX_DASHBOARD_CURRENCY_V1

import { CURRENCIES, CurrencyCode } from "@/lib/currency";

import { useCurrency } from "./currency-provider";
import styles from "./currency-switcher.module.css";

export function CurrencySwitcher() {
  const { currency, setCurrency } =
    useCurrency();

  return (
    <div className={styles.switcher}>
      <select
        className={styles.select}
        value={currency}
        aria-label="Display currency"
        onChange={(event) => {
          setCurrency(
            event.target
              .value as CurrencyCode,
          );
        }}
      >
        {CURRENCIES.map((entry) => (
          <option
            key={entry.code}
            value={entry.code}
          >
            {entry.code}
          </option>
        ))}
      </select>

      <i
        className={styles.arrow}
        aria-hidden="true"
      />
    </div>
  );
}
