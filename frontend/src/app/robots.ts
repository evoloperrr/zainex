import type { MetadataRoute } from "next";

const SITE_URL = "https://zainex-ai.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/dashboard",
        "/market$",
        "/market/",
        "/wallet$",
        "/wallet/",
        "/billing",
        "/ai-strategies",
        "/ai-signals",
        "/profile",
        "/workflow",
        "/rewards",
        "/portfolio",
        "/connections",
        "/analytics",
        "/premium",
        "/auth",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
