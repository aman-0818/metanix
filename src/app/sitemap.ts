import type { MetadataRoute } from "next";
import { allPageSlugs, products } from "@/content/site";
import { siteUrl } from "@/lib/metadata";
export default function sitemap(): MetadataRoute.Sitemap { return ["", ...allPageSlugs.filter(slug => !["privacy", "terms"].includes(slug)), "contact", ...products.map(product => `products/${product.slug}`)].map(path => ({ url: `${siteUrl}/${path}`, changeFrequency: "monthly", priority: path === "" ? 1 : .7 })); }
