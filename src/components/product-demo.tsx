"use client";

import { useId, useState } from "react";
import { ArrowRight, AudioLines, Check, ChevronRight, CircleDot, Headphones, Layers3, LockKeyhole, Mic, ShieldCheck, SlidersHorizontal, Users, Workflow } from "lucide-react";
import "./product-pages.css";

export type ProductSlug = "m-vcara" | "m-resora" | "m-ordena";

type ProductDemoProps = { product: ProductSlug; compact?: boolean };

const waveHeights = [9, 14, 8, 22, 31, 17, 11, 36, 53, 41, 24, 15, 29, 62, 80, 57, 37, 22, 49, 70, 95, 77, 51, 28, 43, 60, 82, 66, 40, 24, 13, 35, 51, 38, 22, 11, 17, 28, 18, 10];

function Waveform({ enhanced = false }: { enhanced?: boolean }) {
  return (
    <svg viewBox="0 0 400 112" className={`demo-waveform ${enhanced ? "is-enhanced" : ""}`} role="img" aria-label={enhanced ? "Illustration of a clearer voice signal" : "Illustration of a voice signal with background noise"}>
      <line x1="0" y1="56" x2="400" y2="56" className="demo-wave-baseline" />
      {waveHeights.map((height, index) => {
        const selectedHeight = enhanced ? height : Math.min(100, height + ((index * 17) % 38));
        return <rect key={index} x={index * 10 + 2} y={(112 - selectedHeight) / 2} width="3" height={selectedHeight} rx="1.5" />;
      })}
    </svg>
  );
}

function VoiceDemo() {
  const [enhanced, setEnhanced] = useState(true);
  const demoId = useId();
  return (
    <>
      <div className="demo-toolbar"><span><AudioLines size={16} aria-hidden="true" /> Voice clarity</span><span className="demo-status"><i /> Endpoint</span></div>
      <div className="voice-demo-content">
        <div className="demo-person"><div className="demo-avatar"><Headphones size={25} strokeWidth={1.4} aria-hidden="true" /></div><span>Every conversation.<br /><strong>A little clearer.</strong></span></div>
        <div className="demo-wave-card">
          <div className="demo-line-label"><span>{enhanced ? "Enhanced voice · concept" : "Original input · concept"}</span><Mic size={14} aria-hidden="true" /></div>
          <Waveform enhanced={enhanced} />
          <div className="demo-wave-ticks" aria-hidden="true"><span>Voice signal</span><span>Illustrative waveform</span></div>
        </div>
        <div className="demo-toggle-row"><div><span id={demoId}>Voice enhancement</span><small>Preview the visual difference</small></div><button type="button" role="switch" aria-checked={enhanced} aria-labelledby={demoId} className="demo-switch" onClick={() => setEnhanced(!enhanced)}><span /></button></div>
        <div className="demo-footnote"><LockKeyhole size={13} aria-hidden="true" /><span>Core voice processing at the endpoint</span></div>
      </div>
      <p className="demo-disclaimer">Illustrative concept. This preview does not process or play audio.</p>
    </>
  );
}

const serviceSteps = [
  { label: "Understand", title: "Start with the employee’s issue.", description: "Understand the issue and establish the context for support.", annotation: "Employee issue", icon: Headphones },
  { label: "Diagnose", title: "Build a picture of the problem.", description: "Diagnose the problem before deciding what should happen next.", annotation: "Problem diagnosis", icon: SlidersHorizontal },
  { label: "Remediate", title: "Act within approved boundaries.", description: "Perform approved remediation while keeping people in control.", annotation: "Approved remediation", icon: ShieldCheck },
  { label: "Escalate", title: "Pass the context forward.", description: "Escalate an unresolved case with the right context for the next person.", annotation: "Contextual escalation", icon: Users },
];

function ServiceDemo() {
  const [step, setStep] = useState(0);
  const contentId = useId();
  const selected = serviceSteps[step];
  const Icon = selected.icon;
  return (
    <>
      <div className="demo-toolbar"><span><Workflow size={16} aria-hidden="true" /> Service workflow</span><span className="demo-status"><i /> Human oversight</span></div>
      <div className="service-demo-content">
        <div className="service-demo-steps" aria-label="Explore the service workflow">
          {serviceSteps.map((item, index) => <button key={item.label} type="button" aria-pressed={step === index} aria-controls={contentId} className={`service-step ${step === index ? "is-current" : ""}`} onClick={() => setStep(index)}><span className="service-step-number">{index < step ? <Check size={13} aria-hidden="true" /> : `0${index + 1}`}</span><span>{item.label}</span></button>)}
        </div>
        <div className="service-demo-stage" id={contentId} aria-live="polite" aria-atomic="true">
          <div className="service-stage-top"><span className="demo-mini-label">WORKFLOW / 0{step + 1}</span><Icon size={20} strokeWidth={1.5} aria-hidden="true" /></div>
          <p className="service-stage-title">{selected.title}</p><p>{selected.description}</p>
          <div className="service-context"><CircleDot size={14} aria-hidden="true" /><span>{selected.annotation}</span><ChevronRight size={14} aria-hidden="true" /></div>
        </div>
        <div className="service-demo-bottom"><span>People stay in the loop.</span><button type="button" className="demo-next-button" onClick={() => setStep((step + 1) % serviceSteps.length)} aria-label={step === serviceSteps.length - 1 ? "Restart workflow preview" : "Preview next workflow step"}>{step === serviceSteps.length - 1 ? "Restart" : "Next step"}<ArrowRight size={14} aria-hidden="true" /></button></div>
      </div>
      <p className="demo-disclaimer">Illustrative concept. No live diagnosis or remediation takes place.</p>
    </>
  );
}

const governanceViews = [
  { label: "Access", title: "AI application access", rows: [["Application A", "Access defined"], ["Application B", "Access defined"], ["Application C", "For review"]], icon: LockKeyhole },
  { label: "Users", title: "User administration", rows: [["Support team", "Example group"], ["Operations team", "Example group"], ["IT team", "Example group"]], icon: Users },
  { label: "Visibility", title: "Usage visibility", rows: [["Application A", "Usage overview"], ["Application B", "Usage overview"], ["Application C", "Usage overview"]], icon: Layers3 },
];

function GovernanceDemo() {
  const [view, setView] = useState(0);
  const contentId = useId();
  const selected = governanceViews[view];
  const Icon = selected.icon;
  return (
    <>
      <div className="demo-toolbar"><span><ShieldCheck size={16} aria-hidden="true" /> Governance workspace</span><span className="demo-status"><i /> Centralised view</span></div>
      <div className="governance-demo-content">
        <div className="governance-demo-heading"><div className="demo-mini-label">ENTERPRISE AI / OVERVIEW</div><p className="governance-demo-title">More clarity.<br />More control.</p></div>
        <div className="governance-view-buttons" aria-label="Explore governance capabilities">{governanceViews.map((item, index) => <button key={item.label} type="button" aria-pressed={view === index} aria-controls={contentId} onClick={() => setView(index)}><item.icon size={14} aria-hidden="true" />{item.label}</button>)}</div>
        <div id={contentId} className="governance-table" aria-live="polite" aria-atomic="true"><div className="governance-table-label"><Icon size={13} aria-hidden="true" />{selected.title}<span>Example</span></div>{selected.rows.map(([label, value]) => <div className="governance-table-row" key={label}><span><span className="governance-app-mark" aria-hidden="true">{label.at(0)}</span>{label}</span><span className="governance-row-value">{value}</span></div>)}</div>
        <div className="demo-footnote"><ShieldCheck size={13} aria-hidden="true" /><span>A structured approach to enterprise AI</span></div>
      </div>
      <p className="demo-disclaimer">Illustrative concept. All applications and groups are examples.</p>
    </>
  );
}

export function ProductDemo({ product, compact = false }: ProductDemoProps) {
  return <div className={`product-demo product-demo-${product}${compact ? " product-demo-compact" : ""}`}>{product === "m-vcara" ? <VoiceDemo /> : product === "m-resora" ? <ServiceDemo /> : <GovernanceDemo />}</div>;
}
