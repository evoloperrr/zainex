"use client";

/* ZAINEX_UNIFIED_SHARED_PROFILE_MENU_V2 */

import {
  signOut,
} from "next-auth/react";

import {
  useRouter,
} from "next/navigation";

import {
  createPortal,
} from "react-dom";

import {
  useEffect,
  useState,
} from "react";

import styles from "./shared-profile-menu.module.css";

type SessionResponse = {
  user?: {
    name?: string | null;
    email?: string | null;
  };
};

type AccountResponse = {
  account?: {
    user?: {
      role?: string | null;
      walletBalance?: number;
      credits?: number;
    } | null;
  };
};

type SharedProfileMenuProps = {
  size?: number;
  className?: string;
};

function formatUsd(
  value: number | null,
): string {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return "--";
  }

  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    },
  ).format(value);
}

export function SharedProfileMenu({
  size = 43,
  className,
}: SharedProfileMenuProps) {
  const router = useRouter();

  const [
    mounted,
    setMounted,
  ] = useState(false);

  const [
    open,
    setOpen,
  ] = useState(false);

  const [
    identity,
    setIdentity,
  ] = useState({
    name: "",
    email: "",
    role: "ROOT",
  });

  const [
    walletBalance,
    setWalletBalance,
  ] = useState<number | null>(null);

  const [
    credits,
    setCredits,
  ] = useState<number | null>(null);

  const [
    signingOut,
    setSigningOut,
  ] = useState(false);

  useEffect(() => {
    setMounted(true);

    let cancelled = false;

    const loadIdentity =
      async () => {
        try {
          const response = await fetch(
            "/api/auth/session",
            {
              cache: "no-store",
              credentials:
                "same-origin",
            },
          );

          if (
            !response.ok ||
            cancelled
          ) {
            return;
          }

          const payload =
            (await response.json()) as
              SessionResponse;

          if (cancelled) {
            return;
          }

          setIdentity(
            (current) => ({
              ...current,
              name:
                payload.user?.name
                  ?.trim() ||
                current.name,
              email:
                payload.user?.email
                  ?.trim() ||
                current.email,
            }),
          );
        } catch {
          // Keep the avatar blank until
          // the authenticated session resolves.
        }
      };

    void loadIdentity();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    const loadAccount =
      async () => {
        try {
          const response = await fetch(
            "/api/trading/futures/account",
            {
              cache: "no-store",
              credentials:
                "same-origin",
            },
          );

          if (
            !response.ok ||
            cancelled
          ) {
            return;
          }

          const payload =
            (await response.json()) as
              AccountResponse;

          const user =
            payload.account?.user;

          if (cancelled) {
            return;
          }

          setWalletBalance(
            typeof user
              ?.walletBalance ===
              "number"
              ? user.walletBalance
              : null,
          );

          setCredits(
            typeof user?.credits ===
              "number"
              ? user.credits
              : null,
          );

          setIdentity(
            (current) => ({
              ...current,
              role:
                user?.role?.trim() ||
                current.role,
            }),
          );
        } catch {
          // Keep safe placeholders.
        }
      };

    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    void loadAccount();

    document.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      cancelled = true;

      document.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [open]);

  const source =
    identity.name ||
    identity.email
      .split("@")[0] ||
    "";

  const initial = source
    .trim()
    .slice(0, 1)
    .toUpperCase();

  const displayName =
    identity.name ||
    "Evoloperr";

  const displayEmail =
    identity.email ||
    "evoloperr@gmail.com";

  const navigate = (
    route: string,
  ) => {
    setOpen(false);
    router.push(route);
  };

  const menuItems = [
    {
      icon: "◎",
      label: "Profile settings",
      hint: "Identity and account details",
      route: "/profile#account",
    },
    {
      icon: "◇",
      label: "Account & security",
      hint: "Google sign-in and session",
      route: "/profile#security",
    },
    {
      icon: "◐",
      label: "Appearance",
      hint: "Theme and interface",
      route: "/profile#appearance",
    },
    {
      icon: "◉",
      label: "Wallet & credits",
      hint: "Balance and AI credits",
      route: "/wallet",
    },
    {
      icon: "✦",
      label: "AI strategies",
      hint: "Active strategy access",
      route: "/ai-strategies",
    },
    {
      icon: "$",
      label: "Billing",
      hint: "Subscription settings",
      route: "/billing",
    },
  ];

  return (
    <>
      <button
        type="button"
        className={[
          styles.trigger,
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        style={{
          width: size,
          height: size,
        }}
        aria-label="Open profile menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();

          setOpen(
            (current) => !current,
          );
        }}
      >
        <span
          style={{
            opacity: initial ? 1 : 0,
          }}
        >
          {initial}
        </span>
      </button>

      {mounted &&
      open &&
      typeof document !==
        "undefined"
        ? createPortal(
            <div
              className={styles.backdrop}
              onMouseDown={() => {
                setOpen(false);
              }}
            >
              <section
                className={styles.panel}
                role="menu"
                aria-label="ZAINEX profile menu"
                onMouseDown={(event) => {
                  event.stopPropagation();
                }}
              >
                <header
                  className={
                    styles.identity
                  }
                >
                  <div
                    className={
                      styles.largeAvatar
                    }
                  >
                    {initial}
                  </div>

                  <div>
                    <strong>
                      {displayName}
                    </strong>

                    <span>
                      {displayEmail}
                    </span>

                    <small>
                      {identity.role} ACCOUNT
                    </small>
                  </div>
                </header>

                <div
                  className={
                    styles.summary
                  }
                >
                  <div>
                    <span>
                      Wallet balance
                    </span>

                    <strong>
                      {formatUsd(
                        walletBalance,
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>
                      AI credits
                    </span>

                    <strong>
                      {credits === null
                        ? "--"
                        : credits.toLocaleString(
                            "en-US",
                          )}
                    </strong>
                  </div>
                </div>

                <nav
                  className={
                    styles.navigation
                  }
                  aria-label="Profile navigation"
                >
                  {menuItems.map(
                    (item) => (
                      <button
                        key={item.route}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          navigate(
                            item.route,
                          );
                        }}
                      >
                        <i>
                          {item.icon}
                        </i>

                        <span>
                          <strong>
                            {item.label}
                          </strong>

                          <small>
                            {item.hint}
                          </small>
                        </span>

                        <b>›</b>
                      </button>
                    ),
                  )}
                </nav>

                <button
                  type="button"
                  className={
                    styles.signOut
                  }
                  disabled={signingOut}
                  onClick={async () => {
                    if (signingOut) {
                      return;
                    }

                    setSigningOut(true);

                    await signOut({
                      redirectTo:
                        "/auth",
                    });
                  }}
                >
                  <span>↪</span>

                  {signingOut
                    ? "Signing out..."
                    : "Sign out"}
                </button>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}