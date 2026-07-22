import type { Metadata } from "next";

import { WhitepaperContent } from "./whitepaper-content";

export const metadata: Metadata = {
  title:
    "ZAINEX Whitepaper — AI Intelitrade",
  description:
    "How ZAINEX's InteliBrain AI signal layer, trading environment, wallet and credits system, and platform operations actually work today.",
  openGraph: {
    title:
      "ZAINEX Whitepaper — AI Intelitrade",
    description:
      "How ZAINEX's InteliBrain AI signal layer, trading environment, wallet and credits system, and platform operations actually work today.",
    type: "article",
  },
};

export default function WhitepaperPage() {
  return <WhitepaperContent />;
}
