import { ImageResponse } from "next/og";
import { logoDataUri } from "@/lib/brand-image";
export const alt = "Matenix AI — Enterprise AI. Built for Real Work.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default async function OpenGraphImage() {
  const logo = await logoDataUri();
  return new ImageResponse(<div style={{ width: "100%", height: "100%", background: "#0A0B0D", padding: 76, display: "flex", flexDirection: "column", justifyContent: "space-between", color: "#F4F5F5", fontFamily: "sans-serif" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo} alt="" width={86} height={76} />
      <span style={{ fontSize: 38, letterSpacing: -1 }}>matenix AI</span>
    </div>
    <div style={{ display: "flex", flexDirection: "column", fontSize: 76, letterSpacing: -4, lineHeight: 1.08 }}><span>Enterprise AI.</span><span style={{ color: "#C4A0FF" }}>Built for Real Work.</span></div>
    <div style={{ display: "flex", fontSize: 19, letterSpacing: 2, color: "#B5BAC1" }}>PRODUCTS / INTEGRATION / AUTOMATION / GOVERNANCE</div>
    <div style={{ position: "absolute", left: 0, bottom: 0, width: "100%", height: 6, background: "linear-gradient(90deg, #7125F7, #B569FF, #00D4EF)", display: "flex" }} />
  </div>, size);
}
