# Verification record

Measured on 11 September 2026 against the local Next.js production build in Chrome 152 on Windows.

## Production and browser checks

The production build and ESLint pass after the supplied-logo and purple/cyan branding update. TypeScript is checked during the build. The latest browser regression run passed all 9 tests in 1.2 minutes. Results are recorded in `playwright-report/index.html` and `artifacts/e2e-results.json`; the suite checks routes and metadata, internal links, responsive layouts, keyboard controls, modal focus, contact validation, and reduced motion.

All 17 pages stay within the viewport at 320, 375, 390, 430, 768, 1024, 1280, 1440 and 1920 pixels: 153 combinations. Automated WCAG checks pass on the homepage, three product pages, contact, company, industries and component reference, with additional mobile checks on the homepage, products and contact.

Desktop and mobile screenshots are in `artifacts/`. Screenshot capture reported no browser errors or failed network responses. Automated accessibility testing is supplemented by visual and keyboard checks; a manual screen-reader audit has not been performed.

The supplied logo renders in shared navigation/footer branding, the homepage architecture and closing section, integration diagrams, the company page, and the design-system reference. Generated favicon, Apple touch icon, and social preview endpoints return HTTP 200 with PNG dimensions of 64×64, 180×180, and 1200×630 respectively. Preview images are saved as `artifacts/brand-*.png`. The original logo file is preserved unchanged.

## Mobile Lighthouse

These measurements are the baseline taken before the supplied-logo and purple/cyan branding update; Lighthouse has not been rerun for that update. Three sequential trials per page used Lighthouse's default mobile simulation and throttling. The table reports the median and retains the full observed performance range.

| Page | Performance median | Performance range | Accessibility | Best practices |
| --- | ---: | ---: | ---: | ---: |
| Homepage | 94 | 77–96 | 100 | 100 |
| M-VCARA | 95 | 94–96 | 100 | 100 |
| Contact | 98 | 89–98 | 100 | 100 |

Reports are saved as `artifacts/lighthouse-{page}-{run}.html` and `.json`, with all trials and medians in `artifacts/lighthouse-summary.json`. These are local lab measurements, not guarantees of deployed performance.

Local SEO scores are 66 because the preview explicitly disallows indexing while the origin is localhost. Set the verified public `NEXT_PUBLIC_SITE_URL` before the deployment build to enable public indexing. Privacy, terms and the internal design-system page remain excluded while they are drafts/internal references.

Optimisations include Latin font subsets (39,264 bytes combined), Framer Motion loaded after interaction, deliberate rather than continuous diagram motion, and navigation without automatic destination prefetching.

## Delivery scope

All 16 requested public pages and the additional design-system reference are implemented. Product visuals are illustrative concepts. `/api/contact` validates a demonstration enquiry and explicitly returns `sent: false`; it has no CRM/email delivery or submission storage. Approved legal details, live delivery configuration and the public domain are deployment inputs documented in the README.
