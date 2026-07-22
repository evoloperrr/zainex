"use client";

/* ZAINEX_GENERAL_AI_ASSISTANT_V1 */

import {
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";

import { SharedProfileMenu } from "@/components/shared-profile-menu";

import styles from "./assistant.module.css";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const QUICK_ACTIONS: Array<{
  label: string;
  hint: string;
  href?: string;
  prompt?: string;
}> = [
  {
    label: "Whitepaper",
    hint: "Read the full ZAINEX whitepaper",
    href: "/whitepaper",
  },
  {
    label: "Roadmap",
    hint: "See what's shipped and what's next",
    href: "/roadmap",
  },
  {
    label: "Materials",
    hint: "Brand assets and press kit",
    href: "/materials",
  },
  {
    label: "Get support",
    hint: "Ask the assistant for help",
    prompt:
      "I need help with my ZAINEX account. Can you point me in the right direction?",
  },
];

const WELCOME_MESSAGE =
  "Hi! I'm the ZAINEX assistant. Ask me anything about billing, your wallet, strategies, referrals, or how any part of the platform works — or tap one of the shortcuts below.";

export default function AssistantPage() {
  const [messages, setMessages] =
    useState<ChatMessage[]>([]);

  const [input, setInput] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const threadRef =
    useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadRef.current?.scrollTo({
      top: threadRef.current
        .scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  async function sendMessage(
    text: string,
  ) {
    const trimmed = text.trim();

    if (trimmed === "" || loading) {
      return;
    }

    const nextMessages: ChatMessage[] =
      [
        ...messages,
        {
          role: "user",
          content: trimmed,
        },
      ];

    setMessages(nextMessages);
    setInput("");
    setError("");
    setLoading(true);

    try {
      const response = await fetch(
        "/api/ai-assistant/chat",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            messages:
              nextMessages,
          }),
        },
      );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data?.ok
      ) {
        setError(
          data?.error?.message ??
            "The assistant is unavailable right now.",
        );
        return;
      }

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: data.reply,
        },
      ]);
    } catch {
      setError(
        "Network error while reaching the assistant.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <header
        className={styles.header}
      >
        <Link
          href="/"
          className={styles.brand}
        >
          <span
            className={styles.logo}
          >
            Z
          </span>

          <span
            className={
              styles.brandText
            }
          >
            <strong className="zainex-wordmark">
              <span className="zainex-wordmark-silver">
                Z
              </span>
              <span className="zainex-wordmark-ai">
                AI
              </span>
              <span className="zainex-wordmark-silver">
                NEX
              </span>
            </strong>
            <small>
              ASSISTANT
            </small>
          </span>
        </Link>

        <div
          className={
            styles.headerRight
          }
        >
          <Link
            href="/"
            className={styles.back}
          >
            Back to terminal
          </Link>

          <SharedProfileMenu />
        </div>
      </header>

      <div
        className={styles.content}
      >
        <div className={styles.hero}>
          <h1>
            How can I help?
          </h1>
          <p>
            Your general ZAINEX
            assistant — ask about
            billing, your wallet,
            strategies, referrals,
            or anything else about
            the platform.
          </p>
        </div>

        <div
          className={
            styles.quickActions
          }
        >
          {QUICK_ACTIONS.map(
            (action) =>
              action.href ? (
                <Link
                  key={
                    action.label
                  }
                  href={
                    action.href
                  }
                  className={
                    styles.quickAction
                  }
                >
                  <span
                    className={
                      styles.quickActionLabel
                    }
                  >
                    {action.label}
                  </span>
                  <span
                    className={
                      styles.quickActionHint
                    }
                  >
                    {action.hint}
                  </span>
                </Link>
              ) : (
                <button
                  key={
                    action.label
                  }
                  type="button"
                  className={
                    styles.quickAction
                  }
                  onClick={() => {
                    void sendMessage(
                      action.prompt ??
                        "",
                    );
                  }}
                >
                  <span
                    className={
                      styles.quickActionLabel
                    }
                  >
                    {action.label}
                  </span>
                  <span
                    className={
                      styles.quickActionHint
                    }
                  >
                    {action.hint}
                  </span>
                </button>
              ),
          )}
        </div>

        <div
          className={
            styles.chatPanel
          }
        >
          <div
            className={
              styles.thread
            }
            ref={threadRef}
          >
            <div
              className={
                styles.bubbleRow
              }
            >
              <div
                className={
                  styles.bubble
                }
              >
                {WELCOME_MESSAGE}
              </div>
            </div>

            {messages.map(
              (message, index) => (
                <div
                  key={index}
                  className={`${
                    styles.bubbleRow
                  } ${
                    message.role ===
                    "user"
                      ? styles.bubbleRowUser
                      : ""
                  }`}
                >
                  <div
                    className={`${
                      styles.bubble
                    } ${
                      message.role ===
                      "user"
                        ? styles.bubbleUser
                        : ""
                    }`}
                  >
                    {
                      message.content
                    }
                  </div>
                </div>
              ),
            )}

            {loading ? (
              <div
                className={
                  styles.typingBubble
                }
                aria-label="Assistant is typing"
              >
                <i />
                <i />
                <i />
              </div>
            ) : null}
          </div>

          {error ? (
            <p
              className={
                styles.errorNote
              }
            >
              {error}
            </p>
          ) : null}

          <form
            className={
              styles.composer
            }
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage(
                input,
              );
            }}
          >
            <textarea
              className={
                styles.composerInput
              }
              placeholder="Ask about billing, your wallet, strategies…"
              value={input}
              rows={1}
              onChange={(event) => {
                setInput(
                  event.target
                    .value,
                );
              }}
              onKeyDown={(event) => {
                if (
                  event.key ===
                    "Enter" &&
                  !event.shiftKey
                ) {
                  event.preventDefault();
                  void sendMessage(
                    input,
                  );
                }
              }}
            />

            <button
              type="submit"
              className={
                styles.sendButton
              }
              disabled={
                loading ||
                input.trim() ===
                  ""
              }
            >
              {loading
                ? "Sending…"
                : "Send"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
