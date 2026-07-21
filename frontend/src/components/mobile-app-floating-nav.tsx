"use client";

/* ZAINEX_GLOBAL_MOBILE_FLOATING_NAV_V1_1 */
/* ZAINEX_DASHBOARD_COMMAND_CENTER_V1 */
/* ZAINEX_THREE_LEVEL_REFERRALS_V1 */

import { signOut } from "next-auth/react";
import {
  usePathname,
  useRouter,
} from "next/navigation";
import {
  useEffect,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

type IconName =
  | "home"
  | "market"
  | "strategy"
  | "wallet"
  | "menu"
  | "workflow"
  | "billing"
  | "rewards"
  | "profile"
  | "security"
  | "appearance"
  | "logout";

type MenuItem = {
  label: string;
  description: string;
  href: string;
  icon: IconName;
};

const APP_ROUTES = [
  "/dashboard",
  "/market",
  "/wallet",
  "/ai-strategies",
  "/workflow",
  "/billing",
  "/rewards",
  "/profile",
];

const MENU_ITEMS: MenuItem[] = [
  {
    label: "Dashboard",
    description: "Capital, market, risk, and intelligence",
    href: "/dashboard",
    icon: "home",
  },
  {
    label: "Market terminal",
    description: "Trading, charts, and market data",
    href: "/market",
    icon: "market",
  },
  {
    label: "AI strategies",
    description: "Activations and performance records",
    href: "/ai-strategies",
    icon: "strategy",
  },
  {
    label: "Wallet & credits",
    description: "Wallet funds, credits, and activity",
    href: "/wallet",
    icon: "wallet",
  },
  {
    label: "Workflow",
    description: "AI workflow and automation builder",
    href: "/workflow",
    icon: "workflow",
  },
  {
    label: "Billing",
    description: "Plans and subscription settings",
    href: "/billing",
    icon: "billing",
  },
  {
    label: "Rewards",
    description: "Three-level referral network",
    href: "/rewards",
    icon: "rewards",
  },
  {
    label: "Profile settings",
    description: "Identity and account details",
    href: "/profile#account",
    icon: "profile",
  },
  {
    label: "Account & security",
    description: "Authentication and active session",
    href: "/profile#security",
    icon: "security",
  },
  {
    label: "Appearance",
    description: "Theme and interface preferences",
    href: "/profile#appearance",
    icon: "appearance",
  },
];

function routeMatches(
  pathname: string,
  route: string,
) {
  return (
    pathname === route ||
    pathname.startsWith(`${route}/`)
  );
}

function MobileIcon({
  name,
  size = 18,
}: {
  name: IconName;
  size?: number;
}) {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap:
      "round" as const,
    strokeLinejoin:
      "round" as const,
    "aria-hidden":
      true as const,
  };

  switch (name) {
    case "home":
      return (
        <svg {...props}>
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5.5 10.5V20h13v-9.5" />
          <path d="M9.5 20v-6h5v6" />
        </svg>
      );

    case "market":
      return (
        <svg {...props}>
          <path d="M4 18V9" />
          <path d="M9 18V5" />
          <path d="M14 18v-7" />
          <path d="M19 18V3" />
        </svg>
      );

    case "strategy":
      return (
        <svg {...props}>
          <path d="m4 16 5-5 4 3 7-8" />
          <path d="M15 6h5v5" />
          <path d="M5 20h14" />
        </svg>
      );

    case "wallet":
      return (
        <svg {...props}>
          <path d="M4 7.5h14a2 2 0 0 1 2 2v8H6a2 2 0 0 1-2-2Z" />
          <path d="M4 9V6a2 2 0 0 1 2-2h10" />
          <path d="M15 12h5" />
        </svg>
      );

    case "menu":
      return (
        <svg {...props}>
          <circle cx="5" cy="12" r="1" />
          <circle cx="12" cy="12" r="1" />
          <circle cx="19" cy="12" r="1" />
        </svg>
      );

    case "workflow":
      return (
        <svg {...props}>
          <circle cx="6" cy="6" r="2" />
          <circle cx="18" cy="6" r="2" />
          <circle cx="12" cy="18" r="2" />
          <path d="M8 6h8" />
          <path d="m7 8 4 8" />
          <path d="m17 8-4 8" />
        </svg>
      );

    case "billing":
      return (
        <svg {...props}>
          <rect
            x="4"
            y="5"
            width="16"
            height="14"
            rx="2"
          />
          <path d="M4 9h16" />
          <path d="M8 15h3" />
        </svg>
      );

    case "rewards":
      return (
        <svg {...props}>
          <path d="m12 3 7 5-7 5-7-5 7-5Z" />
          <path d="m5 12 7 5 7-5" />
          <path d="m5 16 7 5 7-5" />
        </svg>
      );

    case "profile":
      return (
        <svg {...props}>
          <circle cx="12" cy="8" r="3" />
          <path d="M5 20c.8-4 3.1-6 7-6s6.2 2 7 6" />
        </svg>
      );

    case "security":
      return (
        <svg {...props}>
          <path d="M12 3 5 6v5c0 4.7 2.8 8 7 10 4.2-2 7-5.3 7-10V6Z" />
          <path d="m9 12 2 2 4-5" />
        </svg>
      );

    case "appearance":
      return (
        <svg {...props}>
          <path d="M12 3a9 9 0 1 0 9 9c0-1.2-.8-2-2-2h-2.2a2 2 0 0 1-2-2V5.8c0-1.7-1-2.8-2.8-2.8Z" />
          <circle cx="7.5" cy="11" r=".8" />
          <circle cx="9.5" cy="7.5" r=".8" />
          <circle cx="7.5" cy="15" r=".8" />
        </svg>
      );

    case "logout":
      return (
        <svg {...props}>
          <path d="M10 5H5v14h5" />
          <path d="m14 8 4 4-4 4" />
          <path d="M18 12H9" />
        </svg>
      );
  }
}

export function MobileAppFloatingNav() {
  const pathname = usePathname();
  const router = useRouter();

  const [
    menuOpen,
    setMenuOpen,
  ] = useState(false);

  const [
    signingOut,
    setSigningOut,
  ] = useState(false);

  const isAppRoute =
    APP_ROUTES.some(
      (route) =>
        routeMatches(
          pathname,
          route,
        ),
    );

  /*
    The Market page already contains its own working
    floating navigation and drawer.
  */
  const hasMarketLocalMenu =
    routeMatches(
      pathname,
      "/market",
    );

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useBodyScrollLock(menuOpen);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const closeOnEscape = (
      event: KeyboardEvent,
    ) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    window.addEventListener(
      "keydown",
      closeOnEscape,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        closeOnEscape,
      );
    };
  }, [menuOpen]);

  if (
    !isAppRoute ||
    hasMarketLocalMenu
  ) {
    return null;
  }

  const navigate = (
    href: string,
  ) => {
    setMenuOpen(false);
    router.push(href);
  };

  const dashboardActive =
    routeMatches(
      pathname,
      "/dashboard",
    );

  const marketActive =
    routeMatches(
      pathname,
      "/market",
    );

  const walletActive =
    routeMatches(
      pathname,
      "/wallet",
    );

  return (
    <>
      <style>{`
        .zainex-shared-mobile-spacer,
        .zainex-shared-mobile-nav {
          display: none;
        }

        @media (max-width: 979px) {
          .zainex-shared-mobile-spacer {
            display: block;
            width: 100%;
            height:
              calc(
                100px +
                env(safe-area-inset-bottom)
              );
            pointer-events: none;
          }

          .zainex-shared-mobile-nav {
            position: fixed;
            z-index: 2147481000;
            right: 14px;
            bottom:
              calc(
                12px +
                env(safe-area-inset-bottom)
              );
            left: 14px;
            display: grid;
            grid-template-columns:
              repeat(4, minmax(0, 1fr));
            gap: 5px;
            min-height: 70px;
            padding: 7px;
            border: 1px solid
              rgba(150, 108, 246, 0.25);
            border-radius: 22px;
            background:
              radial-gradient(
                circle at 92% 0,
                rgba(192, 61, 255, 0.15),
                transparent 34%
              ),
              linear-gradient(
                145deg,
                rgba(14, 13, 42, 0.97),
                rgba(6, 8, 24, 0.99)
              );
            box-shadow:
              0 24px 70px
                rgba(0, 0, 0, 0.54),
              0 0 42px
                rgba(132, 69, 255, 0.11),
              inset 0 1px
                rgba(255, 255, 255, 0.04);
            backdrop-filter:
              blur(20px)
              saturate(125%);
            -webkit-backdrop-filter:
              blur(20px)
              saturate(125%);
          }

          .zainex-shared-mobile-nav button {
            display: flex;
            min-width: 0;
            min-height: 56px;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 5px;
            padding: 7px 3px;
            border: 0;
            border-radius: 16px;
            color: #8590ae;
            background: transparent;
            font-family: inherit;
            font-size: 9px;
            cursor: pointer;
            touch-action: manipulation;
            -webkit-tap-highlight-color:
              transparent;
          }

          .zainex-shared-mobile-nav button:active {
            transform: scale(0.96);
          }

          .zainex-shared-mobile-nav
          .zainex-shared-nav-active {
            color: #ffffff;
            background:
              linear-gradient(
                145deg,
                rgba(43, 132, 233, 0.35),
                rgba(159, 54, 225, 0.36)
              );
          }

          .zainex-shared-mobile-nav
          button svg {
            color: #8994b3;
          }

          .zainex-shared-mobile-nav
          .zainex-shared-nav-active
          svg {
            color: #4fe1ff;
            filter:
              drop-shadow(
                0 0 8px
                rgba(79, 225, 255, 0.34)
              );
          }
        }

        .zainex-shared-menu-backdrop {
          position: fixed !important;
          z-index: 2147483000 !important;
          inset: 0 !important;
          display: flex !important;
          align-items: flex-end !important;
          justify-content: center !important;
          box-sizing: border-box !important;
          padding:
            14px 12px
            calc(
              14px +
              env(safe-area-inset-bottom)
            ) !important;
          overflow: hidden !important;
          background:
            rgba(2, 3, 13, 0.79) !important;
          backdrop-filter:
            blur(13px)
            saturate(125%) !important;
          -webkit-backdrop-filter:
            blur(13px)
            saturate(125%) !important;
        }

        .zainex-shared-menu-backdrop,
        .zainex-shared-menu-backdrop * {
          box-sizing: border-box !important;
        }

        .zainex-shared-menu-panel {
          width: min(100%, 520px) !important;
          max-height:
            min(82dvh, 720px) !important;
          padding: 14px !important;
          overflow-x: hidden !important;
          overflow-y: auto !important;
          overscroll-behavior:
            contain !important;
          border: 1px solid
            rgba(174, 96, 255, 0.3) !important;
          border-radius: 24px !important;
          color: #dce5f8 !important;
          background:
            radial-gradient(
              circle at 92% 0,
              rgba(199, 61, 255, 0.23),
              transparent 34%
            ),
            radial-gradient(
              circle at 3% 100%,
              rgba(34, 190, 255, 0.12),
              transparent 38%
            ),
            linear-gradient(
              155deg,
              rgba(19, 15, 52, 0.995),
              rgba(6, 8, 24, 0.998)
            ) !important;
          box-shadow:
            0 35px 90px
              rgba(0, 0, 0, 0.62),
            0 0 55px
              rgba(145, 68, 255, 0.17),
            inset 0 1px
              rgba(255, 255, 255, 0.05) !important;
          font-family: inherit !important;
          animation:
            zainexSharedMenuEnter
            220ms
            cubic-bezier(
              0.16,
              1,
              0.3,
              1
            );
        }

        .zainex-shared-menu-header {
          display: flex !important;
          align-items: center !important;
          justify-content:
            space-between !important;
          gap: 14px !important;
          padding:
            4px 3px 14px !important;
          border-bottom: 1px solid
            rgba(132, 144, 207, 0.14) !important;
        }

        .zainex-shared-menu-header span,
        .zainex-shared-menu-header strong {
          display: block !important;
        }

        .zainex-shared-menu-header span {
          color: #52dfff !important;
          font-size: 9px !important;
          font-weight: 650 !important;
          letter-spacing: 0.14em !important;
        }

        .zainex-shared-menu-header strong {
          margin-top: 5px !important;
          color: #faf8ff !important;
          font-size: 18px !important;
          font-weight: 560 !important;
        }

        .zainex-shared-menu-close {
          display: grid !important;
          width: 40px !important;
          height: 40px !important;
          min-width: 40px !important;
          place-items: center !important;
          padding: 0 !important;
          border: 1px solid
            rgba(166, 108, 255, 0.23) !important;
          border-radius: 13px !important;
          color: #e7e1fa !important;
          background:
            rgba(255, 255, 255, 0.035) !important;
          font-family: inherit !important;
          cursor: pointer !important;
        }

        .zainex-shared-menu-grid {
          display: grid !important;
          grid-template-columns:
            1fr !important;
          gap: 6px !important;
          width: 100% !important;
          padding: 11px 0 !important;
        }

        .zainex-shared-menu-item {
          display: grid !important;
          width: 100% !important;
          min-height: 62px !important;
          grid-template-columns:
            42px
            minmax(0, 1fr)
            auto !important;
          align-items: center !important;
          gap: 11px !important;
          padding: 9px 11px !important;
          border: 1px solid
            rgba(130, 143, 211, 0.08) !important;
          border-radius: 15px !important;
          color: #c6cfe4 !important;
          background:
            rgba(255, 255, 255, 0.018) !important;
          font-family: inherit !important;
          text-align: left !important;
          cursor: pointer !important;
        }

        .zainex-shared-menu-item:active {
          border-color:
            rgba(169, 93, 255, 0.31) !important;
          color: #ffffff !important;
          background:
            linear-gradient(
              105deg,
              rgba(39, 157, 245, 0.13),
              rgba(188, 62, 246, 0.16)
            ) !important;
          transform:
            scale(0.985) !important;
        }

        .zainex-shared-menu-icon {
          display: grid !important;
          width: 40px !important;
          height: 40px !important;
          place-items: center !important;
          border: 1px solid
            rgba(94, 188, 255, 0.18) !important;
          border-radius: 13px !important;
          color: #59ddff !important;
          background:
            linear-gradient(
              145deg,
              rgba(41, 158, 244, 0.14),
              rgba(187, 62, 246, 0.15)
            ) !important;
        }

        .zainex-shared-menu-copy {
          display: block !important;
          min-width: 0 !important;
        }

        .zainex-shared-menu-copy strong,
        .zainex-shared-menu-copy small {
          display: block !important;
        }

        .zainex-shared-menu-copy strong {
          color: inherit !important;
          font-size: 12px !important;
          font-weight: 560 !important;
        }

        .zainex-shared-menu-copy small {
          margin-top: 4px !important;
          overflow: hidden !important;
          color: #747f9f !important;
          font-size: 9px !important;
          text-overflow:
            ellipsis !important;
          white-space: nowrap !important;
        }

        .zainex-shared-menu-arrow {
          color: #727e9d !important;
          font-size: 16px !important;
          font-weight: 400 !important;
        }

        .zainex-shared-menu-signout {
          display: flex !important;
          width: 100% !important;
          min-height: 52px !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 9px !important;
          padding: 0 14px !important;
          border: 1px solid
            rgba(255, 104, 142, 0.17) !important;
          border-radius: 14px !important;
          color: #f39ab0 !important;
          background:
            rgba(255, 83, 129, 0.055) !important;
          font-family: inherit !important;
          font-size: 11px !important;
          font-weight: 560 !important;
          cursor: pointer !important;
        }

        .zainex-shared-menu-signout:disabled {
          opacity: 0.55 !important;
          cursor: wait !important;
        }

        @keyframes zainexSharedMenuEnter {
          from {
            opacity: 0;
            transform:
              translate3d(0, 28px, 0)
              scale(0.96);
          }

          to {
            opacity: 1;
            transform:
              translate3d(0, 0, 0)
              scale(1);
          }
        }

        @media (
          prefers-reduced-motion:
          reduce
        ) {
          .zainex-shared-menu-panel {
            animation: none !important;
          }
        }
      `}</style>

      <div
        className="zainex-shared-mobile-spacer"
        aria-hidden="true"
      />

      <nav
        className="zainex-shared-mobile-nav"
        aria-label="Mobile application navigation"
      >
        <button
          type="button"
          className={
            dashboardActive
              ? "zainex-shared-nav-active"
              : undefined
          }
          onClick={() => {
            navigate("/dashboard");
          }}
        >
          <MobileIcon name="home" />
          <span>Home</span>
        </button>

        <button
          type="button"
          className={
            marketActive
              ? "zainex-shared-nav-active"
              : undefined
          }
          onClick={() => {
            navigate("/market");
          }}
        >
          <MobileIcon name="market" />
          <span>Market</span>
        </button>

        <button
          type="button"
          className={
            walletActive
              ? "zainex-shared-nav-active"
              : undefined
          }
          onClick={() => {
            navigate("/wallet");
          }}
        >
          <MobileIcon name="wallet" />
          <span>Wallet</span>
        </button>

        <button
          type="button"
          className={
            menuOpen
              ? "zainex-shared-nav-active"
              : undefined
          }
          aria-label="Open complete menu"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onClick={() => {
            setMenuOpen(
              (current) => !current,
            );
          }}
        >
          <MobileIcon name="menu" />
          <span>Menu</span>
        </button>
      </nav>

      {menuOpen &&
      typeof document !== "undefined"
        ? createPortal(
            <div
              className="zainex-shared-menu-backdrop"
              role="presentation"
              onClick={() => {
                setMenuOpen(false);
              }}
            >
              <section
                className="zainex-shared-menu-panel"
                role="dialog"
                aria-modal="true"
                aria-label="Complete ZAINEX menu"
                onClick={(event) => {
                  event.stopPropagation();
                }}
              >
                <header className="zainex-shared-menu-header">
                  <div>
                    <span>
                      ZAINEX NAVIGATION
                    </span>

                    <strong>
                      Complete menu
                    </strong>
                  </div>

                  <button
                    type="button"
                    className="zainex-shared-menu-close"
                    aria-label="Close menu"
                    onClick={() => {
                      setMenuOpen(false);
                    }}
                  >
                    X
                  </button>
                </header>

                <nav
                  className="zainex-shared-menu-grid"
                  aria-label="Application menu"
                >
                  {MENU_ITEMS.map(
                    (item) => (
                      <button
                        key={item.href}
                        type="button"
                        className="zainex-shared-menu-item"
                        onClick={() => {
                          navigate(item.href);
                        }}
                      >
                        <span className="zainex-shared-menu-icon">
                          <MobileIcon
                            name={item.icon}
                          />
                        </span>

                        <span className="zainex-shared-menu-copy">
                          <strong>
                            {item.label}
                          </strong>

                          <small>
                            {item.description}
                          </small>
                        </span>

                        <b className="zainex-shared-menu-arrow">
                          {">"}
                        </b>
                      </button>
                    ),
                  )}
                </nav>

                <button
                  type="button"
                  className="zainex-shared-menu-signout"
                  disabled={signingOut}
                  onClick={async () => {
                    if (signingOut) {
                      return;
                    }

                    setSigningOut(true);

                    await signOut({
                      redirectTo: "/auth",
                    });
                  }}
                >
                  <MobileIcon name="logout" />

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