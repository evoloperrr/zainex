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

type VipPlan = {
  name: string;
  price: string;
  period: string;
};

type VipCheckoutChatProps = {
  plan: VipPlan;
  onClose: () => void;
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
): ScriptStep[] {
  return [
    {
      kind: "message",
      text: "Hi! I'm the ZAINEX billing assistant.",
    },
    {
      kind: "message",
      text: `I see you'd like to activate ${plan.name} — ${plan.price} ${plan.period}.`,
    },
    {
      kind: "message",
      text: "How would you like to pay?",
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

  const outro =
    context === "wallet"
      ? "Once you've sent the funds, attach a screenshot below and tap “I've added it.” Our team credits your trading wallet manually — usually within a few hours."
      : "Once you've sent the payment, attach a screenshot of the transfer below and tap “I've sent it.” Our team verifies transfers manually and activates your VIP access shortly after — usually within a few hours.";

  return [
    {
      kind: "message",
      text: "Got it — the fastest way is a manual GoTyme transfer. Here's how:",
    },
    {
      kind: "payment",
      method: "merchant",
      forWallet: context === "wallet",
    },
    {
      kind: "message",
      text: outro,
    },
  ];
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
  }, [active, purpose, planName, amount]);

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
    amount: number,
  ) => void;
}) {
  const [value, setValue] =
    useState("");

  const parsed = Number(value);

  const valid =
    value.trim() !== "" &&
    Number.isFinite(parsed) &&
    parsed >=
      MIN_WALLET_FUNDING_USD &&
    parsed <=
      MAX_WALLET_FUNDING_USD;

  return (
    <form
      className={
        styles.amountForm
      }
      onSubmit={(event) => {
        event.preventDefault();

        if (valid) {
          onSubmit(parsed);
        }
      }}
    >
      <input
        type="number"
        inputMode="decimal"
        min={
          MIN_WALLET_FUNDING_USD
        }
        max={
          MAX_WALLET_FUNDING_USD
        }
        step="0.01"
        placeholder="Amount in USD"
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
  onSend: () => void;
  sendLabel: string;
}) {
  const fileInputRef =
    useRef<HTMLInputElement>(null);

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
          onClick={onSend}
        >
          {sendLabel}
        </button>
      </div>
    </>
  );
}

export function VipCheckoutChat({
  plan,
  onClose,
}: VipCheckoutChatProps) {
  useBodyScrollLock(true);

  const [introScript] = useState(
    () => buildIntro(plan),
  );

  const [
    method,
    setMethod,
  ] = useState<PaymentMethod | null>(
    null,
  );

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

  const [
    walletUpsellAnswer,
    setWalletUpsellAnswer,
  ] = useState<
    "yes" | "no" | null
  >(null);

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
      method === "crypto",
      "subscription",
      plan.name,
      parsePlanPriceUsd(
        plan.price,
      ),
      () => {
        setSent(true);
      },
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

  if (method) {
    script = [
      ...script,
      ...methodSteps[method],
    ];
  }

  if (sent) {
    script = [
      ...script,
      {
        kind: "message",
        text: `Thank you! Your ${plan.name} upgrade is now pending verification. You'll see it reflected on this page once it's confirmed.`,
      },
      {
        kind: "message",
        text: "Would you like to fund your trading wallet too?",
      },
    ];
  }

  if (walletUpsellAnswer === "no") {
    script = [
      ...script,
      {
        kind: "message",
        text: "No problem — you can fund your trading wallet anytime from the Wallet page.",
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

    if (walletMethod === "merchant") {
      script = [
        ...script,
        ...walletMethodSteps.merchant,
      ];
    } else if (
      walletMethod === "crypto" &&
      walletFundAmount !== null
    ) {
      script = [
        ...script,
        ...walletMethodSteps.crypto,
      ];
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
    sent &&
    (walletUpsellAnswer === "no" ||
      walletSent);

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

  const hasGotymeQr =
    GOTYME_QR_IMAGE_SRC.trim() !==
    "";

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
              Activate {plan.name}
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

              const amountLabel =
                step.forWallet
                  ? "Any amount you choose"
                  : `${plan.price} ${plan.period}`;

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
                    GOTYME
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

                  {hasGotymeQr ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={
                        GOTYME_QR_IMAGE_SRC
                      }
                      alt="GoTyme QR code"
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
                        Account name
                      </span>
                      <strong>
                        {GOTYME_ACCOUNT_NAME ||
                          "To be added"}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Account
                        number
                      </span>
                      <strong>
                        {GOTYME_ACCOUNT_NUMBER ||
                          "To be added"}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Account type
                      </span>
                      <strong>
                        Merchant
                        (individual)
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
          method === null ? (
            <MethodChoiceButtons
              onPick={setMethod}
            />
          ) : null}

          {!typing &&
          sent &&
          walletUpsellAnswer ===
            null ? (
            <div
              className={
                styles.methodChoice
              }
            >
              <button
                type="button"
                className={
                  styles.secondaryAction
                }
                onClick={() => {
                  setWalletUpsellAnswer(
                    "no",
                  );
                }}
              >
                Not now
              </button>

              <button
                type="button"
                className={
                  styles.primaryAction
                }
                onClick={() => {
                  setWalletUpsellAnswer(
                    "yes",
                  );
                }}
              >
                Yes, fund my wallet
              </button>
            </div>
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
          walletMethod ===
            "crypto" &&
          walletFundAmount ===
            null ? (
            <WalletAmountForm
              onSubmit={
                setWalletFundAmount
              }
            />
          ) : null}
        </div>

        {!typing &&
        method === "merchant" &&
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
            onSend={() => {
              setSent(true);
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
            onSend={() => {
              setWalletSent(true);
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
