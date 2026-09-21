import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { siteUrl } from "@/lib/metadata";
import "./globals.css";
import "@/components/site.css";

const geist = localFont({ src: "../../node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2", variable: "--font-geist", display: "swap", weight: "100 900" });
const geistMono = localFont({ src: "../../node_modules/@fontsource/geist-mono/files/geist-mono-latin-400-normal.woff2", variable: "--font-geist-mono", display: "swap", weight: "400" });
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Matenix AI — Enterprise AI. Built for Real Work.", template: "%s | Matenix AI" },
  description: "Practical AI products, system integration and custom automation. Matenix AI brings intelligence to enterprise operations while keeping people in control.",
  alternates: { canonical: "/" },
  openGraph: { type: "website", locale: "en_GB", siteName: "Matenix AI", title: "Matenix AI — Enterprise AI. Built for Real Work.", description: "Practical AI products, system integration and custom automation for the enterprise.", images: [{ url: "/opengraph-image", width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", images: ["/opengraph-image"] },
};
export const viewport: Viewport = { themeColor: "#0A0B0D", width: "device-width", initialScale: 1 };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const organization = { "@context": "https://schema.org", "@type": "Organization", name: "Matenix AI", description: "A product-led technology company building practical Artificial Intelligence solutions that solve real business challenges.", ...(process.env.NEXT_PUBLIC_SITE_URL && !siteUrl.includes("localhost") ? { url: siteUrl, logo: `${siteUrl}/brand/matenix-logo.png` } : {}) };
  return <html lang="en" className={`${geist.variable} ${geistMono.variable}`}><body><a className="skip-link" href="#main-content">Skip to content</a><SiteHeader /><main id="main-content">{children}</main><SiteFooter /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organization).replace(/</g, "\\u003c") }}/></body></html>;
}
