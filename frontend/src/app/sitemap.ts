import type { MetadataRoute } from "next";

const SITE_URL = "https://zainex-ai.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const publicRoutes: Array<{
    path: string;
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
    priority: number;
  }> = [
    {
      path: "/",
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      path: "/platform",
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      path: "/markets",
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      path: "/intellibrain",
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      path: "/strategies",
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      path: "/wallets",
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      path: "/security",
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      path: "/company",
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      path: "/news",
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      path: "/whitepaper",
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      path: "/roadmap",
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      path: "/materials",
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

  return publicRoutes.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
