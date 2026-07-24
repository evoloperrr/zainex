"use client";

/* ZAINEX_VIP_CHECKOUT_CHAT_V1 */

import {
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";

import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

import {
  useCurrency,
} from "@/components/currency-provider";

import type { CurrencyCode } from "@/lib/currency";

import styles from "./vip-checkout-chat.module.css";

// ZAINEX_GOTYME_PAYMENT_DETAILS
// Fill these in once the real GoTyme QR + account details are provided,
// then this component needs no other changes.
const GOTYME_QR_IMAGE_SRC =
  "/gotyme-qr.png";
const GOTYME_ACCOUNT_NAME =
  "JOEY GOLDBERG";
const GOTYME_ACCOUNT_NUMBER =
  "016682392474";

const MIN_WALLET_FUNDING_USD = 1;
const MAX_WALLET_FUNDING_USD = 10_000;

// ZAINEX_MERCHANT_REGION_PAYMENT_DETAILS
// Country the buyer names in the billing chat resolves to one of these
// regional merchant rails. Add a new region here (image + recipient name)
// and extend COUNTRY_TO_REGION / the continent fallback below to route
// countries to it — no other change needed.
type MerchantRegion =
  | "north_america"
  | "south_asia"
  | "east_asia"
  | "philippines";

type MerchantRegionConfig = {
  rail: string;
  qrImageSrc: string;
  recipientName: string;
  recipientLabel: string;
  accountNumber?: string;
  appNote: string;
};

const MERCHANT_REGION_CONFIG: Record<
  MerchantRegion,
  MerchantRegionConfig
> = {
  north_america: {
    rail: "ZELLE",
    qrImageSrc: "/merchants/zelle-qr.png",
    recipientName: "MALIC EASTON",
    recipientLabel: "Recipient name",
    appNote:
      "Scan or send within your bank's Zelle® feature.",
  },
  south_asia: {
    rail: "PAYTM",
    qrImageSrc: "/merchants/paytm-qr.png",
    recipientName: "Khari Akshat",
    recipientLabel: "Recipient name",
    appNote:
      "Scan in the Paytm app — Wallet, Card, or UPI.",
  },
  east_asia: {
    rail: "ALIPAY HK",
    qrImageSrc: "/merchants/alipay-qr.png",
    recipientName: "Liu Zhu Wu",
    recipientLabel: "Recipient name",
    appNote:
      "Scan in the Alipay HK app.",
  },
  philippines: {
    rail: "GOTYME",
    qrImageSrc: GOTYME_QR_IMAGE_SRC,
    recipientName: GOTYME_ACCOUNT_NAME,
    recipientLabel: "Account name",
    accountNumber:
      GOTYME_ACCOUNT_NUMBER,
    appNote:
      "Send via a GoTyme bank transfer.",
  },
};

// The country the buyer names also drives which display currency the
// whole billing chat switches to, so the amount they see matches the
// merchant rail they're about to pay through.
const MERCHANT_REGION_CURRENCY: Record<
  MerchantRegion,
  CurrencyCode
> = {
  north_america: "USD",
  south_asia: "INR",
  east_asia: "HKD",
  philippines: "PHP",
};

// Explicit country/keyword matches, checked first.
const COUNTRY_TO_REGION: Array<{
  region: MerchantRegion;
  keywords: string[];
}> = [
  {
    region: "philippines",
    keywords: [
      "philippines",
      "pilipinas",
      "ph",
    ],
  },
  {
    region: "north_america",
    keywords: [
      "united states",
      "usa",
      "u.s.",
      "us",
      "america",
      "canada",
      "mexico",
    ],
  },
  {
    region: "south_asia",
    keywords: [
      "india",
      "nepal",
      "bangladesh",
      "sri lanka",
      "pakistan",
      "bhutan",
      "maldives",
    ],
  },
  {
    region: "east_asia",
    keywords: [
      "china",
      "hong kong",
      "hongkong",
      "hk",
      "macau",
      "macao",
      "taiwan",
      "mongolia",
    ],
  },
];

// Broad continent/region fallback for a country we don't recognize by
// name — picks whichever existing rail is geographically nearest.
// NOTE: Europe doesn't have a dedicated rail yet, so it currently falls
// back to Zelle (North America) until a Europe rail is added.
const CONTINENT_FALLBACK: Array<{
  region: MerchantRegion;
  keywords: string[];
}> = [
  {
    region: "north_america",
    keywords: [
      "north america",
      "south america",
      "latin america",
      "caribbean",
      "europe",
    ],
  },
  {
    region: "south_asia",
    keywords: [
      "south asia",
      "central asia",
      "southeast asia",
      "middle east",
      "africa",
    ],
  },
  {
    region: "east_asia",
    keywords: [
      "east asia",
      "asia pacific",
      "oceania",
      "australia",
      "pacific",
    ],
  },
];

function resolveMerchantRegion(
  countryInput: string,
): MerchantRegion {
  const normalized = countryInput
    .trim()
    .toLowerCase();

  for (const entry of COUNTRY_TO_REGION) {
    if (
      entry.keywords.some((keyword) =>
        normalized.includes(keyword),
      )
    ) {
      return entry.region;
    }
  }

  for (const entry of CONTINENT_FALLBACK) {
    if (
      entry.keywords.some((keyword) =>
        normalized.includes(keyword),
      )
    ) {
      return entry.region;
    }
  }

  // Ultimate catch-all for anything unrecognized.
  return "north_america";
}

type VipPlan = {
  name: string;
  price: string;
  period: string;
};

type VipCheckoutChatProps = {
  plan: VipPlan;
  onClose: () => void;
  mode?: "subscription" | "wallet";
  billingCycle?: "monthly" | "annual";
};

type PaymentMethod =
  | "merchant"
  | "crypto";

type PaymentContext =
  | "subscription"
  | "wallet";

type ScriptStep =
  | {
      kind: "message";
      text: string;
    }
  | {
      kind: "payment";
      method: PaymentMethod;
      forWallet: boolean;
    };

type CryptoInvoice = {
  paymentId: string;
  payAddress: string;
  payAmount: string | null;
  payCurrency: string;
  priceAmount: number;
};

type CryptoInvoiceState =
  | {
      phase: "idle";
    }
  | {
      phase: "creating";
    }
  | {
      phase: "error";
      message: string;
    }
  | {
      phase: "ready";
      invoice: CryptoInvoice;
      status: string;
    };

function fileToBase64(
  file: File,
): Promise<string> {
  return new Promise(
    (resolve, reject) => {
      const reader =
        new FileReader();

      reader.onload = () => {
        resolve(
          String(reader.result),
        );
      };

      reader.onerror = () => {
        reject(reader.error);
      };

      reader.readAsDataURL(file);
    },
  );
}

function parsePlanPriceUsd(
  price: string,
): number {
  const numeric = Number(
    price.replace(/[^0-9.]/g, ""),
  );

  return Number.isFinite(numeric)
    ? numeric
    : 0;
}

function cryptoStatusLabel(
  status: string,
): string {
  switch (status) {
    case "waiting":
      return "Waiting for your transfer…";
    case "confirming":
      return "Confirming on the blockchain…";
    case "sending":
      return "Confirmed — finishing up…";
    case "finished":
    case "confirmed":
      return "Confirmed!";
    case "failed":
    case "expired":
      return "This payment expired — close and try again.";
    default:
      return "Checking status…";
  }
}

function buildIntro(
  plan: VipPlan,
  formatUsd: (
    value: number,
  ) => string,
): ScriptStep[] {
  return [
    {
      kind: "message",
      text: "Hi! I'm the ZAINEX billing assistant.",
    },
    {
      kind: "message",
      text: `I see you'd like to activate ${plan.name} — ${formatUsd(parsePlanPriceUsd(plan.price))} ${plan.period}.`,
    },
    {
      kind: "message",
      text: "Want to add funds to your trading wallet in the same payment? Enter an amount below, or leave it blank to skip.",
    },
  ];
}

function buildWalletIntro(): ScriptStep[] {
  return [
    {
      kind: "message",
      text: "Hi! I'm the ZAINEX billing assistant.",
    },
    {
      kind: "message",
      text: "Let's fund your trading wallet — no subscription needed.",
    },
  ];
}

function buildMethodSteps(
  method: PaymentMethod,
  context: PaymentContext,
): ScriptStep[] {
  if (method === "crypto") {
    return [
      {
        kind: "message",
        text: "Got it — here's your one-time crypto payment. It confirms automatically once the transfer lands on-chain:",
      },
      {
        kind: "payment",
        method: "crypto",
        forWallet: context === "wallet",
      },
    ];
  }

  return [
    {
      kind: "message",
      text: "Got it — the fastest way is a manual merchant transfer. Which country are you paying from?",
    },
  ];
}

function merchantOutro(
  context: PaymentContext,
): string {
  return context === "wallet"
    ? "Once you've sent the funds, attach a screenshot below and tap “I've added it.” Our team credits your trading wallet manually — usually within a few hours."
    : "Once you've sent the payment, attach a screenshot of the transfer below and tap “I've sent it.” Our team verifies transfers manually and activates your VIP access shortly after — usually within a few hours.";
}

function useProofUpload() {
  const [
    file,
    setFile,
  ] = useState<File | null>(null);

  const [
    previewUrl,
    setPreviewUrl,
  ] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(
          previewUrl,
        );
      }
    };
  }, [previewUrl]);

  function onFileChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const nextFile =
      event.target.files?.[0] ??
      null;

    setPreviewUrl((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous);
      }

      return nextFile
        ? URL.createObjectURL(
            nextFile,
          )
        : null;
    });

    setFile(nextFile);
  }

  return {
    file,
    previewUrl,
    onFileChange,
  };
}

function useCryptoInvoice(
  active: boolean,
  purpose: PaymentContext,
  planName: string | null,
  amount: number | null,
  onConfirmed: () => void,
  billingCycle:
    | "monthly"
    | "annual"
    | null = null,
  walletTopUpAmount: number | null = null,
): CryptoInvoiceState {
  const [state, setState] =
    useState<CryptoInvoiceState>({
      phase: "idle",
    });

  const onConfirmedRef = useRef(
    onConfirmed,
  );

  useEffect(() => {
    onConfirmedRef.current =
      onConfirmed;
  }, [onConfirmed]);

  useEffect(() => {
    if (!active) {
      return;
    }

    let cancelled = false;
    setState({ phase: "creating" });

    fetch(
      "/api/trading/futures/wallet/crypto/invoice",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          purpose,
          planName:
            planName ?? undefined,
          amount:
            amount ?? undefined,
          billingCycle:
            billingCycle ??
            undefined,
          walletTopUpAmount:
            walletTopUpAmount ??
            undefined,
        }),
      },
    )
      .then(async (response) => {
        const data =
          await response.json();

        if (cancelled) {
          return;
        }

        if (
          !response.ok ||
          !data?.ok
        ) {
          setState({
            phase: "error",
            message:
              data?.error
                ?.message ??
              "Could not create the crypto payment.",
          });
          return;
        }

        setState({
          phase: "ready",
          invoice: {
            paymentId:
              data.paymentId,
            payAddress:
              data.payAddress,
            payAmount:
              data.payAmount ??
              null,
            payCurrency:
              data.payCurrency,
            priceAmount:
              data.priceAmount,
          },
          status: data.status,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setState({
            phase: "error",
            message:
              "Could not reach the crypto payment service.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    active,
    purpose,
    planName,
    amount,
    billingCycle,
    walletTopUpAmount,
  ]);

  const readyPaymentId =
    state.phase === "ready"
      ? state.invoice.paymentId
      : null;

  useEffect(() => {
    if (readyPaymentId === null) {
      return;
    }

    const interval =
      window.setInterval(() => {
        fetch(
          `/api/trading/futures/wallet/crypto/status/${readyPaymentId}`,
        )
          .then(
            async (response) => {
              const data =
                await response.json();

              if (
                !response.ok ||
                !data?.ok
              ) {
                return;
              }

              setState(
                (previous) =>
                  previous.phase ===
                  "ready"
                    ? {
                        ...previous,
                        status:
                          data.status,
                      }
                    : previous,
              );

              if (
                data.status ===
                  "finished" ||
                data.status ===
                  "confirmed"
              ) {
                window.clearInterval(
                  interval,
                );
                onConfirmedRef.current();
              }
            },
          )
          .catch(() => {});
      }, 6000);

    return () =>
      window.clearInterval(
        interval,
      );
  }, [readyPaymentId]);

  return state;
}

function AddressQr({
  value,
}: {
  value: string;
}) {
  const [dataUrl, setDataUrl] =
    useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    QRCode.toDataURL(value, {
      margin: 1,
      width: 200,
    })
      .then((url) => {
        if (!cancelled) {
          setDataUrl(url);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [value]);

  if (!dataUrl) {
    return (
      <div
        className={
          styles.qrPlaceholder
        }
      >
        Generating QR code…
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={dataUrl}
      alt="Crypto payment address QR code"
      className={styles.qrImage}
    />
  );
}

function CopyButton({
  value,
}: {
  value: string;
}) {
  const [copied, setCopied] =
    useState(false);

  return (
    <button
      type="button"
      className={
        styles.copyButton
      }
      aria-label="Copy to clipboard"
      onClick={() => {
        navigator.clipboard
          .writeText(value)
          .then(() => {
            setCopied(true);

            window.setTimeout(
              () => {
                setCopied(false);
              },
              1500,
            );
          })
          .catch(() => {});
      }}
    >
      {copied ? (
        <svg
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M4 10.5l4 4 8-9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <rect
            x="7"
            y="7"
            width="10"
            height="10"
            rx="1.5"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M13 7V4.5A1.5 1.5 0 0 0 11.5 3h-6A1.5 1.5 0 0 0 4 4.5v6A1.5 1.5 0 0 0 5.5 12H7"
            stroke="currentColor"
            strokeWidth="1.6"
          />
        </svg>
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function MethodChoiceButtons({
  onPick,
}: {
  onPick: (
    method: PaymentMethod,
  ) => void;
}) {
  return (
    <div
      className={styles.methodChoice}
    >
      <button
        type="button"
        className={
          styles.secondaryAction
        }
        onClick={() => {
          onPick("merchant");
        }}
      >
        Pay via Merchant
      </button>

      <button
        type="button"
        className={
          styles.primaryAction
        }
        onClick={() => {
          onPick("crypto");
        }}
      >
        Pay via Crypto Wallet
      </button>
    </div>
  );
}

function WalletAmountForm({
  onSubmit,
}: {
  onSubmit: (
    amountUsd: number,
  ) => void;
}) {
  const { currency, toUsd, convertUsd } =
    useCurrency();

  const [value, setValue] =
    useState("");

  const parsedDisplay = Number(value);

  const parsedUsd = toUsd(
    parsedDisplay,
  );

  const valid =
    value.trim() !== "" &&
    Number.isFinite(parsedDisplay) &&
    parsedUsd >=
      MIN_WALLET_FUNDING_USD &&
    parsedUsd <=
      MAX_WALLET_FUNDING_USD;

  return (
    <form
      className={
        styles.amountForm
      }
      onSubmit={(event) => {
        event.preventDefault();

        if (valid) {
          onSubmit(
            Math.round(
              parsedUsd * 100,
            ) / 100,
          );
        }
      }}
    >
      <input
        type="number"
        inputMode="decimal"
        min={convertUsd(
          MIN_WALLET_FUNDING_USD,
        )}
        max={convertUsd(
          MAX_WALLET_FUNDING_USD,
        )}
        step="0.01"
        placeholder={`Amount in ${currency}`}
        className={
          styles.amountInput
        }
        value={value}
        onChange={(event) => {
          setValue(
            event.target.value,
          );
        }}
      />

      <button
        type="submit"
        className={
          styles.primaryAction
        }
        disabled={!valid}
      >
        Continue
      </button>
    </form>
  );
}

function TopUpAmountForm({
  onSubmit,
}: {
  onSubmit: (
    amountUsd: number,
  ) => void;
}) {
  const { currency, toUsd, convertUsd } =
    useCurrency();

  const [value, setValue] =
    useState("");

  const parsedDisplay =
    value.trim() === ""
      ? 0
      : Number(value);

  const parsedUsd = toUsd(
    parsedDisplay,
  );

  const valid =
    Number.isFinite(parsedDisplay) &&
    parsedUsd >= 0 &&
    parsedUsd <=
      MAX_WALLET_FUNDING_USD;

  return (
    <form
      className={
        styles.amountForm
      }
      onSubmit={(event) => {
        event.preventDefault();

        if (valid) {
          onSubmit(
            Math.round(
              parsedUsd * 100,
            ) / 100,
          );
        }
      }}
    >
      <input
        type="number"
        inputMode="decimal"
        min={0}
        max={convertUsd(
          MAX_WALLET_FUNDING_USD,
        )}
        step="0.01"
        placeholder={`Amount in ${currency} (optional)`}
        className={
          styles.amountInput
        }
        value={value}
        onChange={(event) => {
          setValue(
            event.target.value,
          );
        }}
      />

      <button
        type="submit"
        className={
          styles.primaryAction
        }
        disabled={!valid}
      >
        {parsedUsd > 0
          ? "Continue"
          : "Skip"}
      </button>
    </form>
  );
}

function MerchantCountryForm({
  onSubmit,
}: {
  onSubmit: (
    region: MerchantRegion,
  ) => void;
}) {
  const [value, setValue] =
    useState("");

  const valid = value.trim() !== "";

  return (
    <form
      className={
        styles.amountForm
      }
      onSubmit={(event) => {
        event.preventDefault();

        if (valid) {
          onSubmit(
            resolveMerchantRegion(
              value,
            ),
          );
        }
      }}
    >
      <input
        type="text"
        placeholder="Country you're paying from"
        className={
          styles.amountInput
        }
        value={value}
        onChange={(event) => {
          setValue(
            event.target.value,
          );
        }}
      />

      <button
        type="submit"
        className={
          styles.primaryAction
        }
        disabled={!valid}
      >
        Continue
      </button>
    </form>
  );
}

function AttachAndActions({
  proofFile,
  previewUrl,
  onFileChange,
  onSkip,
  onSend,
  sendLabel,
}: {
  proofFile: File | null;
  previewUrl: string | null;
  onFileChange: (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => void;
  onSkip: () => void;
  onSend: () => Promise<
    | { ok: true }
    | { ok: false; message: string }
  >;
  sendLabel: string;
}) {
  const fileInputRef =
    useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] =
    useState(false);

  const [sendError, setSendError] =
    useState("");

  return (
    <>
      <div
        className={styles.attachRow}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className={
            styles.attachInput
          }
          onChange={onFileChange}
        />

        <button
          type="button"
          className={
            styles.attachButton
          }
          onClick={() => {
            fileInputRef.current?.click();
          }}
        >
          {proofFile
            ? "Change screenshot"
            : "Attach payment screenshot"}
        </button>

        {proofFile && previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Attached payment screenshot preview"
            className={
              styles.attachThumb
            }
          />
        ) : (
          <span
            className={
              styles.attachHint
            }
          >
            Optional — helps our
            team verify faster
          </span>
        )}
      </div>

      <div
        className={styles.actions}
      >
        <button
          type="button"
          className={
            styles.secondaryAction
          }
          onClick={onSkip}
        >
          Not now
        </button>

        <button
          type="button"
          className={
            styles.primaryAction
          }
          disabled={submitting}
          onClick={() => {
            setSubmitting(true);
            setSendError("");

            void onSend().then(
              (result) => {
                setSubmitting(
                  false,
                );

                if (!result.ok) {
                  setSendError(
                    result.message,
                  );
                }
              },
            );
          }}
        >
          {submitting
            ? "Sending…"
            : sendLabel}
        </button>
      </div>

      {sendError ? (
        <p
          className={`${styles.feedback} ${styles.feedbackError}`}
          style={{
            padding: "0 18px 12px",
          }}
        >
          {sendError}
        </p>
      ) : null}
    </>
  );
}

export function VipCheckoutChat({
  plan,
  onClose,
  mode = "subscription",
  billingCycle = "monthly",
}: VipCheckoutChatProps) {
  useBodyScrollLock(true);

  const {
    formatUsd,
    setCurrency,
  } = useCurrency();

  // Recomputed every render (not frozen at mount) so the plan-price
  // message stays in sync if the currency changes mid-conversation —
  // e.g. picking a merchant country switches the display currency,
  // and every message should reflect that, not just the ones appended
  // after the switch.
  const introScript =
    mode === "wallet"
      ? buildWalletIntro()
      : buildIntro(
          plan,
          formatUsd,
        );

  const [
    method,
    setMethod,
  ] = useState<PaymentMethod | null>(
    null,
  );

  const [
    merchantRegion,
    setMerchantRegionState,
  ] = useState<MerchantRegion | null>(
    null,
  );

  function setMerchantRegion(
    region: MerchantRegion,
  ): void {
    setMerchantRegionState(region);
    setCurrency(
      MERCHANT_REGION_CURRENCY[
        region
      ],
    );
  }

  const [methodSteps] = useState<
    Record<PaymentMethod, ScriptStep[]>
  >(() => ({
    merchant: buildMethodSteps(
      "merchant",
      "subscription",
    ),
    crypto: buildMethodSteps(
      "crypto",
      "subscription",
    ),
  }));

  const [
    sent,
    setSent,
  ] = useState(false);

  // Optional wallet funds bundled into the SAME subscription payment —
  // replaces the old "would you like to fund your wallet too?" upsell,
  // which submitted (and required approving) a second, separate
  // cash-in after the plan was already paid for. Irrelevant in
  // mode === "wallet" (that flow has its own amount step already).
  const [
    subscriptionTopUpAmount,
    setSubscriptionTopUpAmount,
  ] = useState<number | null>(
    mode === "wallet" ? 0 : null,
  );

  // Fixed at "yes" for mode === "wallet" (the standalone fund-wallet
  // flow) and unused for subscriptions now that the wallet top-up is
  // answered up front and bundled into the same submission — kept as a
  // plain value (not state) since nothing sets it after mount anymore.
  const walletUpsellAnswer:
    "yes" | "no" | null =
    mode === "wallet" ? "yes" : null;

  const [
    walletMethod,
    setWalletMethod,
  ] = useState<PaymentMethod | null>(
    null,
  );

  const [
    walletFundAmount,
    setWalletFundAmount,
  ] = useState<number | null>(
    null,
  );

  const [
    walletMerchantRegion,
    setWalletMerchantRegionState,
  ] = useState<MerchantRegion | null>(
    null,
  );

  function setWalletMerchantRegion(
    region: MerchantRegion,
  ): void {
    setWalletMerchantRegionState(
      region,
    );
    setCurrency(
      MERCHANT_REGION_CURRENCY[
        region
      ],
    );
  }

  const [walletMethodSteps] =
    useState<
      Record<
        PaymentMethod,
        ScriptStep[]
      >
    >(() => ({
      merchant: buildMethodSteps(
        "merchant",
        "wallet",
      ),
      crypto: buildMethodSteps(
        "crypto",
        "wallet",
      ),
    }));

  const [
    walletSent,
    setWalletSent,
  ] = useState(false);

  const vipCryptoState =
    useCryptoInvoice(
      method === "crypto" &&
        subscriptionTopUpAmount !==
          null,
      "subscription",
      plan.name,
      parsePlanPriceUsd(
        plan.price,
      ),
      () => {
        setSent(true);
      },
      billingCycle,
      subscriptionTopUpAmount,
    );

  const walletCryptoState =
    useCryptoInvoice(
      walletMethod === "crypto" &&
        walletFundAmount !== null,
      "wallet",
      null,
      walletFundAmount,
      () => {
        setWalletSent(true);
      },
    );

  let script: ScriptStep[] =
    introScript;

  if (
    mode !== "wallet" &&
    subscriptionTopUpAmount !== null
  ) {
    script = [
      ...script,
      {
        kind: "message",
        text:
          subscriptionTopUpAmount > 0
            ? `Got it — I'll add ${formatUsd(subscriptionTopUpAmount)} to your trading wallet in the same payment. How would you like to pay?`
            : "How would you like to pay?",
      },
    ];
  }

  if (method) {
    script = [
      ...script,
      ...methodSteps[method],
    ];
  }

  if (
    method === "merchant" &&
    merchantRegion !== null
  ) {
    script = [
      ...script,
      {
        kind: "payment",
        method: "merchant",
        forWallet: false,
      },
      {
        kind: "message",
        text: merchantOutro(
          "subscription",
        ),
      },
    ];
  }

  if (sent) {
    script = [
      ...script,
      {
        kind: "message",
        text:
          subscriptionTopUpAmount !==
            null &&
          subscriptionTopUpAmount > 0
            ? `Thank you! Your ${plan.name} upgrade and wallet top-up are now pending verification. You'll see both reflected on this page once confirmed.`
            : `Thank you! Your ${plan.name} upgrade is now pending verification. You'll see it reflected on this page once it's confirmed.`,
      },
    ];
  }

  if (walletUpsellAnswer === "yes") {
    script = [
      ...script,
      {
        kind: "message",
        text: "Great — how would you like to pay?",
      },
    ];

    if (walletFundAmount !== null) {
      if (walletMethod === "merchant") {
        script = [
          ...script,
          ...walletMethodSteps.merchant,
        ];

        if (
          walletMerchantRegion !==
          null
        ) {
          script = [
            ...script,
            {
              kind: "payment",
              method: "merchant",
              forWallet: true,
            },
            {
              kind: "message",
              text: merchantOutro(
                "wallet",
              ),
            },
          ];
        }
      } else if (
        walletMethod === "crypto"
      ) {
        script = [
          ...script,
          ...walletMethodSteps.crypto,
        ];
      }
    }

    if (walletSent) {
      script = [
        ...script,
        {
          kind: "message",
          text: "Thanks! Your trading wallet top-up is now pending verification — we'll credit it manually once confirmed.",
        },
      ];
    }
  }

  const [
    visibleCount,
    setVisibleCount,
  ] = useState(0);

  const typing =
    visibleCount < script.length;

  const conversationDone =
    mode === "wallet"
      ? walletSent
      : sent;

  const vipProof = useProofUpload();
  const walletProof =
    useProofUpload();

  const scrollRef =
    useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!typing) {
      return;
    }

    const delay =
      visibleCount === 0 ? 500 : 900;

    const timer = window.setTimeout(
      () => {
        setVisibleCount(
          (count) => count + 1,
        );
      },
      delay,
    );

    return () => {
      window.clearTimeout(timer);
    };
  }, [visibleCount, typing]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current
        .scrollHeight,
      behavior: "smooth",
    });
  }, [
    visibleCount,
    typing,
    sent,
    method,
    walletUpsellAnswer,
    walletMethod,
    walletSent,
    vipCryptoState,
    walletCryptoState,
  ]);

  useEffect(() => {
    function handleEscape(
      event: KeyboardEvent,
    ) {
      if (event.key === "Escape") {
        onClose();
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
  }, [onClose]);

  async function submitMerchantCashin(
    purpose: PaymentContext,
    planName: string | null,
    amount: number,
    proofFile: File | null,
    billingCycleOverride:
      | "monthly"
      | "annual"
      | null = null,
    walletTopUpAmountOverride:
      | number
      | null = null,
  ): Promise<
    | { ok: true }
    | { ok: false; message: string }
  > {
    try {
      const proofImage = proofFile
        ? await fileToBase64(
            proofFile,
          )
        : undefined;

      const response = await fetch(
        "/api/trading/futures/wallet/merchant-cashin",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            purpose,
            planName:
              planName ??
              undefined,
            amount,
            proofImage,
            billingCycle:
              billingCycleOverride ??
              undefined,
            walletTopUpAmount:
              walletTopUpAmountOverride ??
              undefined,
          }),
        },
      );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data?.ok
      ) {
        return {
          ok: false,
          message:
            data?.error
              ?.message ??
            "Could not submit your payment confirmation.",
        };
      }

      return { ok: true };
    } catch {
      return {
        ok: false,
        message:
          "Network error while submitting your payment confirmation.",
      };
    }
  }

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <section
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vip-checkout-title"
      >
        <header
          className={styles.header}
        >
          <div>
            <span
              className={
                styles.headerEyebrow
              }
            >
              BILLING ASSISTANT
            </span>

            <strong
              id="vip-checkout-title"
            >
              {mode === "wallet"
                ? "Fund your trading wallet"
                : `Activate ${plan.name}`}
            </strong>
          </div>

          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close billing assistant"
          >
            {"×"}
          </button>
        </header>

        <div
          className={styles.thread}
          ref={scrollRef}
        >
          {script
            .slice(0, visibleCount)
            .map((step, index) => {
              if (
                step.kind ===
                "message"
              ) {
                return (
                  <div
                    key={index}
                    className={
                      styles.bubble
                    }
                  >
                    {step.text}
                  </div>
                );
              }

              if (
                step.method ===
                "crypto"
              ) {
                const cryptoState =
                  step.forWallet
                    ? walletCryptoState
                    : vipCryptoState;

                return (
                  <div
                    key={index}
                    className={
                      styles.paymentCard
                    }
                  >
                    <span
                      className={
                        styles.paymentLabel
                      }
                    >
                      SCAN TO PAY ·
                      CRYPTO WALLET
                    </span>

                    {cryptoState.phase ===
                    "ready" ? (
                      <>
                        <AddressQr
                          value={
                            cryptoState
                              .invoice
                              .payAddress
                          }
                        />

                        <div
                          className={
                            styles.paymentDetails
                          }
                        >
                          <div>
                            <span>
                              Wallet
                              address
                            </span>
                            <span
                              className={
                                styles.walletAddressRow
                              }
                            >
                              <strong
                                className={
                                  styles.walletAddress
                                }
                              >
                                {
                                  cryptoState
                                    .invoice
                                    .payAddress
                                }
                              </strong>

                              <CopyButton
                                value={
                                  cryptoState
                                    .invoice
                                    .payAddress
                                }
                              />
                            </span>
                          </div>

                          <div>
                            <span>
                              Amount
                              to send
                            </span>
                            <strong>
                              {cryptoState
                                .invoice
                                .payAmount ??
                                "—"}{" "}
                              {cryptoState.invoice.payCurrency.toUpperCase()}
                            </strong>
                          </div>

                          <div>
                            <span>
                              USD
                              value
                            </span>
                            <strong>
                              $
                              {cryptoState.invoice.priceAmount.toFixed(
                                2,
                              )}
                            </strong>
                          </div>

                          <div>
                            <span>
                              Status
                            </span>
                            <strong>
                              {cryptoStatusLabel(
                                cryptoState.status,
                              )}
                            </strong>
                          </div>
                        </div>
                      </>
                    ) : cryptoState.phase ===
                      "error" ? (
                      <div
                        className={
                          styles.qrPlaceholder
                        }
                      >
                        {
                          cryptoState.message
                        }
                      </div>
                    ) : (
                      <div
                        className={
                          styles.qrPlaceholder
                        }
                      >
                        Preparing your
                        crypto
                        invoice…
                      </div>
                    )}
                  </div>
                );
              }

              const subscriptionTotal =
                parsePlanPriceUsd(
                  plan.price,
                ) +
                (subscriptionTopUpAmount ??
                  0);

              const amountLabel =
                step.forWallet
                  ? formatUsd(
                      walletFundAmount ??
                        0,
                    )
                  : subscriptionTopUpAmount !==
                        null &&
                      subscriptionTopUpAmount >
                        0
                    ? `${formatUsd(subscriptionTotal)} (${formatUsd(parsePlanPriceUsd(plan.price))} ${plan.period} + ${formatUsd(subscriptionTopUpAmount)} wallet top-up)`
                    : `${formatUsd(
                        parsePlanPriceUsd(
                          plan.price,
                        ),
                      )} ${plan.period}`;

              const region =
                (step.forWallet
                  ? walletMerchantRegion
                  : merchantRegion) ??
                "north_america";

              const regionConfig =
                MERCHANT_REGION_CONFIG[
                  region
                ];

              const hasQr =
                regionConfig.qrImageSrc.trim() !==
                "";

              return (
                <div
                  key={index}
                  className={
                    styles.paymentCard
                  }
                >
                  <span
                    className={
                      styles.paymentLabel
                    }
                  >
                    SCAN TO PAY ·{" "}
                    {regionConfig.rail}
                  </span>

                  <span
                    className={
                      styles.merchantBadge
                    }
                  >
                    Merchant account —
                    not a ZAINEX
                    company account
                  </span>

                  {hasQr ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={
                        regionConfig.qrImageSrc
                      }
                      alt={`${regionConfig.rail} QR code`}
                      className={
                        styles.qrImage
                      }
                    />
                  ) : (
                    <div
                      className={
                        styles.qrPlaceholder
                      }
                    >
                      QR code coming
                      soon
                    </div>
                  )}

                  <div
                    className={
                      styles.paymentDetails
                    }
                  >
                    <div>
                      <span>
                        {
                          regionConfig.recipientLabel
                        }
                      </span>
                      <strong>
                        {regionConfig.recipientName ||
                          "To be added"}
                      </strong>
                    </div>

                    {regionConfig.accountNumber ? (
                      <div>
                        <span>
                          Account
                          number
                        </span>
                        <strong>
                          {
                            regionConfig.accountNumber
                          }
                        </strong>
                      </div>
                    ) : null}

                    <div>
                      <span>
                        How to pay
                      </span>
                      <strong>
                        {
                          regionConfig.appNote
                        }
                      </strong>
                    </div>

                    <div>
                      <span>
                        Amount
                      </span>
                      <strong>
                        {
                          amountLabel
                        }
                      </strong>
                    </div>
                  </div>
                </div>
              );
            })}

          {typing ? (
            <div
              className={
                styles.typingBubble
              }
              aria-label="Billing assistant is typing"
            >
              <i />
              <i />
              <i />
            </div>
          ) : null}

          {!typing &&
          mode !== "wallet" &&
          subscriptionTopUpAmount ===
            null ? (
            <TopUpAmountForm
              onSubmit={
                setSubscriptionTopUpAmount
              }
            />
          ) : null}

          {!typing &&
          method === null &&
          mode !== "wallet" &&
          subscriptionTopUpAmount !==
            null ? (
            <MethodChoiceButtons
              onPick={setMethod}
            />
          ) : null}

          {!typing &&
          method === "merchant" &&
          merchantRegion === null ? (
            <MerchantCountryForm
              onSubmit={
                setMerchantRegion
              }
            />
          ) : null}

          {!typing &&
          walletUpsellAnswer ===
            "yes" &&
          walletMethod === null ? (
            <MethodChoiceButtons
              onPick={
                setWalletMethod
              }
            />
          ) : null}

          {!typing &&
          walletMethod !== null &&
          walletFundAmount ===
            null ? (
            <WalletAmountForm
              onSubmit={
                setWalletFundAmount
              }
            />
          ) : null}

          {!typing &&
          walletMethod ===
            "merchant" &&
          walletFundAmount !==
            null &&
          walletMerchantRegion ===
            null ? (
            <MerchantCountryForm
              onSubmit={
                setWalletMerchantRegion
              }
            />
          ) : null}
        </div>

        {!typing &&
        method === "merchant" &&
        merchantRegion !== null &&
        !sent ? (
          <AttachAndActions
            proofFile={
              vipProof.file
            }
            previewUrl={
              vipProof.previewUrl
            }
            onFileChange={
              vipProof.onFileChange
            }
            onSkip={onClose}
            onSend={async () => {
              const result =
                await submitMerchantCashin(
                  "subscription",
                  plan.name,
                  parsePlanPriceUsd(
                    plan.price,
                  ),
                  vipProof.file,
                  billingCycle,
                  subscriptionTopUpAmount,
                );

              if (result.ok) {
                setSent(true);
              }

              return result;
            }}
            sendLabel="I’ve sent it"
          />
        ) : null}

        {!typing &&
        method === "crypto" &&
        !sent ? (
          <div
            className={
              styles.actions
            }
          >
            <button
              type="button"
              className={
                styles.secondaryAction
              }
              onClick={onClose}
            >
              Not now
            </button>
          </div>
        ) : null}

        {!typing &&
        walletUpsellAnswer ===
          "yes" &&
        walletMethod ===
          "merchant" &&
        walletMerchantRegion !==
          null &&
        !walletSent ? (
          <AttachAndActions
            proofFile={
              walletProof.file
            }
            previewUrl={
              walletProof.previewUrl
            }
            onFileChange={
              walletProof.onFileChange
            }
            onSkip={onClose}
            onSend={async () => {
              const result =
                await submitMerchantCashin(
                  "wallet",
                  null,
                  walletFundAmount ??
                    0,
                  walletProof.file,
                );

              if (result.ok) {
                setWalletSent(
                  true,
                );
              }

              return result;
            }}
            sendLabel="I’ve added it"
          />
        ) : null}

        {!typing &&
        walletUpsellAnswer ===
          "yes" &&
        walletMethod === "crypto" &&
        walletFundAmount !== null &&
        !walletSent ? (
          <div
            className={
              styles.actions
            }
          >
            <button
              type="button"
              className={
                styles.secondaryAction
              }
              onClick={onClose}
            >
              Not now
            </button>
          </div>
        ) : null}

        {!typing &&
        conversationDone ? (
          <div
            className={
              styles.actions
            }
          >
            <button
              type="button"
              className={
                styles.primaryAction
              }
              onClick={onClose}
            >
              Done
            </button>
          </div>
        ) : null}
      </section>
    </div>,
    document.body,
  );
}
