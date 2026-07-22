"use client";

/* ZAINEX_NEWS_ARTICLE_V1 */

import Link from "next/link";
import { useState } from "react";

import {
  SiteFooter,
  SiteHeader,
} from "@/components/public-site/public-site";

import siteStyles from "@/components/public-site/public-site.module.css";
import styles from "./news.module.css";

export function NewsContent() {
  const [
    mobileOpen,
    setMobileOpen,
  ] = useState(false);

  return (
    <main className={siteStyles.site}>
      <div
        className={siteStyles.noise}
        aria-hidden="true"
      />

      <div
        className={siteStyles.ambientOne}
        aria-hidden="true"
      />

      <div
        className={siteStyles.ambientTwo}
        aria-hidden="true"
      />

      <SiteHeader
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />

      <div className={styles.wrap}>
        <span className={styles.kicker}>
          <i />
          Product Dispatch
        </span>

        <h1 className={styles.title}>
          One chart,{" "}
          <em>eight AI opinions.</em>
        </h1>

        <p className={styles.deck}>
          ZAINEX is a market-intelligence terminal
          built on a simple bet: one model&rsquo;s
          opinion isn&rsquo;t enough, and no AI
          should be allowed to pull the trigger
          for you.
        </p>

        <div className={styles.byline}>
          <span>
            Reporting on{" "}
            <strong>ZAINEX</strong>
          </span>
          <span className={styles.dot}>
            &middot;
          </span>
          <span>AI Intelitrade Platform</span>
          <span className={styles.dot}>
            &middot;
          </span>
          <span>Crypto / Forex / Stocks</span>
        </div>

        <article className={styles.article}>
          <p className={styles.lede}>
            Open a position on most
            &ldquo;AI trading&rdquo; apps and
            you&rsquo;re really trusting a single
            model&rsquo;s read of the market,
            delivered with more confidence than
            the data usually supports. ZAINEX
            takes a different path. Underneath its
            dark, ticker-lined interface sits a
            deterministic technical engine
            &mdash; the same trend, momentum,
            volatility, and support/resistance
            math a discretionary trader would run
            by hand &mdash; and only after that
            snapshot is locked in does an AI model
            get a look at it, constrained to a
            strict BUY / SELL / WAIT vocabulary it
            isn&rsquo;t allowed to argue its way
            out of.
          </p>

          <p>
            The platform calls this layer{" "}
            <strong>InteliBrain</strong>, and it
            is deliberately boring in the way
            safety-critical software should be
            boring. The technical snapshot &mdash;
            EMA9/21, RSI14, MACD histogram, ATR14,
            relative volume, support and
            resistance &mdash; is computed first,
            in code, with no model involved. A
            backend-enforced &ldquo;safety
            gate&rdquo; then decides which
            recommendations are even legal for
            that snapshot: if the deterministic
            score doesn&rsquo;t clear a threshold,
            the AI&rsquo;s only legal answer is{" "}
            <strong>WAIT</strong>, full stop, no
            matter how persuasive its reasoning
            sounds.
          </p>

          <h2>
            <span>01</span>
            Markets, not just a market
          </h2>

          <p>
            ZAINEX runs three asset classes under
            one interface: crypto, forex, and
            stocks. Crypto spot and futures
            currently span seven pairs &mdash;
            BTC, ETH, SOL, BNB, XRP, ADA, and DOGE
            &mdash; priced from live Binance data
            with automatic failover to alternate
            exchanges if one feed is unreachable.
            Forex just grew to eight pairs with
            the addition of{" "}
            <strong>XAU/USD</strong>, sitting
            alongside EUR/USD, GBP/USD, USD/JPY,
            AUD/USD, USD/CAD, USD/CHF, and NZD/USD.
            Stocks round things out with delayed
            daily data.
          </p>

          <div className={styles.ticker}>
            <span>
              BTC/USDT{" "}
              <b>66,751.68</b>
            </span>
            <span>
              ETH/USDT <b>1,935.86</b>
            </span>
            <span>
              XAU/USD <b>4,069.90</b>
            </span>
            <span>
              EUR/USD <b>1.0843</b>
            </span>
            <span>
              USD/JPY{" "}
              <b className={styles.down}>
                162.68
              </b>
            </span>
          </div>

          <h2>
            <span>02</span>
            Eight opinions, one deterministic
            referee
          </h2>

          <p>
            Today, live signal generation runs on
            GPT-5.1. But the architecture was
            built to be model-agnostic from the
            start, and ZAINEX is in the process of
            rolling out seven more: Claude Sonnet
            4.5, Gemini 3 Pro, Grok 4.20, Grok 4,
            DeepSeek Chat V3.1, Qwen3-Max, and Kimi
            K2 Thinking. The idea isn&rsquo;t
            novelty for its own sake &mdash;
            different model families trained on
            different data tend to disagree at the
            margins, and a signal that survives
            several independent reads is a more
            interesting signal than one that only
            ever heard itself think.
          </p>

          <p className={styles.quote}>
            &ldquo;WAIT is always an allowed
            answer, and it&rsquo;s the default
            whenever the signals
            disagree.&rdquo;
          </p>

          <p>
            Every recommendation still ships with
            the receipts: the technical score that
            produced it, the risk level,
            entry/stop-loss/take-profit levels,
            and a short list of reasons a human
            can actually evaluate &mdash; not a
            black box, a worked problem.
          </p>

          <h2>
            <span>03</span>
            Guardrails, not autopilot
          </h2>

          <p>
            The most consequential design decision
            in ZAINEX may be the least visible one:
            the AI never places a trade. Every
            signal response is stamped{" "}
            <strong>autoExecute: false</strong> at
            the API level, and every order &mdash;
            spot or futures &mdash; requires an
            explicit user confirmation. Futures
            positions carry configurable leverage
            up to 20x with isolated margin and a
            simplified liquidation model;
            stop-loss and take-profit levels, once
            set, are enforced automatically so a
            plan made with a clear head survives a
            moment of panic.
          </p>

          <p>
            A cross-exchange{" "}
            <strong>arbitrage scanner</strong> is
            rolling out next, comparing live prices
            across Binance, OKX, and Bybit to
            surface spreads worth a second look
            &mdash; again, surfaced for a human to
            act on, not executed on its own.
          </p>

          <div className={styles.strip}>
            <div>
              <span className={styles.n}>
                7
              </span>
              <span className={styles.l}>
                Crypto pairs
              </span>
            </div>

            <div>
              <span className={styles.n}>
                8
              </span>
              <span className={styles.l}>
                Forex pairs
              </span>
            </div>

            <div>
              <span
                className={`${styles.n} ${styles.gold}`}
              >
                8
              </span>
              <span className={styles.l}>
                AI models, rolling out
              </span>
            </div>

            <div>
              <span
                className={`${styles.n} ${styles.mint}`}
              >
                20x
              </span>
              <span className={styles.l}>
                Max futures leverage
              </span>
            </div>
          </div>

          <h2>
            <span>04</span>
            Built like an exchange, priced like a
            sandbox
          </h2>

          <p>
            Every position on ZAINEX today is{" "}
            <strong>simulated</strong> &mdash;
            real market data and real exchange
            mechanics (fees, margin, liquidation
            math) running against a simulated
            balance, with no real capital at risk.
            It&rsquo;s a deliberate choice: a place
            to pressure-test a strategy, or a
            model&rsquo;s opinion of one, before
            either ever touches a live account.
          </p>

          <ul className={styles.specs}>
            <li>
              <span className={styles.k}>
                Strategies
              </span>
              <span className={styles.v}>
                Tiered &ldquo;Guarantrade&rdquo;
                yield strategies &mdash;
                Free, VIP 1, VIP 2, VIP 3 &mdash;
                each locking a chosen allocation at
                a fixed or variable daily rate,
                gated by AI credits rather than a
                paywall.
              </span>
            </li>

            <li>
              <span className={styles.k}>
                Wallet
              </span>
              <span className={styles.v}>
                A 1:1 wallet-to-AI-credits
                converter and a three-level
                referral network, so credits can
                come from testing the platform or
                from bringing other traders into
                it.
              </span>
            </li>

            <li>
              <span className={styles.k}>
                Stack
              </span>
              <span className={styles.v}>
                A Next.js frontend talking to a
                Laravel API, with every account,
                order, and fill persisted to
                Postgres rather than held in
                memory &mdash; the same durability
                guarantees a production exchange
                would demand of itself.
              </span>
            </li>
          </ul>

          <p>
            None of this reads like a platform
            trying to be everything at once. It
            reads like one still deciding how far
            &ldquo;AI-assisted&rdquo; should go
            &mdash; and, so far, drawing that line
            on the side of showing its work rather
            than hiding behind it.
          </p>

          <div className={styles.disclosure}>
            <b>Editor&rsquo;s note &mdash;</b>{" "}
            ZAINEX currently operates in a
            simulated trading mode across all markets;
            no real funds are placed on exchange.
            InteliBrain output is advisory only
            and is never executed automatically.
            Multi-model signal support is being
            rolled out progressively; GPT-5.1 is
            the model live in production today.
          </div>

          <Link
            href="/market"
            className={styles.back}
          >
            Explore the terminal &rarr;
          </Link>
        </article>
      </div>

      <SiteFooter />
    </main>
  );
}
