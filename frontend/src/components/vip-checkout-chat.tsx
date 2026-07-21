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
  const intro =
    method === "merchant"
      ? "Got it — the fastest way is a manual GoTyme transfer. Here's how:"
      : "Got it — here's our wallet for a manual crypto transfer:";

  const outro =
    context === "wallet"
      ? "Once you've sent the funds, attach a screenshot below and tap “I've added it.” Our team credits your trading wallet manually — usually within a few hours."
      : "Once you've sent the payment, attach a screenshot of the transfer below and tap “I've sent it.” Our team verifies transfers manually and activates your VIP access shortly after — usually within a few hours.";

  return [
    {
      kind: "message",
      text: intro,
    },
    {
      kind: "payment",
      method,
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
    walletSent,
    setWalletSent,
  ] = useState(false);

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

    if (walletMethod) {
      script = [
        ...script,
        ...walletMethodSteps[
          walletMethod
        ],
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

              const amountLabel =
                step.forWallet
                  ? "Any amount you choose"
                  : `${plan.price} ${plan.period}`;

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
                          {
                            amountLabel
                          }
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
                              amountLabel
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
        </div>

        {!typing &&
        method !== null &&
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
        walletUpsellAnswer ===
          "yes" &&
        walletMethod !== null &&
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
