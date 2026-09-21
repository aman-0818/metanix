import type { Metadata } from "next";
import Link from "@/components/site-link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowRight, AudioLines, Headphones, Layers3, LockKeyhole, Network, ShieldCheck, Users, Workflow } from "lucide-react";
import { Badge, Button, SectionHeading } from "@/components/ui";
import { ProductDemo, type ProductSlug } from "@/components/product-demo";
import "@/components/product-pages.css";

const products = {
  "m-vcara": {
    name: "M-VCARA", category: "AI Voice Clarity", headline: <>Clearer conversations.<br /><span>Closer to the source.</span></>,
    description: "Intelligent, real-time voice enhancement designed to deliver clearer conversations while keeping core voice processing at the endpoint.",
    icon: AudioLines,
    proposition: "Put clarity at the centre of communication.",
    propositionDescription: "Voice connects people to customers, colleagues and the work that matters. M-VCARA is designed to make those conversations clearer.",
    capabilities: [{ title: "Real-time enhancement", description: "Intelligent voice enhancement designed for conversations as they happen.", icon: AudioLines }, { title: "Clearer conversations", description: "A practical focus on voice clarity in everyday communication.", icon: Headphones }, { title: "Endpoint processing", description: "Core voice processing stays at the endpoint.", icon: LockKeyhole }],
    workflow: [{ title: "Voice input", description: "A conversation begins." }, { title: "Endpoint enhancement", description: "Core voice processing at the endpoint." }, { title: "Clearer communication", description: "Voice clarity where it matters." }],
    cases: [{ title: "Contact centre conversations", description: "Explore voice clarity for teams whose work depends on conversations with customers." }, { title: "Everyday enterprise communication", description: "Consider voice enhancement for conversations between employees and colleagues." }],
    principle: "Start with the endpoint.",
    principleDescription: "M-VCARA keeps core voice processing at the endpoint. Privacy, security and the organisation’s communication environment should shape deployment planning.",
    question: "Where would clearer conversations make a difference?",
  },
  "m-resora": {
    name: "M-RESORA", category: "Autonomous AI Service Desk", headline: <>From employee issue.<br /><span>To the right next step.</span></>,
    description: "An AI-powered service desk that can understand employee issues, diagnose problems, perform approved remediation, and escalate unresolved cases with the right context.",
    icon: Workflow,
    proposition: "Support that moves the issue forward.",
    propositionDescription: "Bring understanding, diagnosis and approved action into the service workflow, with contextual escalation when a case needs a person.",
    capabilities: [{ title: "Understand and diagnose", description: "Understand employee issues and diagnose the underlying problem.", icon: Headphones }, { title: "Approved remediation", description: "Perform remediation within the actions your organisation approves.", icon: ShieldCheck }, { title: "Contextual escalation", description: "Escalate unresolved cases with the right context for the next person.", icon: Users }],
    workflow: [{ title: "Understand", description: "Establish the employee’s issue." }, { title: "Diagnose", description: "Identify the problem." }, { title: "Remediate", description: "Perform approved actions." }, { title: "Escalate", description: "Pass unresolved cases with context." }],
    cases: [{ title: "Enterprise IT support", description: "Explore an AI-powered service desk for employee issues and approved remediation." }, { title: "IT and shared services", description: "Consider contextual escalation for support workflows that bring AI and people together." }],
    principle: "Autonomy with approved boundaries.",
    principleDescription: "Keeping people in control is central to the Matenix approach. M-RESORA performs approved remediation and escalates unresolved cases with the right context.",
    question: "Where does your service workflow need a better next step?",
  },
  "m-ordena": {
    name: "M-ORDENA", category: "Enterprise AI Governance", headline: <>Your enterprise AI.<br /><span>In clearer view.</span></>,
    description: "A centralised platform that helps organisations manage AI application access, user administration, usage visibility and enterprise AI governance.",
    icon: ShieldCheck,
    proposition: "A structured approach to AI adoption.",
    propositionDescription: "As AI applications become part of everyday work, access, administration and visibility need a more coordinated approach.",
    capabilities: [{ title: "Application access", description: "Manage AI application access from a centralised platform.", icon: LockKeyhole }, { title: "User administration", description: "Bring user administration into your enterprise AI governance approach.", icon: Users }, { title: "Usage visibility", description: "Develop visibility into AI application usage across the organisation.", icon: Layers3 }],
    workflow: [{ title: "Applications", description: "Bring AI application access into view." }, { title: "People", description: "Manage user administration." }, { title: "Visibility", description: "Understand AI usage." }, { title: "Governance", description: "Build a structured approach." }],
    cases: [{ title: "Enterprise AI adoption", description: "Explore a centralised approach as your organisation adopts more AI applications." }, { title: "Corporate IT administration", description: "Consider how access, user administration and usage visibility can support AI governance." }],
    principle: "Control starts with visibility.",
    principleDescription: "M-ORDENA brings AI application access, user administration and usage visibility into a centralised platform. Enterprise requirements and governance priorities guide the conversation.",
    question: "What would a clearer view of enterprise AI make possible?",
  },
} satisfies Record<ProductSlug, unknown>;

function isProductSlug(value: string): value is ProductSlug { return Object.hasOwn(products, value); }

export function generateStaticParams() { return Object.keys(products).map(product => ({ product })); }

export async function generateMetadata({ params }: { params: Promise<{ product: string }> }): Promise<Metadata> {
  const { product } = await params;
  if (!isProductSlug(product)) return {};
  const item = products[product];
  const title = `${item.name} — ${item.category}`;
  return { title, description: item.description, alternates: { canonical: `/products/${product}` }, openGraph: { title: `${title} | Matenix AI`, description: item.description, url: `/products/${product}`, type: "website", images: [{ url: "/opengraph-image", width: 1200, height: 630 }] }, twitter: { card: "summary_large_image", title: `${title} | Matenix AI`, description: item.description, images: ["/opengraph-image"] } };
}

export default async function ProductPage({ params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  if (!isProductSlug(product)) notFound();
  const item = products[product];
  const Icon = item.icon;
  const schema = { "@context": "https://schema.org", "@type": "Product", name: item.name, description: item.description, category: item.category, brand: { "@type": "Brand", name: "Matenix AI" } };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
      <section className="product-page-hero section">
        <div className="container">
          <nav aria-label="Breadcrumb" className="product-breadcrumb"><Link href="/products">Products</Link><span aria-hidden="true">/</span><span aria-current="page">{item.name}</span></nav>
          <div className="product-hero-grid">
            <div className="product-hero-copy"><Badge tone="accent"><Icon size={14} aria-hidden="true" />{item.name}<span className="product-badge-divider" />{item.category}</Badge><h1 className="product-page-title">{item.headline}</h1><p className="body-large text-secondary">{item.description}</p><div className="product-hero-actions"><Button href={`/contact?interest=${product}`} icon={<ArrowRight size={16} />}>Talk to Matenix AI</Button><Button href="#how-it-works" variant="ghost" icon={<ArrowDown size={15} />}>Explore the product</Button></div></div>
            <div className="product-hero-preview"><div className="product-preview-label"><span>PRODUCT EXPLORER</span><span>ILLUSTRATIVE CONCEPT</span></div><ProductDemo product={product} /><div className="product-preview-baseline"><span>Matenix AI / {item.name}</span><span>Built for real work.</span></div></div>
          </div>
        </div>
      </section>
      <section className="section product-capabilities" aria-labelledby="product-capabilities-title"><div className="container"><SectionHeading eyebrow="PURPOSE-BUILT INTELLIGENCE" id="product-capabilities-title" title={item.proposition} description={item.propositionDescription} /><div className="product-capability-grid">{item.capabilities.map((capability, index) => <article className="product-capability" key={capability.title}><div className="product-capability-top"><capability.icon size={22} strokeWidth={1.4} aria-hidden="true" /><span>0{index + 1}</span></div><h3>{capability.title}</h3><p>{capability.description}</p></article>)}</div></div></section>
      <section className="section product-workflow-section" id="how-it-works" aria-labelledby="product-workflow-title"><div className="container"><SectionHeading eyebrow="HOW IT FITS TOGETHER" id="product-workflow-title" title="Intelligence, in the flow of work." description="A conceptual view of the product’s role in your organisation." /><ol className="product-workflow">{item.workflow.map((step, index) => <li key={step.title}><div className="product-workflow-connector"><span>0{index + 1}</span><ArrowRight size={17} aria-hidden="true" /></div><h3>{step.title}</h3><p>{step.description}</p></li>)}</ol><p className="product-concept-note">Conceptual workflow. Configuration and deployment requirements are confirmed during scoping.</p></div></section>
      <section className="section" aria-labelledby="product-use-cases-title"><div className="container"><div className="product-section-split"><SectionHeading eyebrow="POSSIBLE APPLICATIONS" id="product-use-cases-title" title="Start with your business context." description="Every organisation works differently. These are starting points for a conversation about fit." /><div className="product-use-cases">{item.cases.map((useCase, index) => <article key={useCase.title}><span className="product-case-number">0{index + 1}</span><div><h3>{useCase.title}</h3><p>{useCase.description}</p></div><ArrowRight size={18} aria-hidden="true" /></article>)}</div></div></div></section>
      <section className="section product-integration-section" aria-labelledby="product-integration-title"><div className="container"><div className="product-section-split"><div><p className="eyebrow">BUILT AROUND YOUR BUSINESS</p><h2 className="section-title" id="product-integration-title">Part of your environment.<br /><span className="text-muted">Part of your workflow.</span></h2><p className="body-large text-secondary">Matenix AI brings AI, automation and system integration together to work with the systems businesses already use.</p><Button href="/system-integration" variant="ghost" icon={<ArrowRight size={16} />}>Explore system integration</Button></div><div className="product-integration-panel"><Network size={25} strokeWidth={1.4} aria-hidden="true" /><h3>Scope the right connections.</h3><p>Specific integrations are confirmed during scoping. We start with your existing environment, the operational problem and the requirements that matter to your organisation.</p><div className="product-integration-path"><span>Your environment</span><span aria-hidden="true">↔</span><span>{item.name}</span></div></div></div></div></section>
      <section className="section" aria-labelledby="product-control-title"><div className="container"><div className="product-control-panel"><div className="product-control-symbol"><ShieldCheck size={44} strokeWidth={1} aria-hidden="true" /></div><div><p className="eyebrow">PEOPLE REMAIN IN CONTROL</p><h2 className="section-title" id="product-control-title">{item.principle}</h2><p className="body-large text-secondary">{item.principleDescription}</p><Link href="/enterprise-ai-governance" className="product-text-link">Our approach to enterprise AI governance <ArrowRight size={15} aria-hidden="true" /></Link></div></div></div></section>
      <section className="section product-page-cta"><div className="container"><div><p className="eyebrow">LET’S MAKE IT PRACTICAL</p><h2 className="section-title">{item.question}</h2><p className="body-large text-secondary">Tell us about the challenge. We’ll explore where {item.name} could fit.</p><Button href={`/contact?interest=${product}`} icon={<ArrowRight size={16} />}>Talk to Matenix AI</Button></div></div></section>
      <nav className="container product-more-links" aria-label="More Matenix products"><span>Explore the portfolio</span>{Object.entries(products).filter(([slug]) => slug !== product).map(([slug, other]) => <Link href={`/products/${slug}`} key={slug}><span>{other.name}<small>{other.category}</small></span><ArrowRight size={18} aria-hidden="true" /></Link>)}</nav>
    </>
  );
}
