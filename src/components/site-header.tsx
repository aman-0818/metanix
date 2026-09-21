"use client";

import { useRef, type KeyboardEvent } from "react";
import Link from "@/components/site-link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Brand } from "@/components/brand";
import { navigation } from "@/content/site";

export function SiteHeader() {
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeMenu = () => { dialog.current?.close(); document.body.classList.remove("menu-is-open"); menuButton.current?.focus(); };
  const keepMenuFocus = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "Tab") return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex="0"]')).filter(item => item.getClientRects().length > 0);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return <header className="site-header">
    <div className="container header-inner">
      <Brand />
      <nav className="desktop-nav" aria-label="Main navigation">
        {navigation.map(item => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined}>{item.label}</Link>)}
      </nav>
      <Link className="header-cta" href="/contact">Talk to Matenix AI <ArrowUpRight size={15} aria-hidden="true" /></Link>
      <button ref={menuButton} className="mobile-menu-button" aria-label="Open navigation" aria-haspopup="dialog" onClick={() => { dialog.current?.showModal(); document.body.classList.add("menu-is-open"); }}><Menu aria-hidden="true" /></button>
    </div>
    <dialog ref={dialog} className="mobile-menu" aria-label="Site navigation" onKeyDown={keepMenuFocus} onClose={() => { document.body.classList.remove("menu-is-open"); }}>
      <div className="mobile-menu-top"><Brand /><button className="mobile-menu-button" onClick={closeMenu} aria-label="Close navigation"><X aria-hidden="true" /></button></div>
      <span className="eyebrow">Navigate Matenix</span>
      <nav aria-label="Mobile navigation">{navigation.map((item, i) => <Link key={item.href} href={item.href} onClick={closeMenu}><span className="mobile-link-index">0{i + 1}</span>{item.label}<ArrowUpRight aria-hidden="true" /></Link>)}</nav>
      <Link href="/contact" className="button button--primary mobile-contact" onClick={closeMenu}>Talk to Matenix AI <ArrowUpRight aria-hidden="true" /></Link>
      <p className="text-muted">Enterprise AI. Built for Real Work.</p>
    </dialog>
  </header>;
}
