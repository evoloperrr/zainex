"use client";

/* ZAINEX_VIP_CHECKOUT_CHAT_V1 */

import {
  useEffect,
  useRef,
  useState,
} from "react";

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

type VipPlan = {
  name: string;
  price: string;
  period: string;
};

type VipCheckoutChatProps = {
  plan: VipPlan;
  onClose: () => void;
};

type ScriptStep =
  | {
      kind: "message";
      text: string;
    }
  | {
      kind: "payment";
    };

function buildScript(plan: VipPlan): ScriptStep[] {
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
      text: "The fastest way to activate it right now is a manual GoTyme transfer. Here's how:",
    },
    {
      kind: "payment",
    },
    {
      kind: "message",
      text: "Once you've sent the payment, tap “I've sent it” below and keep your screenshot or reference number. Our team verifies transfers manually and activates your VIP access shortly after — usually within a few hours.",
    },
  ];
}

export function VipCheckoutChat({
  plan,
  onClose,
}: VipCheckoutChatProps) {
  useBodyScrollLock(true);

  const [script] = useState(
    () => buildScript(plan),
  );

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
  }, [visibleCount, typing, sent]);

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

  const hasQr =
    GOTYME_QR_IMAGE_SRC.trim() !== "";

  return (
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
            .map((step, index) =>
              step.kind ===
              "message" ? (
                <div
                  key={index}
                  className={
                    styles.bubble
                  }
                >
                  {step.text}
                </div>
              ) : (
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
                    SCAN TO PAY · GOTYME
                  </span>

                  <span
                    className={
                      styles.merchantBadge
                    }
                  >
                    Merchant account —
                    not a ZAINEX company
                    account
                  </span>

                  {hasQr ? (
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
                        Account number
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
              ),
            )}

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

        {!typing && !sent ? (
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
    </div>
  );
}
