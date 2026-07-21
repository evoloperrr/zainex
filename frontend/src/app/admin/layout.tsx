"use client";

/* ZAINEX_ADMIN_CONSOLE_V1 */

import {
  useEffect,
  useState,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./admin.module.css";

type AccountResponse = {
  ok: boolean;
  account?: {
    user?: {
      isAdmin?: boolean;
      email?: string;
    } | null;
  };
};

type GateState =
  | "loading"
  | "denied"
  | "allowed";

const TABS = [
  {
    href: "/admin",
    label: "Overview",
  },
  {
    href: "/admin/users",
    label: "Users",
  },
  {
    href: "/admin/crypto-payments",
    label: "Crypto payments",
  },
  {
    href: "/admin/wallet-ledger",
    label: "Wallet ledger",
  },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const [state, setState] =
    useState<GateState>("loading");

  const [adminEmail, setAdminEmail] =
    useState("");

  useEffect(() => {
    let disposed = false;

    fetch(
      "/api/trading/futures/account",
      {
        cache: "no-store",
      },
    )
      .then(async (response) => {
        const data =
          (await response.json()) as AccountResponse;

        if (disposed) {
          return;
        }

        if (
          response.ok &&
          data.ok &&
          data.account?.user
            ?.isAdmin === true
        ) {
          setAdminEmail(
            data.account.user
              .email ?? "",
          );
          setState("allowed");
        } else {
          setState("denied");
        }
      })
      .catch(() => {
        if (!disposed) {
          setState("denied");
        }
      });

    return () => {
      disposed = true;
    };
  }, []);

  if (state === "loading") {
    return (
      <div className={styles.gate}>
        <span>
          Checking admin access…
        </span>
      </div>
    );
  }

  if (state === "denied") {
    return (
      <div className={styles.gate}>
        <strong>
          Access denied.
        </strong>
        <span>
          This area is restricted
          to ZAINEX
          administrators.
        </span>
        <Link href="/">
          Back to the app
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <header
        className={styles.header}
      >
        <div>
          <span
            className={
              styles.eyebrow
            }
          >
            ZAINEX
          </span>
          <strong>
            Admin console
          </strong>
        </div>

        <span
          className={
            styles.adminEmail
          }
        >
          {adminEmail}
        </span>
      </header>

      <nav className={styles.tabs}>
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`${styles.tab} ${
              pathname === tab.href
                ? styles.tabActive
                : ""
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <main
        className={styles.content}
      >
        {children}
      </main>
    </div>
  );
}
