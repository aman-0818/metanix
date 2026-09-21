# Matenix AI design system

The site uses an editorial dark palette with purple and cyan drawn from the supplied logo, self-hosted Geist and Geist Mono, quiet technical lines, and restrained rectangular surfaces. Company positioning and product descriptions come from the supplied company profile and build brief. Illustrative interfaces must be identified as concepts and must never introduce unsupported product capabilities.

The logo source is the user-provided `ChatGPT Image Sep 11, 2026, 02_49_43 PM.png`. Use the actual supplied artwork through `LogoMark` in `src/components/brand.tsx`; preserve its proportions, faceted geometry, and color transitions. The approved logo replaces the original brief's single cyan accent direction. Saturated violet and cyan support the brand visually; light purple provides accessible interactive emphasis.

## Foundations

Tokens live in `src/app/globals.css`. `@theme inline` exposes the principal colors and fonts to Tailwind v4. Page and component styles consume CSS custom properties so the system can be adjusted globally.

| Token | Value | Role |
| --- | --- | --- |
| `--bg-primary` | `#0A0B0D` | Page background |
| `--bg-surface` | `#13151A` | Panels and cards |
| `--bg-elevated` | `#1A1D23` | Secondary surfaces |
| `--accent-primary` | `#C4A0FF` | Primary actions and meaningful highlights |
| `--accent-hover` | `#D6BDFF` | Primary action hover |
| `--accent-pressed` | `#B58AFF` | Primary action pressed |
| `--brand-violet` | `#7125F7` | Decorative logo-derived violet |
| `--brand-cyan` | `#00D4EF` | Decorative logo-derived cyan |
| `--text-primary` | `#F2F3F3` | Headings and primary text |
| `--text-secondary` | `#B5BAC1` | Supporting text |
| `--text-muted` | `#969DA7` | Metadata and supporting labels |
| `--text-on-accent` | `#190B2E` | Text on primary buttons |
| `--border-hairline` | `#2A2E35` | Decorative separation |
| `--border-strong` | `#69717E` | Interactive field boundaries |
| `--text-error` | `#F2B6AA` | Validation only; not a brand accent |

The three text colors exceed WCAG AA contrast against all three dark surfaces. Measured ratios for primary / secondary / muted text are **17.71 / 10.09 / 7.20** on the primary background, **16.43 / 9.36 / 6.68** on surface, and **15.19 / 8.65 / 6.17** on elevated. Primary button text has **8.70:1** contrast against the light purple default, **11.15:1** on hover, and **7.13:1** when pressed. Light purple text has **9.21:1 / 8.54:1 / 7.89:1** contrast against primary / surface / elevated backgrounds. Saturated brand violet has only **3.10:1** against the primary background and must not carry small text. Form-field boundaries are **4.00:1** against the primary background and **3.71:1** against surface, exceeding the 3:1 non-text target. These values use the WCAG relative-luminance calculation for opaque sRGB tokens. Decorative hairlines are intentionally subtle. Disabled controls are visually subdued and never communicate essential information by contrast alone.

`--brand-gradient` transitions from violet (`#7125F7`) through purple (`#B569FF`) to cyan (`#00D4EF`) at 125 degrees. Use this for decorative rules and artwork, keeping text and primary action fills on solid, contrast-checked tokens. `--accent-subtle` and `--accent-border` are light purple at 8% and 28% opacity; these are decorative surfaces and boundaries, not substitutes for essential control outlines.

The `/design-system` route provides a responsive visual reference for the supplied logo, palette, type scale, states, forms, product surfaces, and grid. Its sample controls do not submit data. It is excluded from search indexing using page metadata.

### Typography

Geist is the primary heading and body family. Geist Mono is reserved for concise product names, technical annotations, and eyebrows. Fonts are provided by `next/font/local` through `--font-geist` and `--font-geist-mono`; there are no external font requests.

The modular scale is **12 / 14 / 16 / 18 / 24 / 32 / 48 / 64 / 80 / 96 px**, defined in rem so browser zoom and user settings work. Display text scales fluidly from 48 to 96 px; section headings scale from 32 to 64 px. Display leading is 1.04, heading leading 1.13, and body leading 1.65. Heading weight is restrained at 400–500. Use `.display`, `.section-title`, `.subheading`, `.body-large`, and `.eyebrow` instead of repeating typography rules.

### Spacing and layout

Spacing uses a 4 px baseline. `--space-1` is 4 px, `--space-4` is 16 px, and the scale extends to `--space-40` at 160 px. The maximum container is 82 rem; page gutters scale from 20 to 80 px. Standard sections use fluid spacing from 80 to 128 px; `.section--compact` uses 48–80 px.

`.container` provides width and centering; `.container--narrow` caps long-form content at 52 rem. `.grid-2`, `.grid-3`, and `.grid-4` provide equal columns. Three- and two-column grids stack below 768 px; four-column grids become two below 1024 px and one below 480 px. All grid children allow content to shrink without creating horizontal overflow.

Use `.section--bordered` for technical section dividers, `.stack` for a vertical rhythm, and `.button-group` for responsive action rows. Structural CSS breakpoints are 480, 768, and 1024 px. Validate layouts at the brief's 320, 375, 390, 430, 768, 1024, 1280, 1440, and 1920 px widths.

## Reusable component API

UI exports are in `src/components/ui.tsx`; `LogoMark` is in `src/components/brand.tsx`. Components produce semantic native HTML and remain server-renderable. Pass event handlers only from a client component.

### Button

```tsx
<Button href="/contact" icon={<ArrowUpRight />}>Talk to Matenix AI</Button>
<Button href="/solutions" variant="secondary">Explore Solutions</Button>
<Button type="submit" size="lg" disabled={pending}>Send enquiry</Button>
```

`variant`: `primary` (default), `secondary`, `ghost`. `size`: `sm`, `md` (default), `lg`. `href` creates a Next.js Link; without it the component creates a button with a safe default `type="button"`. `icon` accepts a React node; `iconPosition` is `right` (default) or `left`. Decorative icon wrappers are hidden from assistive technology. `disabled` uses native semantics on buttons and renders an inert element with `role="link"` and `aria-disabled` for links. Native attributes and `className` are supported.

Buttons have hover, active, focus-visible, and disabled styles. The minimum height is 44 px even for the small size. Keep labels specific, and reserve the filled light purple variant for the primary action.

### Badge and Card

```tsx
<Badge tone="accent" dot>Enterprise AI</Badge>
<Card as="article" className="card--interactive">...</Card>
```

`Badge` accepts `tone="default" | "accent" | "outline"`, `dot`, and native span attributes. Dot indicators must have an accompanying text label. `Card` accepts `as="article" | "div" | "section"` and native attributes. A card is not inherently interactive: add a properly named link or button for navigation. `.card--interactive` provides an optional restrained hover response.

### SectionHeading

```tsx
<SectionHeading
  eyebrow="Our approach"
  title="Start with the real problem."
  description="Practical intelligence, built around your business."
  aside={<Button href="/company" variant="ghost">Our company</Button>}
/>
```

`title` is required and renders an h2. Optional props are `eyebrow`, `description`, `aside`, `align="left" | "center"`, `id`, and `className`. Use one h1 for each page and maintain the hierarchy below section headings.

### Form fields

```tsx
<Input id="work-email" name="email" label="Work email" type="email" autoComplete="email" required error={errors.email} />
<Select id="interest" name="interest" label="Area of interest" required>
  <option value="">Select an area</option>
  <option value="integration">System integration</option>
</Select>
<Textarea id="challenge" name="challenge" label="Your business challenge" helper="Tell us what you would like to improve." />
```

`Input`, `Select`, and `Textarea` require a unique `id` and visible `label`; they accept native attributes, `helper`, `error`, `className` (control), and `wrapperClassName` (field container). Labels use `htmlFor`; helper and error text are linked through `aria-describedby`. Existing description IDs are preserved. Error states set `aria-invalid` and combine an icon, text, and border. Native `required` and `disabled` attributes remain available. Parent forms own validation, submit state, error announcements, and focus management.

## Interaction and accessibility

- Lucide outline icons use a consistent 1.5 stroke and a standard 20 px size, with 16 and 24 px tokens for context.
- Keyboard focus uses a 2 px light purple outline offset by 4 px. Keep outlines visible; do not clip focus rings inside cards.
- Interaction transitions use 160–240 ms. Content reveals may use 600 ms and must remain readable without JavaScript. Page-level motion should use Framer Motion's reduced-motion hook.
- `prefers-reduced-motion` removes smooth scrolling and suppresses CSS movement. Hover changes apply only to hover-capable devices. Forced-color mode retains interactive boundaries.
- Provide a `.skip-link` before navigation, target the main content, and use `.sr-only` for supplementary accessible labels.
- Menus, tabs, dialogs, architecture diagrams, and navigation must follow native or appropriate ARIA semantics, support keyboard input, and avoid communicating state through color alone.

## Shared site patterns

The header and footer belong to the shared site layout. The header uses the brand mark, primary navigation, and one primary contact action; mobile navigation must retain visible hierarchy and explicit close controls. Footer links are grouped by offerings and company context, with legal links separated from primary exploration.

Product previews reuse the typography, border, badge, surface, and spacing tokens. Architecture visuals should show relationships supported by the brief and supplied company profile. Product UI concepts must include a visible illustrative label. Never present concept UI as a shipped screenshot or fabricate adoption metrics, customer logos, or certifications.
