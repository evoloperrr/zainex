import type { Metadata } from "next";

import { MaterialsContent } from "./materials-content";

export const metadata: Metadata = {
  title: "ZAINEX Materials",
  description:
    "ZAINEX brand wordmark, color palette, and press materials.",
};

export default function MaterialsPage() {
  return <MaterialsContent />;
}
