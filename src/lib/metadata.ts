import type { Metadata } from "next";

export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
export function pageMetadata(title: string, description: string, path: string): Metadata {
  return { title, description, alternates: { canonical: path }, openGraph: { title: `${title} | Matenix AI`, description, url: path, type: "website", images: [{ url: "/opengraph-image", width: 1200, height: 630 }] }, twitter: { card: "summary_large_image", title: `${title} | Matenix AI`, description, images: ["/opengraph-image"] } };
}
