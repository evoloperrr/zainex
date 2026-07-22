"use client";

/* ZAINEX_MATERIALS_V1 */

import { useState } from "react";
import Link from "next/link";

import {
  SiteFooter,
  SiteHeader,
} from "@/components/public-site/public-site";

import siteStyles from "@/components/public-site/public-site.module.css";
import styles from "../news/news.module.css";
import swatchStyles from "./materials.module.css";

const COLORS = [
  { name: "Background", hex: "#080718" },
  { name: "Blue", hex: "#35bdf8" },
  { name: "Purple", hex: "#8458ff" },
  { name: "Violet", hex: "#ac55ff" },
  { name: "Pink", hex: "#ff6f91" },
  { name: "Green", hex: "#5af1be" },
  { name: "Gold", hex: "#ffd168" },
];

export function MaterialsContent() {
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
        className={
          siteStyles.ambientOne
        }
        aria-hidden="true"
      />

      <div
        className={
          siteStyles.ambientTwo
        }
        aria-hidden="true"
      />

      <SiteHeader
        mobileOpen={mobileOpen}
        setMobileOpen={
          setMobileOpen
        }
      />

      <div className={styles.wrap}>
        <span
          className={
            styles.kicker
          }
        >
          <i />
          Materials
        </span>

        <h1
          className={styles.title}
        >
          Brand{" "}
          <em>materials.</em>
        </h1>

        <p className={styles.deck}>
          The essentials for
          writing or designing
          about ZAINEX. Banners,
          video, and slide decks
          are still being
          prepared — ask the
          assistant if you need
          something specific in
          the meantime.
        </p>

        <article
          className={
            styles.article
          }
        >
          <h2>Wordmark</h2>
          <p>
            Always render{" "}
            <strong>
              ZAINEX
            </strong>{" "}
            in full capitals,
            with the gradient
            treatment on the
            middle &ldquo;AI&rdquo;
            reserved for on-brand
            surfaces (the site
            header uses it live).
            Don&rsquo;t stretch,
            rotate, or recolor the
            mark outside that
            gradient.
          </p>

          <div
            className={
              swatchStyles.wordmarkPreview
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
          </div>

          <h2>Color palette</h2>
          <p>
            The core palette used
            across the app and
            marketing site.
          </p>

          <div
            className={
              swatchStyles.swatchGrid
            }
          >
            {COLORS.map(
              (color) => (
                <div
                  key={color.hex}
                  className={
                    swatchStyles.swatch
                  }
                >
                  <span
                    className={
                      swatchStyles.swatchColor
                    }
                    style={{
                      background:
                        color.hex,
                    }}
                  />
                  <span
                    className={
                      swatchStyles.swatchLabel
                    }
                  >
                    {color.name}
                    <small>
                      {color.hex}
                    </small>
                  </span>
                </div>
              ),
            )}
          </div>

          <h2>Coming soon</h2>
          <p>
            Banners, explainer
            video, and a pitch
            slide deck are in
            progress. Reach out
            through the{" "}
            <Link href="/assistant">
              assistant
            </Link>{" "}
            if you need something
            ahead of that.
          </p>

          <Link
            href="/assistant"
            className={styles.back}
          >
            Ask the assistant a
            question →
          </Link>
        </article>
      </div>

      <SiteFooter />
    </main>
  );
}
