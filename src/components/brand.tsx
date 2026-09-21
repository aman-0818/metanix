import Link from "@/components/site-link";
import Image from "next/image";
import type { CSSProperties } from "react";

/** The supplied PNG is unchanged; CSS frames its transparent margins. */
export function LogoMark({ className = "", size = 32, priority = false }: { className?: string; size?: number; priority?: boolean }) {
  return <span className={`logo-mark ${className}`} style={{ "--logo-size": `${size}px` } as CSSProperties} aria-hidden="true">
    <Image className="logo-mark__image" src="/brand/matenix-logo.png" width={1331} height={1181} sizes={`${Math.ceil(size * 1.36)}px`} alt="" preload={priority} />
  </span>;
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return <Link href="/" className="brand" aria-label={compact ? "Matenix AI home" : undefined}>
    <LogoMark className="brand-mark" priority />
    {!compact && <span className="brand-wordmark">matenix<span className="brand-ai"> AI</span></span>}
    {!compact && <span className="sr-only"> home</span>}
  </Link>;
}
