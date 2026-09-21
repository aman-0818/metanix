# Content provenance and publishing notes

The company copy and the three product descriptions are based on the supplied `About Us.docx` and the Matenix AI website brief. The profile identifies Matenix AI as a product-led technology company and provides the four pillars, seven relevant industry groups, company approach and vision.

The user explicitly authorised continuing through the full website. The document's phased review instruction therefore does not require stopping delivery after a phase.

The user subsequently supplied `ChatGPT Image Sep 11, 2026, 02_49_43 PM.png` as the company logo and requested replacement throughout the website. The original transparent PNG is preserved unchanged at `public/brand/matenix-logo.png`; the logo, generated icons, social preview, and purple/cyan palette follow that artwork. This direct request supersedes the brief's original single-accent colour direction.

## Content model

`src/content/site.ts` contains serialisable typed records for the brand, navigation, products, pillars, industries, supporting-page metadata and editorial primers. A future CMS integration can map its records to these types. The supporting landing pages read those records from one dynamic App Router route with statically generated route parameters and unique metadata.

## Editorial boundaries

- Product descriptions preserve the supplied capabilities. M-VCARA's endpoint statement refers to **core voice processing** and does not imply that all product processing is offline or that no data is transferred.
- M-RESORA performs **approved** remediation and escalates unresolved cases with context. Illustrative workflow stages do not imply support for any particular remediation action.
- M-ORDENA covers AI application access, user administration, usage visibility and governance. No unprovided enforcement, reporting or certification features are asserted.
- Industry examples are prospective discussion contexts derived from the profile. They are labelled illustrative, are not customer stories and make no sector compliance promises. Healthcare examples are limited to non-clinical operations.
- System categories are supplied by the profile. The architecture illustration explicitly states that specific connectors, compatibility and deployment requirements need confirmation.
- The three insights are complete original editorial primers based on the company approach. They contain no fabricated authors, publication dates, research findings, performance results or customer claims.
- The resource hub links to actual product pages and readable primers. No unavailable downloads or empty article links are presented.
- Conceptual product diagrams are labelled as illustrations, not as shipped-product screenshots.
- Privacy, security and governance appear as design considerations. No certifications, independently verified controls or guaranteed outcomes are asserted.

## Legal pages: review required before launch

Privacy and terms pages are clearly marked as drafts without an effective date, and their metadata instructs search engines not to index them. They provide an explicit review framework rather than fabricating a legal entity, jurisdiction, retention policy or contractual terms.

Required inputs include the legal entity and address, legal/privacy contact, actual website collection and processing, deployment service providers, storage locations, retention periods, cookies/analytics decisions, applicable privacy rights, governing law, approved liability/ownership clauses and effective dates. Reconcile the privacy text with the final contact implementation before enabling real collection.

The implemented demonstration posts form contents to `/api/contact` for server validation. That application handler does not deliver, persist or log the enquiry; it returns an explicit demonstration response. The privacy draft accurately describes that current behaviour and requests sample information. No claim is made about infrastructure access logs or a future hosting provider's processing. Live handling and its final policy remain launch inputs.

## Remaining factual inputs

Product specifications, supported integrations, deployment options, real product assets, security documentation and any verified customer evidence should be provided by the company before adding those claims. The current supporting pages do not imply that these missing details have been supplied.
