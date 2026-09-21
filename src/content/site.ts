/**
 * Editorial source: the supplied Matenix AI company profile and website brief.
 * Plain serialisable records keep this layer ready for a future CMS adapter.
 */
export interface Product {
  slug: string;
  name: string;
  category: string;
  description: string;
  shortDescription: string;
  href: string;
}

export interface Pillar {
  slug: string;
  title: string;
  description: string;
  href: string;
  number: string;
}

export interface Industry {
  slug: string;
  name: string;
  challenge: string;
  application: string;
  productSlugs: string[];
}

export interface SupportingPage {
  eyebrow: string;
  title: string;
  description: string;
  metaTitle: string;
  metaDescription: string;
}

export interface Insight {
  slug: string;
  category: string;
  title: string;
  description: string;
  sections: { title: string; body: string }[];
}

export const brand = {
  name: "Matenix AI",
  tagline: "Enterprise AI. Built for Real Work.",
  description:
    "Matenix AI is a product-led technology company building practical AI solutions that solve real business challenges. We bring together AI, automation, system integration and enterprise technology.",
};

export const navigation = [
  { label: "Solutions", href: "/solutions" },
  { label: "Products", href: "/products" },
  { label: "Industries", href: "/industries" },
  { label: "Integration", href: "/system-integration" },
  { label: "Company", href: "/company" },
  { label: "Resources", href: "/resources" },
];

export const products: Product[] = [
  {
    slug: "m-vcara",
    name: "M-VCARA",
    category: "AI Voice Clarity",
    description:
      "Intelligent, real-time voice enhancement designed to deliver clearer conversations while keeping core voice processing at the endpoint.",
    shortDescription: "Clearer conversations. Intelligence at the endpoint.",
    href: "/products/m-vcara",
  },
  {
    slug: "m-resora",
    name: "M-RESORA",
    category: "Autonomous AI Service Desk",
    description:
      "An AI-powered service desk that can understand employee issues, diagnose problems, perform approved remediation and escalate unresolved cases with the right context.",
    shortDescription: "From employee issue to approved action.",
    href: "/products/m-resora",
  },
  {
    slug: "m-ordena",
    name: "M-ORDENA",
    category: "Enterprise AI Governance",
    description:
      "A centralised platform that helps organisations manage AI application access, user administration, usage visibility and enterprise AI governance.",
    shortDescription: "A more controlled approach to enterprise AI.",
    href: "/products/m-ordena",
  },
];

export const pillars: Pillar[] = [
  {
    slug: "products",
    number: "01",
    title: "AI Products",
    description:
      "Practical, enterprise-focused AI products addressing specific operational challenges, from voice communication and IT support to AI governance.",
    href: "/products",
  },
  {
    slug: "system-integration",
    number: "02",
    title: "System Integration",
    description:
      "Connect AI with the enterprise applications, workflows, APIs, ITSM platforms and communication systems your business already uses.",
    href: "/system-integration",
  },
  {
    slug: "ai-automation",
    number: "03",
    title: "On-Demand AI Automation",
    description:
      "Purpose-built AI automation for the workflows, tasks and operational processes that need an approach specific to your organisation.",
    href: "/ai-automation",
  },
  {
    slug: "enterprise-ai-governance",
    number: "04",
    title: "Enterprise AI Governance",
    description:
      "Bring structure to AI adoption with an approach centred on visibility, access control, human oversight and operational accountability.",
    href: "/enterprise-ai-governance",
  },
];

export const approach = [
  { title: "Understand", description: "Start with the business problem, the people involved and the outcome that matters." },
  { title: "Integrate", description: "Connect intelligence to the systems and processes already at work." },
  { title: "Automate", description: "Put AI to work on repetitive tasks, with a clear scope for action." },
  { title: "Govern", description: "Keep people in control with visibility, access boundaries and oversight." },
  { title: "Scale", description: "Build on a practical use case as your organisation's needs develop." },
];

export const industries: Industry[] = [
  {
    slug: "bpo-contact-centres",
    name: "BPOs & Contact Centres",
    challenge: "Voice communication is central to the work. Repetitive support processes can add friction for the people handling conversations.",
    application: "Explore endpoint voice enhancement with M-VCARA, alongside integration and automation for the surrounding operational workflows.",
    productSlugs: ["m-vcara", "m-resora"],
  },
  {
    slug: "it-shared-services",
    name: "IT & Shared Services",
    challenge: "Employee issues need diagnosis, appropriate action and a useful handover when a person needs to step in.",
    application: "Explore M-RESORA for understanding issues, approved remediation and context-rich escalation, connected to existing service workflows.",
    productSlugs: ["m-resora", "m-ordena"],
  },
  {
    slug: "financial-services",
    name: "Financial Services",
    challenge: "Introducing AI into established operations calls for clear access boundaries, oversight and an understanding of existing processes.",
    application: "Discuss AI application governance, internal support and purpose-built workflow automation against your organisation's requirements.",
    productSlugs: ["m-ordena", "m-resora"],
  },
  {
    slug: "healthcare",
    name: "Healthcare",
    challenge: "Administrative workflows and employee support need to work within the organisation's privacy, security and operational requirements.",
    application: "Explore non-clinical workflow automation, internal IT support and AI application governance, with a scope defined around your environment.",
    productSlugs: ["m-resora", "m-ordena"],
  },
  {
    slug: "retail-customer-service",
    name: "Retail & Customer Service",
    challenge: "Customer conversations and internal service processes span people, business applications and repetitive operational tasks.",
    application: "Explore clearer voice communication and custom automation that connects relevant workflows with the systems already in place.",
    productSlugs: ["m-vcara", "m-resora"],
  },
  {
    slug: "technology-companies",
    name: "Technology Companies",
    challenge: "AI applications can become dispersed across teams, while employees still need reliable support for day-to-day technology issues.",
    application: "Explore centralised AI access and usage visibility with M-ORDENA, and approved service-desk remediation with M-RESORA.",
    productSlugs: ["m-ordena", "m-resora"],
  },
  {
    slug: "enterprise-corporate-it",
    name: "Enterprise Corporate IT",
    challenge: "AI adoption has to fit established applications, service processes, access controls and responsibilities.",
    application: "Bring together AI products, system integration and governance to define a practical approach for your enterprise environment.",
    productSlugs: ["m-resora", "m-ordena"],
  },
];

export const supportingPages = {
  solutions: {
    eyebrow: "OUR SOLUTIONS",
    title: "The right intelligence.\nWhere work happens.",
    description: "From a single operational challenge to a connected enterprise approach. Bring together AI products, integration, automation and governance around your business.",
    metaTitle: "Enterprise AI Solutions",
    metaDescription: "Explore Matenix AI products, system integration, custom AI automation and enterprise AI governance for practical business challenges.",
  },
  products: {
    eyebrow: "THE PRODUCT PORTFOLIO",
    title: "Purpose-built AI.\nPractical by design.",
    description: "Three complementary capabilities. Clearer voice communication, intelligent employee support and a controlled approach to enterprise AI adoption.",
    metaTitle: "AI Products | M-VCARA, M-RESORA & M-ORDENA",
    metaDescription: "Meet M-VCARA for voice clarity, M-RESORA for AI service desk support and M-ORDENA for enterprise AI application governance.",
  },
  industries: {
    eyebrow: "INDUSTRIES",
    title: "Different industries.\nReal operational needs.",
    description: "AI adoption starts with understanding how your organisation works. Explore the challenges our products, integration and automation capabilities can help you address.",
    metaTitle: "Enterprise AI Across Industries",
    metaDescription: "Explore AI applications for contact centres, IT, financial services, healthcare, retail, technology companies and corporate IT.",
  },
  "system-integration": {
    eyebrow: "SYSTEM INTEGRATION",
    title: "Intelligence that works\nwith your systems.",
    description: "Bring AI into the environment you already operate. Connect enterprise applications, workflows and business technologies to put intelligence where it can make a practical difference.",
    metaTitle: "Enterprise AI System Integration",
    metaDescription: "Connect AI with existing enterprise applications, APIs, workflows, ITSM platforms, communication systems and business technology.",
  },
  "ai-automation": {
    eyebrow: "ON-DEMAND AI AUTOMATION",
    title: "Your process.\nAn AI solution built for it.",
    description: "Some business processes need a purpose-built approach. We design and develop custom AI-powered automation around specific workflows, tasks and operational requirements.",
    metaTitle: "Custom AI Automation",
    metaDescription: "Discuss purpose-built AI automation for your organisation's workflows, repetitive tasks and operational processes with Matenix AI.",
  },
  "enterprise-ai-governance": {
    eyebrow: "ENTERPRISE AI GOVERNANCE",
    title: "Move AI forward.\nKeep people in control.",
    description: "As AI applications become part of everyday work, organisations need a structured approach to access, visibility and oversight. Build control into the way you adopt AI.",
    metaTitle: "Enterprise AI Governance & Oversight",
    metaDescription: "Build a structured approach to enterprise AI adoption, application access, user administration, usage visibility and human oversight.",
  },
  company: {
    eyebrow: "ABOUT MATENIX AI",
    title: "Built around\nreal business.",
    description: "We are a product-led technology company focused on building practical Artificial Intelligence solutions that solve real business challenges.",
    metaTitle: "About Matenix AI",
    metaDescription: "Matenix AI brings together AI products, automation, system integration and enterprise technology. Enterprise AI. Built for Real Work.",
  },
  resources: {
    eyebrow: "RESOURCES",
    title: "A clearer starting point\nfor enterprise AI.",
    description: "Understand the products, explore the approach and prepare for a focused conversation about what AI could do for your organisation.",
    metaTitle: "Enterprise AI Resources",
    metaDescription: "Explore Matenix AI product guides, enterprise AI primers and questions to help frame your next AI use case.",
  },
  insights: {
    eyebrow: "PERSPECTIVES",
    title: "Practical thinking.\nFor real work.",
    description: "Short perspectives on adopting AI with a clear purpose, connecting it to existing operations and keeping people in control.",
    metaTitle: "Enterprise AI Insights & Perspectives",
    metaDescription: "Read Matenix AI perspectives on practical AI adoption, enterprise integration and the role of human oversight.",
  },
  privacy: {
    eyebrow: "LEGAL / PRIVACY",
    title: "Privacy policy.",
    description: "Draft for review. This page identifies the privacy information that must be confirmed before this website is launched with live data collection.",
    metaTitle: "Privacy Policy — Draft",
    metaDescription: "Matenix AI website privacy policy draft. Company, processing, retention and privacy contact details are pending confirmation.",
  },
  terms: {
    eyebrow: "LEGAL / TERMS",
    title: "Website terms.",
    description: "Draft for review. These website terms require company details and legal review before publication as an operative agreement.",
    metaTitle: "Website Terms — Draft",
    metaDescription: "Matenix AI website terms draft. Legal entity, jurisdiction and approved website terms are pending confirmation.",
  },
} satisfies Record<string, SupportingPage>;

export type SupportingPageSlug = keyof typeof supportingPages;
export const allPageSlugs = Object.keys(supportingPages) as SupportingPageSlug[];

export const insights: Insight[] = [
  {
    slug: "start-with-the-work",
    category: "AI ADOPTION",
    title: "Start with the work. Then choose the AI.",
    description: "A useful AI conversation begins with a specific business problem and the people who experience it.",
    sections: [
      { title: "Name the operational problem", body: "Describe the task in everyday language. Who performs it, what makes it difficult, and what happens when it cannot be completed? A well-defined problem gives both technical and operational teams something concrete to work towards." },
      { title: "Understand the surrounding process", body: "A task rarely happens in isolation. Map its inputs, the systems involved, the decisions people make and the next step in the workflow. This helps distinguish where AI may be useful from where a clearer process or a straightforward integration may be enough." },
      { title: "Agree what good looks like", body: "Define the intended outcome and the boundaries before choosing a solution. Include the conditions that require human attention. Matenix AI's approach starts here: understanding the challenge, then identifying where products, integration or custom automation make sense." },
    ],
  },
  {
    slug: "integration-is-part-of-the-product",
    category: "ENTERPRISE INTEGRATION",
    title: "AI has to fit the way your enterprise works.",
    description: "Existing applications, workflows and responsibilities are part of an AI solution's context from the beginning.",
    sections: [
      { title: "Work with the existing environment", body: "An enterprise has already invested in business applications, service processes and communication systems. Begin by understanding those investments and how information moves between them. The goal is to connect intelligence to useful work within that environment." },
      { title: "Make the handovers explicit", body: "Identify where a workflow begins, which system holds the relevant context, and where the outcome needs to go. Include the people responsible for exceptions. These handovers shape the integration discussion as much as the technical interfaces do." },
      { title: "Confirm the specifics", body: "An integration category is a starting point, not a confirmed connector. Actual applications, API availability, permissions and deployment requirements need to be reviewed for the proposed use case. Matenix AI works across enterprise applications, APIs, workflows, ITSM and communication systems." },
    ],
  },
  {
    slug: "keep-people-in-control",
    category: "GOVERNANCE",
    title: "Useful autonomy has clear boundaries.",
    description: "When AI can take action, the scope of that action and the route to human oversight need equal attention.",
    sections: [
      { title: "Define what AI may do", body: "A useful starting point is to distinguish between understanding an issue, recommending a response and taking an action. Each can call for a different level of permission. The right scope depends on the workflow and the organisation's requirements." },
      { title: "Design for unresolved cases", body: "Not every issue can be resolved automatically. Make the route to a person part of the process. In M-RESORA's product approach, approved remediation sits alongside escalation of unresolved cases with the context needed to continue the work." },
      { title: "Keep adoption visible", body: "Governance also includes how people access AI applications and how that use is understood across an organisation. M-ORDENA brings together AI application access, user administration and usage visibility as part of a structured approach to enterprise AI governance." },
    ],
  },
];
