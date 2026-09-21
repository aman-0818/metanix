import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/metadata";
export default function robots(): MetadataRoute.Robots { const isPublic = !siteUrl.includes("localhost") && !siteUrl.includes("127.0.0.1"); return { rules: { userAgent: "*", allow: isPublic ? "/" : undefined, disallow: isPublic ? ["/api/", "/design-system", "/privacy", "/terms"] : "/" }, sitemap: `${siteUrl}/sitemap.xml` }; }
