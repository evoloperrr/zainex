// ZAINEX_STRATEGY_FRONTEND_EXPOSURE_GUARD_B2_V1
"use client";

/* ZAINEX_STRATEGY_LOGS_BELOW_CARDS_V1_1 */

/* ZAINEX_STRATEGY_ACTIVATION_FRONTEND_V2_3 */

import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useCurrency,
} from "@/components/currency-provider";

import billingStyles from "../billing/billing.module.css";
import styles from "./ai-strategies.module.css";

import {
  StrategyTransactionLogs,
} from "./strategy-transaction-logs";

import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

const strategies = [
  {
    tier: "FREE TIER",
    name: "Guarantrade Variable Rate Strategy",
    rate: "1%",
    rateType: "VARIABLE RATE",
    creditCost: 0,
  },
  {
    tier: "VIP 1",
    name: "Guarantrade Fix Rate Strategy",
    rate: "1%",
    rateType: "FIX RATE",
    creditCost: 5,
  },
  {
    tier: "VIP 2",
    name: "Guarantrade Fix Rate Strategy",
    rate: "2%",
    rateType: "FIX RATE",
    creditCost: 15,
  },
  {
    tier: "VIP 3",
    name: "Guarantrade Fix Rate Strategy",
    rate: "3%",
    rateType: "FIX RATE",
    creditCost: 45,
  },
] as const;

type Strategy =
  (typeof strategies)[number];

const tierRanks: Record<
  Strategy["tier"],
  number
> = {
  "FREE TIER": 0,
  "VIP 1": 1,
  "VIP 2": 2,
  "VIP 3": 3,
};

type AccountUser = {
  walletBalance?: number | string;
  credits?: number | string;
};

type AccountData = {
  availableBalance?: number | string;
  usedMargin?: number | string;
  strategyLockedBalance?: number | string;
  user?: AccountUser | null;
};

type AccountPayload = {
  ok?: boolean;
  account?: AccountData;
  error?: {
    message?: string;
  };
};

type ActivationPayload = {
  ok?: boolean;
  result?: {
    activation?: {
      tier?: string;
      allocatedAmount?: number | string;
      creditCost?: number | string;
      status?: string;
    };
    account?: {
      walletBalance?: number | string;
      availableBalance?: number | string;
      lockedBalance?: number | string;
      strategyLockedBalance?: number | string;
      credits?: number | string;
    };
    autoTradingEnabled?: boolean;
    automaticOrderCreated?: boolean;
  };
  error?: {
    message?: string;
  };
};

function toNumber(
  value: unknown,
): number {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function readErrorMessage(
  payload: unknown,
  fallback: string,
): string {
  if (
    typeof payload !== "object" ||
    payload === null
  ) {
    return fallback;
  }

  const record =
    payload as Record<string, unknown>;

  if (
    typeof record.error === "object" &&
    record.error !== null
  ) {
    const error =
      record.error as Record<string, unknown>;

    if (
      typeof error.message === "string" &&
      error.message.trim() !== ""
    ) {
      return error.message;
    }
  }

  return fallback;
}

export function StrategyActivationGrid() {
  const {
    formatUsd,
    currencySymbol,
    convertUsd,
    toUsd,
  } = useCurrency();

  function formatCreditsAmount(
    value: number,
  ): string {
    return Math.round(
      convertUsd(value),
    ).toLocaleString("en-US");
  }

  const [account, setAccount] =
    useState<AccountData | null>(null);

  const [accountLoading, setAccountLoading] =
    useState(true);

  const [activeTier, setActiveTier] =
    useState<Strategy["tier"]>("FREE TIER");

  const [exposureLoading, setExposureLoading] =
    useState(true);

  const [activationAllowed, setActivationAllowed] =
    useState(false);

  const [exposureNote, setExposureNote] =
    useState("");

  const [selected, setSelected] =
    useState<Strategy | null>(null);

  const [amount, setAmount] =
    useState("");

  const [clientRequestId, setClientRequestId] =
    useState("");

  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadAccount(): Promise<void> {
      setAccountLoading(true);

      try {
        const response = await fetch(
          "/api/trading/futures/account",
          {
            cache: "no-store",
          },
        );

        const payload =
          (await response.json()) as AccountPayload;

        if (
          !response.ok ||
          !payload.ok ||
          !payload.account
        ) {
          throw new Error(
            payload.error?.message ??
              "Unable to load your wallet.",
          );
        }

        if (!cancelled) {
          setAccount(payload.account);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load your wallet.",
          );
        }
      } finally {
        if (!cancelled) {
          setAccountLoading(false);
        }
      }
    }

    void loadAccount();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentStrategy(): Promise<void> {
      try {
        const response = await fetch(
          "/api/trading/futures/strategies/current",
          {
            cache: "no-store",
          },
        );

        const payload =
          (await response.json()) as {
            ok?: boolean;
            currentStrategy?: {
              tier?: string;
            };
            tradingExposure?: {
              activationAllowed?: boolean;
              openPositions?: number;
              pendingOrders?: number;
              note?: string | null;
            };
          };

        const exposure =
          payload.tradingExposure;

        if (
          !cancelled &&
          exposure
        ) {
          const allowed =
            exposure.activationAllowed === true;

          setActivationAllowed(allowed);
          setExposureNote(
            allowed
              ? ""
              : exposure.note ??
                  "Close all open positions and cancel all pending orders before activating or adding a strategy.",
          );
        }

        if (
          !response.ok ||
          !payload.ok ||
          !payload.currentStrategy?.tier
        ) {
          return;
        }

        const matchingStrategy =
          strategies.find(
            (strategy) =>
              strategy.tier ===
              payload.currentStrategy?.tier,
          );

        if (
          !cancelled &&
          matchingStrategy
        ) {
          setActiveTier(
            matchingStrategy.tier,
          );
        }
      } catch {
        if (!cancelled) {
          setActivationAllowed(false);
          setExposureNote(
            "Unable to verify trading exposure. Refresh the page before activating a strategy.",
          );
        }
      } finally {
        if (!cancelled) {
          setExposureLoading(false);
        }
      }
    }

    void loadCurrentStrategy();

    const refreshTimer = window.setInterval(
      () => {
        void loadCurrentStrategy();
      },
      5000,
    );

    function handleWindowFocus(): void {
      void loadCurrentStrategy();
    }

    window.addEventListener(
      "focus",
      handleWindowFocus,
    );

    return () => {
      cancelled = true;

      window.clearInterval(
        refreshTimer,
      );

      window.removeEventListener(
        "focus",
        handleWindowFocus,
      );
    };
  }, []);

  useBodyScrollLock(
    selected !== null,
  );

  useEffect(() => {
    if (!selected) {
      return;
    }

    function handleEscape(
      event: KeyboardEvent,
    ): void {
      if (
        event.key === "Escape" &&
        !submitting
      ) {
        setSelected(null);
        setAmount("");
        setError("");
        setSuccess("");
        setClientRequestId("");
      }
    }

    window.addEventListener(
      "keydown",
      handleEscape,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleEscape,
      );
    };
  }, [selected, submitting]);

  const walletBalance =
    toNumber(
      account?.user?.walletBalance,
    );

  const availableBalance =
    toNumber(
      account?.availableBalance,
    );

  const currentCredits =
    toNumber(
      account?.user?.credits,
    );

  const numericAmount = useMemo(
    () =>
      toUsd(Number(amount)),
    [amount, toUsd],
  );

  const amountIsValid =
    Number.isFinite(numericAmount) &&
    numericAmount > 0;

  const exceedsAvailable =
    amountIsValid &&
    numericAmount > availableBalance;

  const exceedsWallet =
    amountIsValid &&
    numericAmount > walletBalance;

  const lacksCredits =
    selected !== null &&
    currentCredits < selected.creditCost;

  const canSubmit =
    selected !== null &&
    amountIsValid &&
    !exceedsAvailable &&
    !exceedsWallet &&
    !lacksCredits &&
    !accountLoading &&
    !exposureLoading &&
    activationAllowed &&
    !submitting &&
    success === "";

  const walletAfter =
    walletBalance;

  const availableAfter =
    amountIsValid
      ? availableBalance - numericAmount
      : availableBalance;

  const creditsAfter =
    selected
      ? currentCredits - selected.creditCost
      : currentCredits;

  function openModal(
    strategy: Strategy,
  ): void {
    if (
      exposureLoading ||
      !activationAllowed
    ) {
      return;
    }

    setSelected(strategy);
    setAmount("");
    setError("");
    setSuccess("");
    setClientRequestId(
      crypto.randomUUID(),
    );
  }

  function closeModal(): void {
    if (submitting) {
      return;
    }

    setSelected(null);
    setAmount("");
    setError("");
    setSuccess("");
    setClientRequestId("");
  }

  async function activateStrategy(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (
      !selected ||
      !canSubmit
    ) {
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const response = await fetch(
        "/api/trading/futures/strategies/activate",
        {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            tier: selected.tier,
            amount:
              numericAmount.toFixed(2),
            clientRequestId,
          }),
        },
      );

      const payload =
        (await response.json()) as
          ActivationPayload;

      if (
        !response.ok ||
        !payload.ok ||
        !payload.result?.account
      ) {
        throw new Error(
          readErrorMessage(
            payload,
            "Strategy activation failed.",
          ),
        );
      }

      const updated =
        payload.result.account;

      setAccount((current) => ({
        ...(current ?? {}),
        availableBalance:
          toNumber(updated.availableBalance),
        usedMargin:
          toNumber(updated.lockedBalance),
        strategyLockedBalance:
          toNumber(
            updated.strategyLockedBalance,
          ),
        user: {
          ...(current?.user ?? {}),
          walletBalance:
            toNumber(updated.walletBalance),
          credits:
            toNumber(updated.credits),
        },
      }));

      setActiveTier((currentTier) =>
        tierRanks[selected.tier] >
        tierRanks[currentTier]
          ? selected.tier
          : currentTier,
      );

      window.dispatchEvent(
        new Event("zainex-strategy-log-refresh"),
      );

      setSuccess(
        `${selected.tier} activated with ` +
          `${formatUsd(numericAmount)} allocation.`,
      );
    } catch (activationError) {
      setError(
        activationError instanceof Error
          ? activationError.message
          : "Strategy activation failed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {!exposureLoading &&
      !activationAllowed ? (
        <div
          className={styles.exposureNotice}
          role="status"
        >
          <strong>
            Strategy activation temporarily unavailable
          </strong>

          <span>
            {exposureNote}
          </span>
        </div>
      ) : null}

      <section
        className={`${billingStyles.plans} ${styles.strategyPlans}`}
        aria-label="Guarantrade strategy tiers"
      >
        {strategies.map((strategy) => (
          <article
            key={strategy.tier}
            className={[
              billingStyles.card,
              styles.strategyCard,
              strategy.tier === activeTier
                ? billingStyles.featured
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div className={styles.strategyTopline}>
              <span className={billingStyles.planName}>
                {strategy.tier}
              </span>

              <span className={styles.creditBadge}>
                {formatCreditsAmount(
                  strategy.creditCost,
                )}{" "}
                CREDITS
              </span>
            </div>

            <h2 className={styles.strategyTitle}>
              {strategy.name}
            </h2>

            <div className={billingStyles.divider} />

            <span className={styles.rateLabel}>
              {strategy.rateType}
            </span>

            <strong className={styles.rateValue}>
              {strategy.rate}
            </strong>

            <button
              type="button"
              className={styles.activateButton}
              disabled={
                exposureLoading ||
                !activationAllowed
              }
              title={
                exposureLoading
                  ? "Checking trading exposure..."
                  : activationAllowed
                    ? "Activate strategy"
                    : exposureNote
              }
              onClick={() => {
                openModal(strategy);
              }}
            >
              Activate Strategy
            </button>
          </article>
        ))}
      </section>

      <StrategyTransactionLogs />

      {selected ? (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeModal();
            }
          }}
        >
          <section
            className={styles.activationModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="activation-modal-title"
          >
            <header className={styles.modalHeader}>
              <div>
                <span className={styles.modalTier}>
                  {selected.tier}
                </span>

                <h2 id="activation-modal-title">
                  Activate strategy
                </h2>
              </div>

              <button
                type="button"
                className={styles.closeButton}
                onClick={closeModal}
                disabled={submitting}
                aria-label="Close activation modal"
              >
                {"\u00d7"}
              </button>
            </header>

            <p className={styles.modalCopy}>
              Enter the trading amount you want
              to allocate to this strategy.
            </p>

            <div className={styles.walletSnapshot}>
              <div>
                <span>Wallet balance</span>

                <strong>
                  {accountLoading
                    ? "Loading..."
                    : formatUsd(walletBalance)}
                </strong>
              </div>

              <div>
                <span>Available balance</span>

                <strong>
                  {accountLoading
                    ? "Loading..."
                    : formatUsd(
                        availableBalance,
                      )}
                </strong>
              </div>

              <div>
                <span>AI credits</span>

                <strong>
                  {accountLoading
                    ? "..."
                    : formatCreditsAmount(
                        currentCredits,
                      )}
                </strong>
              </div>
            </div>

            <form onSubmit={activateStrategy}>
              <label className={styles.amountField}>
                <span>Trading amount</span>

                <div className={styles.amountInputWrap}>
                  <i>{currencySymbol}</i>

                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    inputMode="decimal"
                    placeholder={convertUsd(
                      500,
                    ).toFixed(2)}
                    value={amount}
                    disabled={submitting}
                    autoFocus
                    onChange={(event) => {
                      setAmount(
                        event.target.value,
                      );
                      setError("");
                      setSuccess("");
                    }}
                  />
                </div>
              </label>

              <div className={styles.summaryGrid}>
                <div>
                  <span>Strategy</span>
                  <strong>{selected.tier}</strong>
                </div>

                <div>
                  <span>Credit cost</span>
                  <strong>
                    {formatCreditsAmount(
                      selected.creditCost,
                    )}{" "}
                    credits
                  </strong>
                </div>

                <div>
                  <span>Rate</span>
                  <strong>
                    {selected.rateType}{" "}
                    {selected.rate}
                  </strong>
                </div>

                <div>
                  <span>Wallet after</span>
                  <strong>
                    {formatUsd(
                      Math.max(0, walletAfter),
                    )}
                  </strong>
                </div>

                <div>
                  <span>Available after</span>
                  <strong>
                    {formatUsd(
                      Math.max(
                        0,
                        availableAfter,
                      ),
                    )}
                  </strong>
                </div>

                <div>
                  <span>Credits after</span>
                  <strong>
                    {formatCreditsAmount(
                      Math.max(
                        0,
                        creditsAfter,
                      ),
                    )}
                  </strong>
                </div>
              </div>

              {exceedsAvailable ? (
                <p className={styles.modalError}>
                  The amount exceeds your available
                  trading balance.
                </p>
              ) : null}

              {!exceedsAvailable &&
              exceedsWallet ? (
                <p className={styles.modalError}>
                  The amount exceeds your wallet
                  balance.
                </p>
              ) : null}

              {lacksCredits ? (
                <p className={styles.modalError}>
                  You do not have enough AI credits
                  for this strategy.
                </p>
              ) : null}

              {error ? (
                <p className={styles.modalError}>
                  {error}
                </p>
              ) : null}

              {success ? (
                <p className={styles.modalSuccess}>
                  {success}
                </p>
              ) : null}

              <p className={styles.safetyNote}>
                Activation deducts the allocation
                and credit cost, but it does not
                open a Futures position or enable
                automatic trading.
              </p>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={closeModal}
                  disabled={submitting}
                >
                  {success ? "Done" : "Cancel"}
                </button>

                {!success ? (
                  <button
                    type="submit"
                    className={styles.confirmButton}
                    disabled={!canSubmit}
                  >
                    {submitting
                      ? "Activating..."
                      : `Activate for ${formatCreditsAmount(
                          selected.creditCost,
                        )} credits`}
                  </button>
                ) : null}
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}