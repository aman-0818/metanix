"use client";

import { lazy, Suspense, useState, type KeyboardEvent } from "react";
import Link from "@/components/site-link";
import { ArrowRight, ArrowUpRight, AudioLines, Workflow, ShieldCheck, AppWindow, Braces, Headset, MessagesSquare, Database, Plus, Minus } from "lucide-react";
import { LogoMark } from "@/components/brand";
import { Button } from "@/components/ui";
import { ProductDemo } from "@/components/product-demo";
import { approach, industries, products } from "@/content/site";
const MotionText = lazy(() => import("./motion-text"));

function tabKey(event: KeyboardEvent<HTMLButtonElement>, current: number, count: number, select: (index: number) => void, prefix: string) {
  let next = current;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (current + 1) % count;
  else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (current - 1 + count) % count;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = count - 1;
  else return;
  event.preventDefault(); select(next); document.getElementById(`${prefix}-${next}`)?.focus();
}

export function ApproachSequence() {
  const [active, setActive] = useState(0);
  return <div className="approach-sequence"><div className="approach-tabs" role="tablist" aria-label="The Matenix approach">
    {approach.map((step, i) => <button key={step.title} role="tab" id={`approach-${i}`} aria-controls="approach-panel" aria-selected={active === i} tabIndex={active === i ? 0 : -1} onKeyDown={e => tabKey(e, i, approach.length, setActive, "approach")} onClick={() => setActive(i)}><span className="step-number">0{i + 1}</span><span>{step.title}</span><ArrowRight aria-hidden="true" /></button>)}
  </div><div id="approach-panel" role="tabpanel" aria-labelledby={`approach-${active}`} tabIndex={0} className="approach-panel">{active === 0 ? <p>{approach[active].description}</p> : <Suspense fallback={<p>{approach[active].description}</p>}><MotionText key={active}>{approach[active].description}</MotionText></Suspense>}<Link href="/company" className="text-link">Explore our approach <ArrowUpRight aria-hidden="true" /></Link></div></div>;
}

const productIcons = [AudioLines, Workflow, ShieldCheck];
export function ProductPortfolio() {
  const [active, setActive] = useState(0);
  const product = products[active];
  return <div className="product-portfolio"><div className="portfolio-tabs" role="tablist" aria-label="AI products">{products.map((p, i) => { const Icon = productIcons[i]; return <button role="tab" key={p.slug} id={`portfolio-${i}`} aria-controls="portfolio-panel" aria-selected={active === i} tabIndex={active === i ? 0 : -1} onKeyDown={e => tabKey(e, i, products.length, setActive, "portfolio")} onClick={() => setActive(i)}><Icon aria-hidden="true"/><span>{p.name}<small>{p.category}</small></span><ArrowUpRight aria-hidden="true"/></button>; })}</div>
    <div role="tabpanel" id="portfolio-panel" aria-labelledby={`portfolio-${active}`} tabIndex={0} className="portfolio-panel"><div className="portfolio-copy"><span className="eyebrow">{product.name} / {product.category}</span><h3>{product.shortDescription}</h3><p className="text-secondary">{product.description}</p><Button href={product.href} variant="secondary" icon={<ArrowUpRight/>}>Explore {product.name}</Button><span className="portfolio-index">0{active + 1}<span> / 03</span></span></div><div className="portfolio-demo"><ProductDemo key={product.slug} product={product.slug as "m-vcara" | "m-resora" | "m-ordena"} compact /></div></div>
  </div>;
}

const integrationSystems = [
  { title: "Enterprise applications", icon: AppWindow, description: "Bring intelligence into the business applications your teams already work with." },
  { title: "APIs", icon: Braces, description: "Connect AI capabilities to existing services through interfaces scoped to your environment." },
  { title: "Workflows", icon: Workflow, description: "Connect tasks and handovers so intelligence becomes part of an established process." },
  { title: "ITSM platforms", icon: Headset, description: "Discuss how AI service-desk capabilities fit your existing IT service management processes." },
  { title: "Communication systems", icon: MessagesSquare, description: "Explore where voice clarity and intelligent support can fit your communication environment." },
  { title: "Business technology", icon: Database, description: "Start with the systems that matter to your operation and define the right integration scope." },
];
export function IntegrationExplorer() {
  const [active, setActive] = useState(0);
  return <div className="integration-explorer"><div className="integration-hub"><LogoMark size={32}/><span>matenix <small>AI</small></span><span className="hub-label">INTELLIGENCE LAYER</span></div><div className="integration-spine" aria-hidden="true"/><div className="integration-nodes" aria-label="Explore integration contexts">{integrationSystems.map((system, i) => <button key={system.title} aria-pressed={active === i} aria-controls="integration-detail" onClick={() => setActive(i)}><system.icon aria-hidden="true"/><span>{system.title}</span><span className="connection-dot"/></button>)}</div><p id="integration-detail" className="integration-detail" aria-live="polite">{integrationSystems[active].description}</p><span className="concept-label">Integration contexts · Specific connections are scoped with your team</span></div>;
}

export function IndustrySelector() {
  const [active, setActive] = useState(0);
  const industry = industries[active];
  return <div className="industry-selector"><div className="industry-tabs" role="tablist" aria-label="Industry context" aria-orientation="vertical">{industries.map((item, i) => <button key={item.slug} id={`industry-${i}`} role="tab" aria-selected={active === i} aria-controls="industry-panel" tabIndex={active === i ? 0 : -1} onKeyDown={e => tabKey(e, i, industries.length, setActive, "industry")} onClick={() => setActive(i)}>{item.name}{active === i ? <Minus aria-hidden="true"/> : <Plus aria-hidden="true"/>}</button>)}</div><div id="industry-panel" className="industry-panel" role="tabpanel" aria-labelledby={`industry-${active}`} tabIndex={0}><span className="eyebrow">PRACTICAL APPLICATIONS / 0{active + 1}</span><h3>{industry.name}</h3><div className="industry-detail"><span className="detail-label">THE CONTEXT</span><p>{industry.challenge}</p></div><div className="industry-detail"><span className="detail-label">WHERE AI CAN HELP</span><p>{industry.application}</p></div><div className="industry-products">{products.filter(p => industry.productSlugs.includes(p.slug)).map(p => <Link href={p.href} key={p.slug}>{p.name}<ArrowUpRight aria-hidden="true"/></Link>)}</div><span className="concept-label">Potential applications, scoped to your organisation.</span></div></div>;
}

export function AutomationIntake() {
  const [process, setProcess] = useState("");
  const [step, setStep] = useState(0);
  const [challenge, setChallenge] = useState("");
  return <div className="automation-intake"><div className="intake-top"><span className="eyebrow">YOUR NEXT PRACTICAL USE CASE</span><span className="concept-label">0{step + 1} / 02</span></div>
    {step === 0 ? <><label htmlFor="business-process" className="intake-label">Where could work be simpler?</label><select id="business-process" value={process} onChange={e => setProcess(e.target.value)}><option value="">Choose a business process</option><option>Employee support</option><option>Voice communication</option><option>AI application governance</option><option>Repetitive operational workflows</option><option>A different business process</option></select><Button disabled={!process} onClick={() => setStep(1)} icon={<ArrowRight/>}>Define your challenge</Button></> : <><label htmlFor="process-challenge" className="intake-label">What would you like to improve?</label><textarea id="process-challenge" value={challenge} onChange={e => setChallenge(e.target.value)} placeholder="The current problem, systems involved, repetitive tasks, or desired outcome…" rows={3} maxLength={1000}/><div className="button-group"><Button href={`/contact?interest=${encodeURIComponent("AI automation")}&process=${encodeURIComponent(process)}&challenge=${encodeURIComponent(challenge)}`} icon={<ArrowUpRight/>}>Discuss this use case</Button><Button variant="ghost" onClick={() => setStep(0)}>Back</Button></div></>}
    <p className="intake-note">Start with the process. We’ll help define the right approach.</p>
  </div>;
}
