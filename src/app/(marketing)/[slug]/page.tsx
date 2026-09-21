import type { Metadata } from "next";
import Link from "@/components/site-link";
import { notFound } from "next/navigation";
import {
  ArrowDown, ArrowRight, ArrowUpRight, AudioLines, BookOpen, Check,
  ChevronDown, CircuitBoard, Code2, FileText, Fingerprint, Headset,
  Layers3, LockKeyhole, Network, ShieldCheck, Users, Workflow,
} from "lucide-react";
import { Button, Badge, SectionHeading } from "@/components/ui";
import { LogoMark } from "@/components/brand";
import {
  allPageSlugs, approach, industries, insights, pillars, products,
  supportingPages, type SupportingPageSlug,
} from "@/content/site";
import "@/components/content-pages.css";

type PageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return allPageSlugs.map((slug) => ({ slug }));
}

function isPageSlug(slug: string): slug is SupportingPageSlug {
  return Object.prototype.hasOwnProperty.call(supportingPages, slug);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  if (!isPageSlug(slug)) return {};
  const page = supportingPages[slug];
  return {
    title: page.metaTitle,
    description: page.metaDescription,
    alternates: { canonical: `/${slug}` },
    openGraph: { title: `${page.metaTitle} | Matenix AI`, description: page.metaDescription, url: `/${slug}`, type: "website", siteName: "Matenix AI", locale: "en_GB", images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Matenix AI — Enterprise AI. Built for Real Work." }] },
    twitter: { card: "summary_large_image", title: `${page.metaTitle} | Matenix AI`, description: page.metaDescription, images: ["/opengraph-image"] },
    ...(slug === "privacy" || slug === "terms" ? { robots: { index: false, follow: true } } : {}),
  };
}

const productIcons = [AudioLines, Headset, ShieldCheck];
const pillarIcons = [Layers3, Network, Workflow, ShieldCheck];

function PageHero({ slug }: { slug: SupportingPageSlug }) {
  const page = supportingPages[slug];
  const legal = slug === "privacy" || slug === "terms";
  return (
    <header className={`cp-hero${legal ? " cp-hero-compact" : ""}`}>
      <div className="container">
        <div className="cp-breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span>{page.eyebrow.split(" / ").pop()?.toLowerCase()}</span></div>
        <p className="eyebrow cp-eyebrow"><span aria-hidden="true" />{page.eyebrow}</p>
        <h1 className="display cp-title">{page.title.split("\n").map((line, index) => <span key={line}>{index > 0 && <br />}{line}</span>)}</h1>
        <div className="cp-hero-bottom">
          <p className="body-large cp-intro">{page.description}</p>
          {!legal && <a href="#explore" className="cp-scroll-link"><ArrowDown size={17} aria-hidden="true" /><span>Explore {slug === "company" ? "our approach" : "more"}</span></a>}
        </div>
      </div>
    </header>
  );
}

function ContactBand({ title = "Let's put AI to work.", description = "Start with the challenge. We'll help you identify the right product, integration or automation approach.", label = "Talk to Matenix AI" }: { title?: string; description?: string; label?: string }) {
  return <section className="cp-contact-band"><div className="container cp-contact-inner"><div><p className="eyebrow">YOUR NEXT STEP</p><h2>{title}</h2><p>{description}</p></div><Button href="/contact" size="lg">{label}<ArrowUpRight size={18} aria-hidden="true" /></Button></div></section>;
}

function Process({ title = "One connected approach.", description = "We start with the business challenge and identify where AI, automation and integration can create the greatest value." }: { title?: string; description?: string }) {
  return <section className="section cp-process-section"><div className="container"><SectionHeading eyebrow="THE MATENIX APPROACH" title={title} description={description} /><ol className="cp-process">{approach.map((step, index) => <li key={step.title}><span className="cp-step-number">0{index + 1}</span><h3>{step.title}</h3><p>{step.description}</p>{index < approach.length - 1 && <ArrowRight size={16} className="cp-step-arrow" aria-hidden="true" />}</li>)}</ol></div></section>;
}

function SolutionsPage() {
  return <>
    <section id="explore" className="section"><div className="container">
      <div className="cp-section-top"><p className="eyebrow">FOUR CONNECTED CAPABILITIES</p><p className="text-secondary">A product when it fits.<br />A tailored approach when it matters.</p></div>
      <div className="cp-pillar-list">{pillars.map((pillar, index) => { const Icon = pillarIcons[index]; return <Link href={pillar.href} className="cp-pillar-row" key={pillar.slug}><span className="cp-row-number">{pillar.number}</span><div className="cp-pillar-name"><Icon size={24} aria-hidden="true" /><h2>{pillar.title}</h2></div><p>{pillar.description}</p><ArrowUpRight size={23} aria-hidden="true" /></Link>; })}</div>
    </div></section>
    <section className="section cp-surface"><div className="container cp-split"><div><p className="eyebrow">BUILT AROUND YOUR BUSINESS</p><h2 className="section-title">The problem shapes<br />the solution.</h2></div><div className="cp-prose"><p>No two organisations operate in exactly the same way. The right approach might begin with a product, a connection between existing systems or a workflow built around your specific needs.</p><p>We work with organisations to understand that context. From a single AI use case to an enterprise-wide AI strategy, the focus stays on practical business outcomes.</p><Button href="/contact" variant="ghost">Discuss an AI use case<ArrowRight size={17} aria-hidden="true" /></Button></div></div></section>
    <Process />
    <ContactBand />
  </>;
}

function ProductPreview({ index }: { index: number }) {
  if (index === 0) return <div className="cp-product-preview cp-voice-preview" aria-label="Conceptual illustration of endpoint voice enhancement"><div className="cp-preview-label"><span className="cp-status-dot" />ENDPOINT VOICE PROCESSING</div><div className="cp-waveform" aria-hidden="true">{Array.from({ length: 39 }, (_, bar) => <i key={bar} className={`cp-wave-bar cp-wave-${bar % 9}`} />)}</div><div className="cp-preview-footer"><AudioLines size={16} aria-hidden="true" /><span>Voice in</span><span className="cp-preview-line" /><span>Clarity out</span></div><span className="cp-illustration-label">Conceptual illustration</span></div>;
  if (index === 1) return <div className="cp-product-preview"><div className="cp-preview-label"><span className="cp-status-dot" />THE SERVICE WORKFLOW</div><div className="cp-workflow-preview">{["Understand the issue", "Diagnose the problem", "Perform approved remediation"].map((label, i) => <div key={label}><span className="cp-mini-step">0{i + 1}</span><span>{label}</span>{i === 2 ? <ShieldCheck size={15} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}</div>)}</div><div className="cp-preview-footer"><ArrowUpRight size={16} aria-hidden="true" /><span>Unresolved? Escalate with context.</span></div><span className="cp-illustration-label">Conceptual illustration</span></div>;
  return <div className="cp-product-preview"><div className="cp-preview-label"><span className="cp-status-dot" />A CENTRALISED VIEW</div><div className="cp-governance-preview"><div><LockKeyhole size={22} aria-hidden="true" /><span>AI application access</span></div><div><Users size={22} aria-hidden="true" /><span>User administration</span></div><div><Layers3 size={22} aria-hidden="true" /><span>Usage visibility</span></div></div><span className="cp-illustration-label">Conceptual illustration</span></div>;
}

function ProductsPage() {
  return <>
    <section id="explore" className="section"><div className="container cp-product-list">{products.map((product, index) => { const Icon = productIcons[index]; return <article className="cp-product-feature" key={product.slug}><div className="cp-product-copy"><span className="cp-product-index">PRODUCT / 0{index + 1}</span><div className="cp-product-heading"><Icon size={26} aria-hidden="true" /><h2>{product.name}</h2></div><p className="cp-product-category">{product.category}</p><p className="cp-product-summary">{product.description}</p><Button href={product.href} variant="secondary">Explore {product.name}<ArrowUpRight size={17} aria-hidden="true" /></Button></div><ProductPreview index={index} /></article>; })}</div></section>
    <section className="section cp-surface"><div className="container cp-split"><div><p className="eyebrow">BEYOND THE PRODUCT</p><h2 className="section-title">Part of your<br />larger environment.</h2></div><div className="cp-prose"><p>Beyond our products, Matenix AI can integrate these capabilities into existing enterprise environments or develop purpose-built AI automation for specific business requirements.</p><div className="cp-inline-links"><Link href="/system-integration">Explore integration<ArrowUpRight size={17} aria-hidden="true" /></Link><Link href="/ai-automation">Custom AI automation<ArrowUpRight size={17} aria-hidden="true" /></Link></div></div></div></section>
    <ContactBand title="Find your starting point." description="Tell us what your organisation needs to improve. We can discuss which capabilities fit and what needs a closer look." />
  </>;
}

function IndustriesPage() {
  return <>
    <section id="explore" className="section"><div className="container cp-industries-layout"><aside className="cp-industry-aside"><p className="eyebrow">YOUR OPERATING CONTEXT</p><h2 className="section-title">Start with<br />your industry.</h2><p>Explore potential applications. The right scope, integrations and requirements are defined with your organisation.</p><p className="cp-editorial-note">Illustrative use cases. These are areas for discussion, not customer case studies or industry compliance claims.</p></aside><div className="cp-industry-accordions">{industries.map((industry, index) => <details className="cp-industry-detail" key={industry.slug} name="industry-context" open={index === 0} id={industry.slug}><summary><span className="cp-row-number">0{index + 1}</span><h3>{industry.name}</h3><ChevronDown size={18} aria-hidden="true" /></summary><div className="cp-industry-body"><p className="eyebrow">THE OPERATIONAL CHALLENGE</p><p>{industry.challenge}</p><p className="eyebrow">WHERE AI CAN FIT</p><p>{industry.application}</p><div className="cp-product-tags">{industry.productSlugs.map((slug) => { const product = products.find((item) => item.slug === slug); return product ? <Link href={product.href} key={slug}>{product.name}<ArrowUpRight size={13} aria-hidden="true" /></Link> : null; })}<Link href="/contact">Discuss this use case<ArrowRight size={13} aria-hidden="true" /></Link></div></div></details>)}</div></div></section>
    <ContactBand title="Your organisation has its own context." description="Bring your processes, systems and requirements. Together, we can identify a practical AI starting point." label="Discuss an AI Use Case" />
  </>;
}

const integrationNodes = [
  { title: "Enterprise applications", icon: Layers3, description: "Business applications at the centre of day-to-day operations." },
  { title: "APIs", icon: Code2, description: "The interfaces that make information and actions available across systems." },
  { title: "Workflows", icon: Workflow, description: "The sequences of tasks, decisions and handovers that make up a process." },
  { title: "ITSM platforms", icon: Headset, description: "The existing environment for employee technology support and service operations." },
  { title: "Communication systems", icon: AudioLines, description: "The technologies people use to connect and communicate at work." },
  { title: "Business technology", icon: CircuitBoard, description: "The wider tools and systems that support your organisation's work." },
];

function IntegrationPage() {
  return <>
    <section id="explore" className="section"><div className="container"><SectionHeading eyebrow="THE INTELLIGENCE LAYER" title="Connected to the work already happening." description="A conceptual view of how Matenix AI capabilities can connect with an enterprise environment." /><div className="cp-architecture"><div className="cp-architecture-core"><LogoMark size={40} /><div><strong>MATENIX AI</strong><span>Products · Automation · Governance</span></div></div><div className="cp-architecture-nodes">{integrationNodes.map(({ title, icon: Icon }) => <a href={`#${title.toLowerCase().replaceAll(" ", "-")}`} key={title}><Icon size={21} aria-hidden="true" /><span>{title}</span><ArrowDown size={13} aria-hidden="true" /></a>)}</div><p className="cp-editorial-note">Integration categories shown for illustration. Specific connectors, compatibility and deployment requirements are confirmed during discovery.</p></div><div className="cp-integration-list">{integrationNodes.map(({ title, icon: Icon, description }, index) => <article id={title.toLowerCase().replaceAll(" ", "-")} key={title}><span className="cp-row-number">0{index + 1}</span><Icon size={21} aria-hidden="true" /><div><h3>{title}</h3><p>{description}</p></div></article>)}</div></div></section>
    <section className="section cp-surface"><div className="container cp-split"><div><p className="eyebrow">START WITH THE ENVIRONMENT</p><h2 className="section-title">Make the connections<br />that matter.</h2></div><div className="cp-prose"><p>We begin by understanding the business process and the systems involved. That context shapes where intelligence belongs and how people stay in control.</p><ul className="cp-checklist"><li><Check size={17} aria-hidden="true" />Identify the applications and workflows in scope.</li><li><Check size={17} aria-hidden="true" />Discuss available interfaces and access requirements.</li><li><Check size={17} aria-hidden="true" />Define actions, responsibilities and exception handling.</li><li><Check size={17} aria-hidden="true" />Agree an approach around your existing environment.</li></ul></div></div></section>
    <ContactBand title="Bring AI into your environment." description="Tell us which systems you use and what you need to connect. We can discuss the right integration approach." />
  </>;
}

function AutomationPage() {
  const prompts = [
    { label: "The process", question: "What work needs to get done?", description: "Describe the workflow, the people involved and where it begins and ends." },
    { label: "The friction", question: "Where does repetitive work build up?", description: "Identify manual steps, repeated handovers or tasks that take attention away from higher-value work." },
    { label: "The environment", question: "Which systems are involved?", description: "List the applications and sources of information the process depends on." },
    { label: "The outcome", question: "What would a better process look like?", description: "Define the result you want and where people need to review or approve an action." },
  ];
  return <>
    <section id="explore" className="section"><div className="container cp-automation-intro"><div><p className="eyebrow">PURPOSE-BUILT FOR YOUR REQUIREMENT</p><h2 className="section-title">When your workflow<br />needs its own answer.</h2><p className="body-large">Every organisation has unique processes that may not fit an off-the-shelf product. Custom automation starts with that reality.</p></div><div className="cp-automation-flow"><div><span>01 / YOUR ENVIRONMENT</span><strong>People + systems + processes</strong></div><ArrowDown size={21} aria-hidden="true" /><div className="cp-flow-focus"><Workflow size={24} aria-hidden="true" /><span>02 / PURPOSE-BUILT INTELLIGENCE</span><strong>AI-powered automation</strong></div><ArrowDown size={21} aria-hidden="true" /><div><span>03 / YOUR INTENDED OUTCOME</span><strong>A more intelligent workflow</strong></div><p>Conceptual approach · Scope defined together</p></div></div></section>
    <section className="section cp-surface"><div className="container"><SectionHeading eyebrow="FRAME YOUR USE CASE" title="Four questions. A useful starting point." description="You do not need a finished technical specification. A clear description of the problem is enough to begin a conversation." /><div className="cp-discovery-grid">{prompts.map((prompt, index) => <article key={prompt.label}><div className="cp-discovery-label"><span>0{index + 1}</span><p>{prompt.label}</p></div><h3>{prompt.question}</h3><p>{prompt.description}</p></article>)}</div><div className="cp-discovery-cta"><Button href="/contact" size="lg">Describe your business process<ArrowUpRight size={18} aria-hidden="true" /></Button><span>Share the challenge, systems and desired outcome.</span></div></div></section>
    <Process title="From business challenge to a defined approach." />
    <ContactBand title="Have a process in mind?" description="Let's discuss where custom AI automation can fit, what it should do and how your people stay in control." label="Build a Custom AI Solution" />
  </>;
}

const governancePrinciples = [
  { title: "Access control", text: "Consider which people should have access to which AI applications, and how those responsibilities are managed.", icon: LockKeyhole },
  { title: "Usage visibility", text: "Bring visibility to AI application use so adoption can be understood within the enterprise.", icon: Layers3 },
  { title: "Human oversight", text: "Keep people in control, particularly when AI takes action on behalf of the organisation.", icon: Users },
  { title: "Privacy & security", text: "Make enterprise privacy, security and operational requirements part of the design discussion from the start.", icon: Fingerprint },
];

function GovernancePage() {
  return <>
    <section id="explore" className="section"><div className="container cp-governance-layout"><div className="cp-governance-statement"><ShieldCheck size={37} aria-hidden="true" /><p className="eyebrow">CONTROL IS PART OF THE DESIGN</p><h2>Confidence comes<br />from clarity.</h2><p>What AI is used. Who can access it. Where people remain responsible. A controlled approach starts with these questions.</p></div><div className="cp-principles">{governancePrinciples.map(({ title, text, icon: Icon }) => <article key={title}><Icon size={21} aria-hidden="true" /><div><h3>{title}</h3><p>{text}</p></div></article>)}</div></div></section>
    <section className="section cp-surface"><div className="container cp-split"><div><Badge tone="accent">THE GOVERNANCE PRODUCT</Badge><h2 className="section-title cp-spaced-heading">Meet M-ORDENA.</h2><p className="body-large">Enterprise AI Governance</p></div><div className="cp-prose"><p>{products[2].description}</p><p>Use the product conversation to explore how application access, user administration and visibility fit your organisation&apos;s approach to AI adoption.</p><Button href="/products/m-ordena" variant="secondary">Explore M-ORDENA<ArrowUpRight size={17} aria-hidden="true" /></Button></div></div></section>
    <section className="section"><div className="container cp-prose-banner"><p className="eyebrow">BUILT FOR THE ENTERPRISE</p><h2>Standards, processes<br />and accountability matter.</h2><p>Enterprise AI adoption means integrating intelligence into existing operations while maintaining the standards expected by the business. Our principles guide that work; specific security controls, deployment requirements and compliance needs must be discussed for each engagement.</p></div></section>
    <ContactBand title="Put structure around AI adoption." description="Discuss your AI application environment, access needs and governance priorities with Matenix AI." />
  </>;
}

function CompanyPage() {
  const beliefs = ["Solve real problems rather than build AI for AI's sake.", "Automate repetitive work so people can focus on higher-value activities.", "Integrate with existing systems rather than forcing businesses to replace what already works.", "Build custom solutions when required, based on the organisation's specific needs.", "Put intelligence where it matters: at the endpoint, within workflows and across enterprise systems.", "Keep people in control, particularly when AI takes action on behalf of an organisation.", "Build with enterprise privacy, security and governance in mind."];
  return <>
    <section id="explore" className="section"><div className="container cp-company-manifesto"><p className="eyebrow">OUR BELIEF</p><h2>AI should do more than<br />demonstrate what is possible.</h2><div className="cp-company-belief"><LogoMark className="cp-company-logo" size={160} /><div><p className="body-large">It should make work simpler, faster and more intelligent, while giving organisations the control, visibility and confidence they need to adopt AI responsibly.</p><p>We bring together AI, automation, system integration and enterprise technology to help organisations improve communication, streamline operations, automate repetitive processes and build a more intelligent workplace.</p></div></div></div></section>
    <section className="section cp-surface"><div className="container cp-split"><div><p className="eyebrow">OUR PHILOSOPHY</p><h2 className="section-title">Practical intelligence.<br />Clear principles.</h2></div><ol className="cp-beliefs">{beliefs.map((belief, index) => <li key={belief}><span>0{index + 1}</span><p>{belief}</p></li>)}</ol></div></section>
    <section className="section"><div className="container cp-company-two"><article><p className="eyebrow">BUILT AROUND YOUR BUSINESS</p><h2>No two organisations<br />work the same way.</h2><p>That is why Matenix AI combines ready-to-deploy products with integration and custom AI automation capabilities.</p><p>Whether the requirement is to enhance an existing process, connect AI to enterprise systems, automate a repetitive workflow or build a new AI-enabled solution, we work with organisations to identify the right approach.</p><Link href="/solutions">Explore our solutions<ArrowUpRight size={17} aria-hidden="true" /></Link></article><article><p className="eyebrow">BUILT FOR THE ENTERPRISE</p><h2>Intelligence within<br />your operating reality.</h2><p>Matenix AI is designed for organisations where performance, privacy, security and operational control matter.</p><p>Enterprise AI adoption is about integrating intelligence into existing operations while maintaining the standards, processes and accountability expected by the business.</p><Link href="/enterprise-ai-governance">Our approach to governance<ArrowUpRight size={17} aria-hidden="true" /></Link></article></div></section>
    <section className="section cp-vision"><div className="container"><p className="eyebrow">OUR VISION</p><blockquote>“We envision a future where AI becomes a natural part of everyday enterprise operations, working intelligently in the background, removing friction, improving experiences and helping people make better decisions.”</blockquote><p>Matenix AI is building that future one practical solution, integration and automation at a time.</p><span className="cp-vision-signoff">MATENIX AI <span>Enterprise AI. Built for real work.</span></span></div></section>
    <ContactBand title="Let's build something practical." />
  </>;
}

function ResourcesPage() {
  return <>
    <section id="explore" className="section"><div className="container"><p className="eyebrow">START EXPLORING</p><div className="cp-resource-feature"><div><Badge tone="accent">THE MATENIX PERSPECTIVE</Badge><h2>Start with the work.<br />Then choose the AI.</h2><p>A practical introduction to defining the problem, understanding the workflow and setting the right boundaries.</p><Button href="/insights#start-with-the-work" variant="secondary">Read the perspective<ArrowUpRight size={17} aria-hidden="true" /></Button></div><div className="cp-resource-art" aria-hidden="true"><span>01</span><div className="cp-resource-art-line" /><p>UNDERSTAND<br />THE WORK.</p><ArrowUpRight size={48} /></div></div></div></section>
    <section className="section cp-surface"><div className="container"><SectionHeading eyebrow="PRODUCT GUIDES" title="Get to know the portfolio." description="Explore each product's purpose, workflow and role in an enterprise environment." /><div className="cp-resource-links">{products.map((product, index) => { const Icon = productIcons[index]; return <Link href={product.href} key={product.slug}><Icon size={24} aria-hidden="true" /><div><span>{product.name}</span><h3>{product.category}</h3><p>{product.shortDescription}</p></div><ArrowUpRight size={21} aria-hidden="true" /></Link>; })}</div></div></section>
    <section className="section"><div className="container cp-split"><div><p className="eyebrow">BEFORE WE TALK</p><h2 className="section-title">Make the first<br />conversation useful.</h2><p className="cp-editorial-note">A discussion guide for your team.</p></div><div className="cp-conversation-guide">{[{ title: "Describe the challenge", text: "Which process is difficult today? Who is involved, and where does the friction show up?" }, { title: "Map the environment", text: "Which applications, communication systems or service workflows need to be considered?" }, { title: "Define the boundaries", text: "What should AI be able to do, and which decisions or actions should stay with people?" }, { title: "Agree the intended outcome", text: "What would useful progress look like for the people doing the work?" }].map((item, index) => <div key={item.title}><span>0{index + 1}</span><div><h3>{item.title}</h3><p>{item.text}</p></div></div>)}</div></div></section>
    <ContactBand title="Turn a question into a useful conversation." label="Discuss an AI Use Case" />
  </>;
}

function InsightsPage() {
  return <>
    <section id="explore" className="section"><div className="container"><div className="cp-section-top"><p className="eyebrow">EDITORIAL PRIMERS</p><p className="cp-editorial-note">Original perspectives based on our company approach.</p></div><div className="cp-insights">{insights.map((insight, index) => <details className="cp-insight" key={insight.slug} id={insight.slug} open={index === 0}><summary><span className="cp-insight-number">0{index + 1}</span><div><span className="eyebrow">{insight.category}</span><h2>{insight.title}</h2><p>{insight.description}</p></div><span className="cp-insight-toggle"><BookOpen size={19} aria-hidden="true" /><ChevronDown size={18} aria-hidden="true" /></span></summary><div className="cp-insight-body">{insight.sections.map((section) => <section key={section.title}><h3>{section.title}</h3><p>{section.body}</p></section>)}<div className="cp-insight-end"><span>MATENIX AI / PERSPECTIVES</span><Link href="/contact">Discuss your use case<ArrowUpRight size={16} aria-hidden="true" /></Link></div></div></details>)}</div></div></section>
    <ContactBand title="Good questions lead to practical AI." description="Bring your operational challenge. We can discuss where AI, integration and automation fit." />
  </>;
}

function LegalPage({ type }: { type: "privacy" | "terms" }) {
  const privacy = type === "privacy";
  const sections = privacy ? [
    { title: "Organisation and privacy contact", body: "Before publication, identify the legal entity responsible for this website, its registered address and the contact method for privacy enquiries.", placeholder: "[Legal entity, registered address and privacy contact to be supplied]" },
    { title: "The current demonstration form", body: "The form requests a name, work email, company, role, industry, area of interest and a description of a business challenge. Submitting the demonstration sends entered information to this website's server for validation. The form handler does not deliver or save an enquiry, or log its contents. Please use sample information. The final policy must also describe the deployed form, hosting logs and any other collection that is enabled.", placeholder: "[Confirm live collection, technical logging, required fields and purposes before enabling enquiry delivery]" },
    { title: "Use, service providers and storage", body: "Document how enquiries are used, where they are processed, which hosting or communication providers receive them, and how long information is retained. These details depend on the services selected for the live website.", placeholder: "[Processing purposes, providers, storage locations and retention periods to be confirmed]" },
    { title: "Cookies and analytics", body: "Review the live website's use of cookies, analytics and similar technologies. The published policy and any consent interface must reflect that actual implementation.", placeholder: "[Confirm whether analytics, cookies or other tracking technologies are enabled]" },
    { title: "Rights and enquiries", body: "Set out the rights and request process that apply to the organisation and its visitors, along with any relevant international transfer information. Have the final text reviewed against the applicable requirements.", placeholder: "[Applicable rights, request process, jurisdiction and effective date to be supplied]" },
  ] : [
    { title: "Website operator and scope", body: "Identify the legal entity operating this website and define the scope of these terms. Website use and product or service agreements should be addressed using approved language appropriate to the business.", placeholder: "[Legal entity, registered address and scope to be supplied]" },
    { title: "Website information and product enquiries", body: "The site introduces Matenix AI's company, products and areas of work. Product specifications, supported integrations, deployment details and engagement terms need confirmation through a product or commercial discussion.", placeholder: "[Approved information accuracy, availability and enquiry terms to be supplied]" },
    { title: "Intellectual property and permitted use", body: "Confirm ownership and licensing for the website's name, copy, visual design and other materials. Define permitted use and any restrictions using legally reviewed terms.", placeholder: "[Ownership, permissions and acceptable-use wording to be supplied]" },
    { title: "Liability and third-party services", body: "Any provisions covering warranties, liability, external links or third-party services require review for the legal entity, operating jurisdictions and actual website services.", placeholder: "[Legally reviewed provisions to be supplied]" },
    { title: "Governing law, changes and contact", body: "Specify the appropriate governing law, dispute provisions, contact details and effective date. Confirm how updates to the terms will be communicated.", placeholder: "[Jurisdiction, legal contact and effective date to be supplied]" },
  ];
  return <section className="section cp-legal-section"><div className="container cp-legal-layout"><aside><FileText size={27} aria-hidden="true" /><Badge tone="outline">Draft · Not final legal text</Badge><p>Company and operational details have not yet been supplied. This page is a review framework and must be completed before launch.</p><nav aria-label={`${privacy ? "Privacy policy" : "Terms"} sections`}>{sections.map((section, index) => <a href={`#legal-${index + 1}`} key={section.title}>{section.title}</a>)}</nav></aside><div className="cp-legal-copy"><div className="cp-legal-notice"><strong>Publication status</strong><p>This document has no approved effective date. Bracketed items identify information still required from Matenix AI and its legal reviewer.</p></div>{sections.map((section, index) => <section id={`legal-${index + 1}`} key={section.title}><span className="cp-row-number">0{index + 1}</span><h2>{section.title}</h2><p>{section.body}</p><p className="cp-legal-placeholder">{section.placeholder}</p></section>)}<Link href={privacy ? "/terms" : "/privacy"} className="cp-legal-other">View {privacy ? "website terms" : "privacy policy"}<ArrowUpRight size={16} aria-hidden="true" /></Link></div></div></section>;
}

export default async function SupportingPage({ params }: PageProps) {
  const { slug } = await params;
  if (!isPageSlug(slug)) notFound();
  let content;
  switch (slug) {
    case "solutions": content = <SolutionsPage />; break;
    case "products": content = <ProductsPage />; break;
    case "industries": content = <IndustriesPage />; break;
    case "system-integration": content = <IntegrationPage />; break;
    case "ai-automation": content = <AutomationPage />; break;
    case "enterprise-ai-governance": content = <GovernancePage />; break;
    case "company": content = <CompanyPage />; break;
    case "resources": content = <ResourcesPage />; break;
    case "insights": content = <InsightsPage />; break;
    case "privacy": content = <LegalPage type="privacy" />; break;
    case "terms": content = <LegalPage type="terms" />; break;
  }
  return <div className={`content-page cp-page-${slug}`}><PageHero slug={slug} />{content}</div>;
}
