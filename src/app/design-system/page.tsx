import type { Metadata } from "next";
import Link from "@/components/site-link";
import { ArrowDown, ArrowLeft, ArrowUpRight, AudioLines, Check, Layers3, ShieldCheck } from "lucide-react";
import { Badge, Button, Card, Input, SectionHeading, Select, Textarea } from "@/components/ui";
import { LogoMark } from "@/components/brand";
import "@/components/design-system.css";

export const metadata: Metadata = {
  title: "Design System | Matenix AI",
  description: "The Matenix AI visual system: typography, colors, components, spacing, and accessible interaction patterns.",
  alternates: { canonical: "/design-system" },
  robots: { index: false, follow: false },
};

const palette = [
  { name: "Primary background", token: "--bg-primary", value: "#0A0B0D", className: "primary" },
  { name: "Surface", token: "--bg-surface", value: "#13151A", className: "surface" },
  { name: "Elevated", token: "--bg-elevated", value: "#1A1D23", className: "elevated" },
  { name: "Purple action", token: "--accent-primary", value: "#C4A0FF", className: "accent" },
  { name: "Primary text", token: "--text-primary", value: "#F2F3F3", className: "text" },
  { name: "Secondary text", token: "--text-secondary", value: "#B5BAC1", className: "secondary" },
  { name: "Muted text", token: "--text-muted", value: "#969DA7", className: "muted" },
  { name: "Technical line", token: "--border-hairline", value: "#2A2E35", className: "border" },
  { name: "Brand violet", token: "--brand-violet", value: "#7125F7", className: "violet" },
  { name: "Brand cyan", token: "--brand-cyan", value: "#00D4EF", className: "cyan" },
  { name: "Action hover", token: "--accent-hover", value: "#D6BDFF", className: "accent-hover" },
  { name: "Action pressed", token: "--accent-pressed", value: "#B58AFF", className: "accent-pressed" },
];

const contents = [
  ["01", "Color", "color"],
  ["02", "Typography", "typography"],
  ["03", "Actions", "actions"],
  ["04", "Forms", "form-fields"],
  ["05", "Surfaces", "surfaces"],
  ["06", "Layout", "layout"],
];

export default function DesignSystemPage() {
  return (
    <div className="design-system">
      <section className="ds-intro container">
        <Link className="ds-back" href="/"><ArrowLeft aria-hidden="true" /> Back to Matenix AI</Link>
        <div className="ds-intro__heading">
          <div>
            <p className="eyebrow">Matenix AI / Visual foundations</p>
            <h1 className="display">A system<br /><span className="text-muted">with purpose.</span></h1>
          </div>
          <div className="ds-intro__aside">
            <Badge tone="outline" dot>Internal reference · v1.1</Badge>
            <p className="body-large">The foundations behind a clear, consistent enterprise experience. Built for real work, down to the details.</p>
            <Button href="#color" variant="ghost" icon={<ArrowDown />}>Explore the system</Button>
          </div>
        </div>
        <nav className="ds-contents" aria-label="Design system sections">
          {contents.map(([number, label, id]) => <a href={`#${id}`} key={id}><span>{number}</span>{label}<ArrowDown aria-hidden="true" /></a>)}
        </nav>
      </section>

      <section className="section section--bordered" id="color" aria-labelledby="color-title">
        <div className="container">
          <SectionHeading eyebrow="01 / Brand & color" title="A distinct point of view." id="color-title" description="The supplied faceted mark brings violet, purple, and cyan to dark foundations. A lighter purple keeps actions, focus states, and meaningful highlights clearly readable." />
          <div className="ds-brand-specimen">
            <div className="ds-brand-specimen__mark"><LogoMark size={144} /></div>
            <div className="ds-brand-specimen__copy"><p className="eyebrow">The Matenix AI mark</p><h3 className="subheading">One identity, everywhere.</h3><p>The supplied artwork is the source for the site logo, browser icon, and sharing identity. Preserve its proportions and faceted color transitions.</p><span className="ds-brand-specimen__gradient" aria-hidden="true" /></div>
          </div>
          <div className="ds-palette">
            {palette.map((color) => (
              <div className="ds-color" key={color.token}>
                <div className={`ds-color__swatch ds-color__swatch--${color.className}`} aria-hidden="true" />
                <div className="ds-color__info"><h3>{color.name}</h3><p>{color.value}</p><code>{color.token}</code></div>
              </div>
            ))}
          </div>
          <div className="ds-note"><Check aria-hidden="true" /><p>Primary button text has <strong>8.70:1</strong> contrast on light purple. Accent text stays above <strong>7.89:1</strong> across all three dark surfaces. Violet, cyan, and the brand gradient provide decorative emphasis; lighter purple carries interactive states.</p></div>
        </div>
      </section>

      <section className="section section--bordered" id="typography" aria-labelledby="type-title">
        <div className="container">
          <SectionHeading eyebrow="02 / Typography" title="Make the important clear." id="type-title" description="Self-hosted Geist provides an understated editorial voice. Geist Mono adds precision to labels and technical details." />
          <div className="ds-type-specimens">
            <div className="ds-type-row"><p className="ds-caption">Display / 48–96<br />Regular · 1.04 leading</p><p className="display">Built for<br />real work.</p></div>
            <div className="ds-type-row"><p className="ds-caption">Heading / 32–64<br />Regular · 1.13 leading</p><p className="section-title">Intelligence,<br />where it matters.</p></div>
            <div className="ds-type-row"><p className="ds-caption">Subheading / 24–32<br />Medium · 1.13 leading</p><p className="subheading">Built around your business.</p></div>
            <div className="ds-type-row"><p className="ds-caption">Body / 16–18<br />Regular · 1.65 leading</p><p className="body-large">AI should make work simpler, faster and more intelligent, while giving organisations the control, visibility and confidence they need to adopt it responsibly.</p></div>
            <div className="ds-type-row"><p className="ds-caption">Label / 12<br />Mono · uppercase</p><p className="eyebrow">M-VCARA / AI Voice Clarity</p></div>
          </div>
          <p className="ds-note-text">Modular scale: 12 / 14 / 16 / 18 / 24 / 32 / 48 / 64 / 80 / 96 px. Type is expressed in rem and remains responsive to browser zoom.</p>
        </div>
      </section>

      <section className="section section--bordered" id="actions" aria-labelledby="actions-title">
        <div className="container">
          <SectionHeading eyebrow="03 / Actions & states" title="An obvious next step." id="actions-title" description="Three levels of emphasis. Generous targets, visible keyboard focus, and deliberate feedback make the next action easy to understand." />
          <div className="ds-example-panel">
            <div className="ds-example-row"><p className="ds-caption">Primary</p><div className="button-group"><Button href="/contact" icon={<ArrowUpRight />}>Talk to Matenix AI</Button><Button disabled icon={<ArrowUpRight />}>Disabled action</Button></div></div>
            <div className="ds-example-row"><p className="ds-caption">Secondary</p><div className="button-group"><Button href="/solutions" variant="secondary" icon={<ArrowUpRight />}>Explore Solutions</Button><Button variant="secondary" disabled>Disabled action</Button></div></div>
            <div className="ds-example-row"><p className="ds-caption">Ghost</p><div className="button-group"><Button href="/products" variant="ghost" icon={<ArrowUpRight />}>Explore Products</Button><Button variant="ghost" disabled>Disabled action</Button></div></div>
            <div className="ds-example-row"><p className="ds-caption">Size</p><div className="button-group"><Button href="/contact" variant="secondary" size="sm">Small · 44 px</Button><Button href="/contact" variant="secondary">Medium · 52 px</Button><Button href="/contact" variant="secondary" size="lg">Large · 60 px</Button></div></div>
            <div className="ds-example-row"><p className="ds-caption">Keyboard focus</p><div><Button href="#form-fields" className="ds-focus-example" variant="secondary" icon={<ArrowDown />}>View form fields</Button><p className="ds-control-help">Persistent outline shown for review. Use Tab to explore actual focus states.</p></div></div>
            <div className="ds-example-row"><p className="ds-caption">Badges</p><div className="button-group"><Badge>Product platform</Badge><Badge tone="accent" dot>Enterprise AI</Badge><Badge tone="outline">Illustrative concept</Badge></div></div>
          </div>
        </div>
      </section>

      <section className="section section--bordered" id="form-fields" aria-labelledby="form-title">
        <div className="container">
          <SectionHeading eyebrow="04 / Form fields" title="A considered conversation." id="form-title" description="Visible labels, clear helper text, and specific validation feedback. These example controls are for reference and do not submit data." />
          <div className="ds-form-grid">
            <Card as="section" className="ds-form-card" aria-labelledby="field-example-title">
              <h3 id="field-example-title" className="subheading">Field examples</h3>
              <Input id="ds-name" name="example-name" label="Full name" placeholder="Your name" autoComplete="off" required />
              <Input id="ds-email" name="example-email" label="Work email" type="email" placeholder="you@company.com" autoComplete="off" helper="Use your business email address." />
              <Select id="ds-interest" name="example-interest" label="Area of interest" defaultValue="">
                <option value="">Select an area</option><option value="products">AI products</option><option value="integration">System integration</option><option value="automation">Custom AI automation</option><option value="governance">Enterprise AI governance</option>
              </Select>
              <Textarea id="ds-challenge" name="example-challenge" label="Your business challenge" placeholder="Tell us what you would like to improve." helper="Example only. Nothing entered here is sent or saved by this page." />
              <Button disabled type="button">Example submission · disabled</Button>
            </Card>
            <div className="ds-form-states">
              <Card as="section" className="stack" aria-labelledby="validation-title">
                <h3 id="validation-title" className="ds-card-title">Validation & disabled states</h3>
                <Input id="ds-error" name="example-error" label="Work email — error example" type="email" defaultValue="team@" autoComplete="off" error="Enter a complete email address, such as you@company.com." />
                <Input id="ds-disabled" name="example-disabled" label="Company — disabled example" placeholder="Unavailable in this example" disabled helper="Disabled controls remain labelled and are skipped by the keyboard." />
              </Card>
              <div className="ds-principles"><p className="eyebrow">Interaction principles</p><ul><li>Labels remain visible while typing.</li><li>Errors include text and an icon.</li><li>Help and errors are linked to their field.</li><li>Controls keep their native keyboard behaviour.</li><li>Required fields use native required semantics.</li></ul></div>
            </div>
          </div>
        </div>
      </section>

      <section className="section section--bordered" id="surfaces" aria-labelledby="surface-title">
        <div className="container">
          <SectionHeading eyebrow="05 / Surfaces & components" title="Structure without clutter." id="surface-title" description="Fine borders and restrained elevation group related information. Product identities share a common rhythm while keeping their purpose distinct." />
          <div className="grid-3">
            <Card className="ds-product-card card--interactive"><AudioLines aria-hidden="true" /><Badge tone="outline">M-VCARA</Badge><h3 className="ds-card-title">AI Voice Clarity</h3><p>Intelligent, real-time voice enhancement designed to deliver clearer conversations while keeping core voice processing at the endpoint.</p><Button href="/products/m-vcara" variant="ghost" icon={<ArrowUpRight />}>Explore M-VCARA</Button></Card>
            <Card className="ds-product-card card--interactive"><Layers3 aria-hidden="true" /><Badge tone="outline">M-RESORA</Badge><h3 className="ds-card-title">Autonomous AI Service Desk</h3><p>Understand employee issues, diagnose problems, perform approved remediation, and escalate unresolved cases with the right context.</p><Button href="/products/m-resora" variant="ghost" icon={<ArrowUpRight />}>Explore M-RESORA</Button></Card>
            <Card className="ds-product-card card--interactive"><ShieldCheck aria-hidden="true" /><Badge tone="outline">M-ORDENA</Badge><h3 className="ds-card-title">Enterprise AI Governance</h3><p>A centralised platform that helps organisations manage AI application access, user administration, usage visibility and enterprise AI governance.</p><Button href="/products/m-ordena" variant="ghost" icon={<ArrowUpRight />}>Explore M-ORDENA</Button></Card>
          </div>
        </div>
      </section>

      <section className="section section--bordered" id="layout" aria-labelledby="layout-title">
        <div className="container">
          <SectionHeading eyebrow="06 / Space & responsive layout" title="Room to understand." id="layout-title" description="A four-pixel spacing baseline, an 82-rem maximum container, and layouts that preserve hierarchy from small screens to wide displays." />
          <div className="ds-spacing" aria-label="Spacing scale examples">
            {[1, 2, 3, 4, 6, 8, 12, 16, 24, 32].map((space) => <div className="ds-spacing__item" key={space}><span className={`ds-spacing__bar ds-spacing__bar--${space}`} aria-hidden="true" /><code>{space * 4} px</code></div>)}
          </div>
          <div className="ds-grid-demo grid-4" aria-label="Four column responsive grid">
            {["01", "02", "03", "04"].map((column) => <div key={column}><span className="ds-caption">Column {column}</span><span className="ds-grid-demo__line" aria-hidden="true" /></div>)}
          </div>
          <div className="ds-layout-notes grid-3"><div><h3>Four → two → one</h3><p>Four-column grids become two below 1024 px and one below 480 px.</p></div><div><h3>Fluid breathing room</h3><p>Page gutters scale from 20 to 80 px. Standard section spacing scales from 80 to 128 px.</p></div><div><h3>Considered motion</h3><p>Short interaction transitions. Reduced-motion preferences suppress movement and smooth scrolling.</p></div></div>
          <div className="ds-closing"><p className="subheading">Enterprise AI. Built for real work.</p><Button href="/" variant="secondary" icon={<ArrowUpRight />}>View the website</Button></div>
        </div>
      </section>
    </div>
  );
}
