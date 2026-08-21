import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://citari.example";
  const now = new Date();

  return [
    { url: `${baseUrl}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/login`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/register`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/book/barberia-elite`, lastModified: now, changeFrequency: "weekly", priority: 0.9 }
  ];
}
