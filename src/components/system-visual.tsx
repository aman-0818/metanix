import { AudioLines, Workflow, ShieldCheck, ArrowDown, Layers3 } from "lucide-react";
import { LogoMark } from "@/components/brand";

export function SystemVisual() {
  return <div className="system-visual" role="img" aria-label="Concept diagram: Matenix AI connects people, workflows, and enterprise systems with voice clarity, service desk automation, and governance.">
    <div className="visual-grid" />
    <div className="visual-topline"><span>THE MATENIX INTELLIGENCE LAYER</span><span className="visual-coordinate">01 — 03</span></div>
    <svg className="system-svg" viewBox="0 0 600 540" fill="none" aria-hidden="true">
      <defs><linearGradient id="plane-gradient" x1="110" y1="190" x2="450" y2="370" gradientUnits="userSpaceOnUse"><stop stopColor="var(--accent-primary)" stopOpacity=".11"/><stop offset="1" stopColor="var(--accent-primary)" stopOpacity=".015"/></linearGradient><linearGradient id="core-gradient" x1="225" y1="170" x2="360" y2="300" gradientUnits="userSpaceOnUse"><stop stopColor="#352144"/><stop offset="1" stopColor="#17121f"/></linearGradient></defs>
      <path d="M300 320 105 423 300 526 495 423 300 320Z" stroke="#393140" strokeDasharray="3 5"/>
      <path d="M300 260 64 384 300 508 536 384 300 260Z" fill="url(#plane-gradient)" stroke="#443550"/>
      <path d="M300 185 64 309 300 433 536 309 300 185Z" fill="url(#plane-gradient)" stroke="#72528c"/>
      <path d="M64 309v75m236 49v75m236-199v75" stroke="#51405f"/>
      <path d="M300 433v-81M182 247v-67h-40m276 67v-67h40M300 185V92" stroke="var(--accent-primary)" strokeOpacity=".6"/>
      <path className="flow-path" d="M64 309 300 433 536 309M300 185 64 309" stroke="var(--accent-primary)" strokeWidth="1.4" strokeDasharray="5 250"/>
      <path d="M300 247 169 316 300 385 431 316 300 247Z" fill="#120e19" stroke="#65477c"/>
      <circle cx="300" cy="92" r="4" fill="var(--accent-primary)"/><circle cx="142" cy="180" r="3" fill="var(--accent-primary)"/><circle cx="458" cy="180" r="3" fill="var(--accent-primary)"/>
      <circle cx="300" cy="385" r="3" fill="var(--accent-primary)"/><path d="m96 386 43 23m305-23-43 23" stroke="var(--accent-primary)" strokeWidth="2"/>
    </svg>
    <LogoMark className="system-core-logo" size={180} priority />
    <div className="system-node node-voice"><AudioLines size={17}/><span>Voice clarity<small>M-VCARA</small></span></div>
    <div className="system-node node-service"><Workflow size={17}/><span>Intelligent support<small>M-RESORA</small></span></div>
    <div className="system-node node-govern"><ShieldCheck size={17}/><span>Human control<small>M-ORDENA</small></span></div>
    <div className="system-foundation"><Layers3 size={14}/><span>YOUR EXISTING ENTERPRISE SYSTEMS</span></div>
    <div className="visual-caption"><span><span className="status-dot"/> CONNECTED BY DESIGN</span><ArrowDown size={14}/><span>CONCEPT ARCHITECTURE</span></div>
  </div>;
}
