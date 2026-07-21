"use client";

/* ZAINEX_VIP_CHECKOUT_CHAT_V1 */

import {
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

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

// ZAINEX_CRYPTO_WALLET_PAYMENT_DETAILS
// Fill these in once a real crypto wallet (coin, network, address, and
// optionally a QR image under /public) is provided — this component
// needs no other changes once they're set.
const CRYPTO_WALLET_COIN =
  "";
const CRYPTO_WALLET_NETWORK =
  "";
const CRYPTO_WALLET_ADDRESS =
  "";
const CRYPTO_WALLET_QR_IMAGE_SRC =
  "";

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

type ScriptStep =
  | {
      kind: "message";
      text: string;
    }
  | {
      kind: "payment";
      method: PaymentMethod;
    };

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
): ScriptStep[] {
  if (method === "merchant") {
    return [
      {
        kind: "message",
        text: "Got it — the fastest way is a manual GoTyme transfer. Here's how:",
      },
      {
        kind: "payment",
        method: "merchant",
      },
      {
        kind: "message",
        text: "Once you've sent the payment, attach a screenshot of the transfer below and tap “I've sent it.” Our team verifies transfers manually and activates your VIP access shortly after — usually within a few hours.",
      },
    ];
  }

  return [
    {
      kind: "message",
      text: "Got it — here's our wallet for a manual crypto transfer:",
    },
    {
      kind: "payment",
      method: "crypto",
    },
    {
      kind: "message",
      text: "Once you've sent the payment, attach a screenshot of the transaction below and tap “I've sent it.” Our team verifies transfers manually and activates your VIP access shortly after — usually within a few hours.",
    },
  ];
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
    ),
    crypto: buildMethodSteps(
      "crypto",
    ),
  }));

  const script =
    method === null
      ? introScript
      : [
          ...introScript,
          ...methodSteps[method],
        ];

  const [
    visibleCount,
    setVisibleCount,
  ] = useState(0);

  const typing =
    visibleCount < script.length;

  const [
    sent,
    setSent,
  ] = useState(false);

  const [
    proofFile,
    setProofFile,
  ] = useState<File | null>(null);

  const [
    proofPreviewUrl,
    setProofPreviewUrl,
  ] = useState<string | null>(null);

  const fileInputRef =
    useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    return () => {
      if (proofPreviewUrl) {
        URL.revokeObjectURL(
          proofPreviewUrl,
        );
      }
    };
  }, [proofPreviewUrl]);

  function handleProofChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file =
      event.target.files?.[0] ??
      null;

    setProofPreviewUrl(
      (previous) => {
        if (previous) {
          URL.revokeObjectURL(
            previous,
          );
        }

        return file
          ? URL.createObjectURL(file)
          : null;
      },
    );

    setProofFile(file);
  }

  const hasGotymeQr =
    GOTYME_QR_IMAGE_SRC.trim() !==
    "";
  const hasCryptoAddress =
    CRYPTO_WALLET_ADDRESS.trim() !==
    "";
  const hasCryptoQr =
    CRYPTO_WALLET_QR_IMAGE_SRC.trim() !==
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
                "merchant"
              ) {
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
                      Merchant account
                      — not a ZAINEX
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
                          {plan.price}{" "}
                          {plan.period}
                        </strong>
                      </div>
                    </div>
                  </div>
                );
              }

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

                  {hasCryptoAddress ? (
                    <>
                      {hasCryptoQr ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={
                            CRYPTO_WALLET_QR_IMAGE_SRC
                          }
                          alt="Crypto wallet QR code"
                          className={
                            styles.qrImage
                          }
                        />
                      ) : null}

                      <div
                        className={
                          styles.paymentDetails
                        }
                      >
                        <div>
                          <span>
                            Coin
                          </span>
                          <strong>
                            {
                              CRYPTO_WALLET_COIN
                            }
                          </strong>
                        </div>

                        <div>
                          <span>
                            Network
                          </span>
                          <strong>
                            {
                              CRYPTO_WALLET_NETWORK
                            }
                          </strong>
                        </div>

                        <div>
                          <span>
                            Wallet
                            address
                          </span>
                          <strong
                            className={
                              styles.walletAddress
                            }
                          >
                            {
                              CRYPTO_WALLET_ADDRESS
                            }
                          </strong>
                        </div>

                        <div>
                          <span>
                            Amount
                          </span>
                          <strong>
                            {
                              plan.price
                            }{" "}
                            {
                              plan.period
                            }
                          </strong>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div
                      className={
                        styles.qrPlaceholder
                      }
                    >
                      Crypto wallet
                      details coming
                      soon — pay via
                      Merchant for now
                    </div>
                  )}
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
                  setMethod(
                    "merchant",
                  );
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
                  setMethod("crypto");
                }}
              >
                Pay via Crypto Wallet
              </button>
            </div>
          ) : null}

          {!typing && sent ? (
            <div
              className={
                styles.bubble
              }
            >
              Thank you! Your{" "}
              {plan.name} upgrade is
              now pending verification.
              You&rsquo;ll see it
              reflected on this page
              once it&rsquo;s
              confirmed.
            </div>
          ) : null}
        </div>

        {!typing &&
        method !== null &&
        !sent ? (
          <div
            className={
              styles.attachRow
            }
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className={
                styles.attachInput
              }
              onChange={
                handleProofChange
              }
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

            {proofFile &&
            proofPreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={
                  proofPreviewUrl
                }
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
        ) : null}

        {!typing &&
        method !== null &&
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

            <button
              type="button"
              className={
                styles.primaryAction
              }
              onClick={() => {
                setSent(true);
              }}
            >
              I&rsquo;ve sent it
            </button>
          </div>
        ) : null}

        {sent ? (
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
