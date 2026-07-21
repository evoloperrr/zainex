import type { Metadata } from "next";

import { NewsContent } from "./news-content";

export const metadata: Metadata = {
  title:
    "Inside ZAINEX: One Chart, Eight AI Opinions",
  description:
    "ZAINEX is a market-intelligence terminal that cross-checks a deterministic technical read with multiple AI models, then leaves every trade to a human. A look at InteliBrain, its markets, and its manual-execution design.",
  openGraph: {
    title:
      "Inside ZAINEX: One Chart, Eight AI Opinions",
    description:
      "A deterministic technical engine, cross-checked by multiple AI models, with every trade left to a human. Inside ZAINEX's InteliBrain signal architecture.",
    type: "article",
  },
};

export default function NewsPage() {
  return <NewsContent />;
}
