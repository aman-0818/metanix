import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export async function logoDataUri() {
  const source = await readFile(join(process.cwd(), "public/brand/matenix-logo.png"));
  return `data:image/png;base64,${source.toString("base64")}`;
}

export async function brandIcon(edge: number) {
  const src = await logoDataUri();
  return new ImageResponse(<div style={{ display: "flex", position: "relative", width: edge, height: edge, overflow: "hidden", background: "#0A0B0D", borderRadius: edge * .16 }}>
    {/* ImageResponse renders the supplied artwork into the browser icon. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={src} width={edge * 1.25} height={edge * 1.25 * 1181 / 1331} alt="" style={{ position: "absolute", left: -edge * .127, top: -edge * .042 }} />
  </div>, { width: edge, height: edge });
}
