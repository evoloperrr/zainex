import type { Metadata } from "next";

import { RoadmapContent } from "./roadmap-content";

export const metadata: Metadata = {
  title: "ZAINEX Roadmap",
  description:
    "What's shipped, what's actively in progress (live OKX exchange trading), and what's planned next for ZAINEX.",
  openGraph: {
    title: "ZAINEX Roadmap",
    description:
      "What's shipped, what's actively in progress, and what's planned next for ZAINEX.",
    type: "article",
  },
};

export default function RoadmapPage() {
  return <RoadmapContent />;
}
