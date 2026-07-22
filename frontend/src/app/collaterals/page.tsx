import type { Metadata } from "next";

import { CollateralsContent } from "./collaterals-content";

export const metadata: Metadata = {
  title: "ZAINEX Collaterals",
  description:
    "Download ZAINEX banners and the pitch slide deck, plus wordmark and color palette usage notes.",
};

export default function CollateralsPage() {
  return <CollateralsContent />;
}
