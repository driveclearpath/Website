# ClearPath Holdings — Marketing Site Rewrite Brief

**For:** the next Claude agent assigned to this rewrite
**From:** the agent who just rebuilt clearpath-practice's landing page
**Date:** 2026-05-03

---

## Mission

Rewrite this site (`driveclearpath.com`) to match the editorial design language of the new ClearPath Practice landing page. The Practice page is the canonical design reference; this site needs to become its sibling so the family of products feels coherent.

**Why this matters:** the current site uses 2022-era tech-startup tropes (particle backgrounds, cursor glow, pulse dots, dramatic red "leaking money" stats). It looks like a template — busy, performative, trying hard. The Practice page just shipped a complete inversion: editorial restraint, Source Serif 4 display headlines, navy + cream + single blue accent, numbered editorial entries instead of card grids. Brad wants the holdings site brought to that standard.

**The aesthetic target Brad described:** *"high-profile New York City business office."* References: Bridgewater, Two Sigma, Wachtell Lipton, McKinsey. Confident editorial typography. No tech-startup decoration.

---

## Brand thesis (load-bearing — every page reinforces this)

> **Small family businesses keep getting bought up by corporate America. Not because they're bad businesses — because they don't have the operational sophistication to compete with the firms doing the buying. ClearPath gives them that sophistication so they stay independent.**

This applies across all four products:
- **ClearPath OS** → independent auto shops vs roll-ups (Caliber, Driven Brands, Christian Brothers)
- **ClearPath Practice** → independent financial advisors vs RIA aggregators (Mariner, Creative Planning, Mercer)
- **ClearPath Experience** → shops without enterprise screen budgets
- **ClearPath Events** → independent event operators competing with managed-services firms

The "corporate America" framing is intentional and Brad's word. **Don't soften it.** Avoid politicizing it — the framing is *operational sophistication*, not class warfare.

---

## Design source of truth: clearpath-practice

**Repo path on Brad's machine:** `c:\Users\downa\Projects\clearpath-practice`
**GitHub:** `https://github.com/driveclearpath/clearpath-practice` (private — Brad will grant you access)

**Read these files first** as the canonical design system:

| File | What it teaches you |
|------|---------------------|
| `app/page.tsx` | Page composition order |
| `app/layout.tsx` | Font loading (Inter + Source Serif 4) |
| `app/globals.css` | Color tokens, font-serif class, card patterns |
| `components/Nav.tsx` | Nav with ClearPath family Products dropdown |
| `components/Hero.tsx` | Serif headline + dashboard mockup + floating cards |
| `components/Numbers.tsx` | Editorial 4-stat row, no chrome |
| `components/Pillars.tsx` | **The canonical numbered editorial entries pattern** |
| `components/BeyondTheCall.tsx` | Same pattern + "In the field" sidebar |
| `components/HowItWorks.tsx` | Numbered horizontal step flow |
| `components/IntegrationBand.tsx` | Compliance reassurance + data flow diagram |
| `components/FoundersNote.tsx` | Editorial column with founder voice + signature |
| `components/Pricing.tsx` | Single-tier pool + overage editorial pricing |
| `components/FAQ.tsx` | Numbered Q&A in editorial format |
| `components/CTA.tsx` | Closing section with pilot eyebrow |
| `components/Footer.tsx` | Footer with ClearPath family links |

---

## Design system (adopt verbatim)

### Typography
- **Display:** Source Serif 4 (Google Fonts), weights 400/500/600/700, italic available
- **Body:** Inter (Google Fonts)
- All h1/h2 use serif. h3 also serif when in editorial entries.
- Italic emphasis frequently in subheads (e.g. "with clarity.")
- Eyebrows: 11px, semibold, uppercase, 0.18em letter-spacing, blue
- Serif font-feature-settings: `"ss01", "liga"`; letter-spacing `-0.01em`

### Color tokens (CSS custom properties)
```css
--color-bg: #FAFBFC;
--color-surface: #FFFFFF;
--color-surface-soft: #F8FAFC;
--color-border: #E5E7EB;
--color-border-strong: #D1D5DB;
--color-ink: #0F172A;
--color-text: #1E293B;
--color-text-muted: #475569;
--color-text-dim: #64748B;
--color-text-faint: #94A3B8;
--color-navy: #0B3D91;
--color-navy-deep: #082968;
--color-blue: #2563EB;
--color-blue-soft: #DBEAFE;
--color-blue-bg: #EFF6FF;
--color-coral: #F87171;        /* recovery / danger ONLY — not ambient */
--color-coral-soft: #FEE2E2;
--color-emerald: #10B981;       /* success / pulse dots only */
```

**Discipline:**
- Navy + blue dominant
- Coral only for danger / recovery / urgency states (never ambient)
- No teal in marketing copy (it stays in the app for charts only)
- All section eyebrows are uniformly `text-blue` across the page

### Spacing & layout
- Editorial sections: `py-32`
- Numbers row: `py-20`
- Editorial section container: `max-w-4xl mx-auto px-6` (narrower than feature pages)
- Headers within editorial sections: `max-w-2xl` for paragraph copy

### Patterns to replicate

**Numbered editorial entry** (the load-bearing pattern):
```html
<article class="grid grid-cols-[100px_1fr] gap-12 py-10 border-b border-[var(--color-border)]">
  <div class="font-serif text-4xl font-semibold text-[var(--color-text-faint)]">
    01
  </div>
  <div>
    <h3 class="font-serif text-3xl font-semibold text-[var(--color-ink)]">
      Title here
    </h3>
    <p class="mt-3 text-[17px] leading-relaxed text-[var(--color-text-muted)]">
      Two-to-four sentence body. Direct, specific, no hype.
    </p>
  </div>
</article>
```

**Numbers row:** 4-col grid, big serif numerals (`text-6xl/8xl`), small uppercase eyebrow underneath. Each cell separated by `border-l border-border pl-6`.

**"In the field" sidebar:** `border-l-2 border-[var(--color-coral)] bg-[var(--color-bg)] p-12` — editorial callout for real client narratives. Use for case studies / customer stories.

**Founder's note:** `max-w-2xl mx-auto`, no card, serif body at `19px / line-height 1.65`. First paragraph at `text-2xl` for emphasis. Signature block at bottom: avatar circle (gradient navy→blue) + name + title + location.

**Pricing:** `grid md:grid-cols-[auto_1fr] gap-20`, big serif price on left (`text-7xl/8xl`), what's-included list on right. Three trust signals at the bottom (pilot, NDA, no integration).

---

## What to KILL from current driveclearpath.com

- `<canvas id="bg-canvas">` — particle background
- `<canvas id="hero-canvas">` — hero canvas effect
- `.cursor-glow` — mouse-follow glow
- `.pulse-dot` everywhere
- `.fade-up` / `.fade-up-delay-1/2/3` cascading animations
- `.product-cards` and `.pain-cards` (card grids)
- "$47K+ leaked / 73% / Close" dramatic colored stats
- `.scroll-indicator` with bouncing arrow
- All hand-rolled SVG decoration that's purely decorative
- "Built by a shop owner" tagline (replace with the corporate-America thesis)

## What to KEEP

- Brand identity (ClearPath name, checkmark logo mark on `cp-icon-white.png` — though consider redesigning it to match the cleaner aesthetic)
- Portfolio structure (4 products: OS, Experience, Voice, Events)
- Brad Fournier as founder, Manchester NH location
- SEO metadata, OG tags, structured data JSON-LD (don't change without checking)
- Inter font loading (add Source Serif 4 alongside)
- Netlify deployment + `netlify.toml`
- The `/assets` directory contents (use sparingly)

---

## Page-by-page rewrite plan

### `index.html` — Holdings home

Reorder/rewrite into editorial flow:

1. **Nav** — match Practice nav: small logo + Product dropdown ("ClearPath family" panel) + Sign in (subtle text link) + "Talk to us" (primary CTA)
2. **Hero** — kill all canvas effects. Suggested copy:
   - Eyebrow: `Built to keep you independent`
   - Headline (serif, large): `Run your business with the operational layer corporate America already has.`
   - Subhead: `Four products, one mission: arm the small operator with what the firms buying their neighbors already use.`
   - Two CTAs: "Talk to us" (primary, mailto:info@driveclearpath.com) + "See what we build" (anchor to #products)
   - Optional: a small static product-mosaic visual to right (no canvas)
3. **Numbers row** — 4 stats, no chrome:
   - `4` Products live
   - `45,000+` Event attendees served
   - `65+` KPIs tracked across products
   - `$0` Vendor integration required
4. **"What we build"** — editorial numbered entries (01–04), one per product. Each: numeral → product name → 2-paragraph editorial body → small "Learn more →" link to the subpage. Drop the card-icon treatment.
5. **Founder's note** — same component pattern as Practice. Use the exact thesis copy from `clearpath-practice/components/FoundersNote.tsx` as the starting point; adapt slightly to be holdings-level rather than Practice-specific.
6. **"In the field"** — editorial sidebar (coral left border) with one real customer/shop scenario. Brad will need to provide a real one; until he does, mirror the Margaret O'Brien narrative from Practice as a placeholder structure.
7. **CTA** — closing section with eyebrow "Now accepting pilot practices and shops" (pulsing emerald dot). "Talk to us" primary button.
8. **Footer** — match Practice footer with ClearPath family links + Manchester NH locator.

### `os.html` — ClearPath OS

Use the Practice landing page as the structural template. Adapt content:
- Hero with OS-specific thesis (auto shops vs roll-ups like Caliber, Driven Brands)
- Numbers (10 modules, 12 diagnostic engines, 65+ KPIs, $X average revenue recovered — get real numbers from Brad)
- "What it does" — 6–8 numbered editorial entries for the modules (replaces current card grid)
- "Between the work orders" — recovery / scoring / AI features parallel to Practice's "Between the calls"
- "How it works" — operational walkthrough
- IntegrationBand-equivalent — "Lives outside Tekmetric / Mitchell / Shop-Ware"
- Founder's note (can share component, swap copy)
- Pricing (TBD — confirm with Brad. May follow Practice's pool+overage if AI calls are involved)
- FAQ (shop-owner objections — vendor lock-in, KPI accuracy, training cost, Tekmetric integration)
- CTA

### `experience.html` — ClearPath Experience

Same template, adapted for shop TV displays:
- Hero: "The screens that run themselves."
- Numbered entries: lobby / counter / floor / owner office (4 contexts)
- Pricing per screen or per shop (confirm with Brad)
- FAQ (hardware requirements, content updates, network requirements)

### `events.html` — ClearPath Events

Same template for event operators:
- Hero: independent event operators competing with managed-services firms
- Numbered entries: registration / POS / volunteers / car clubs (4 modules)
- Pricing
- FAQ

### `voice.html` — ClearPath Voice

**Confirm with Brad** whether Voice is still a separate product or being merged into OS/Practice. If separate, same template adapted for phone-system + coaching for service businesses.

### `pricing.html` — Combined pricing

Editorial pricing for all products on one page. Single-column flow, each product gets a section with the same big-serif-price + included-list + trust-signals treatment. Reference: `clearpath-practice/components/Pricing.tsx`. Practice uses **$299/advisor/month with 500 minutes pool + $0.40/min overage** — this is locked.

### `about.html` — About Brad / ClearPath Holdings

Long-form founder's note. The brand thesis essay. Brad's bio. Multi-industry mission statement. No card grids, no team photo grid — single editorial column.

### `contact.html` — Contact

Single editorial column. Form with serif label-style typography. NDA-first messaging prominent.

### `intake.html` — Customer intake

Editorial single-column form. Same restrained styling. Confirm with Brad what this collects.

### `login.html` — Product login chooser

Editorial layout. Each product gets a clear button. No SaaS-y centered card with logo.

### `privacy.html` — Privacy policy

Keep content (legally important). Restyle to match the editorial typography.

---

## Technical recommendations

### Option A — Keep static HTML *(recommended)*
- Hand-translate the React patterns to vanilla HTML + CSS
- Update `css/styles.css` to load Source Serif 4 + Inter
- Replace card-grid HTML structures with editorial entries
- Same Netlify deployment, no build complexity added

### Option B — Convert to Next.js *(better long-term, more scope)*
- Migrate pages to Next.js App Router
- Share components between clearpath-website and clearpath-practice via a workspace package
- Or duplicate components for now, dedupe later
- Deploy on Vercel, or stay on Netlify with Next adapter

**Pick Option A unless Brad explicitly asks for the migration.** The marketing site doesn't need React's complexity, and faster delivery matters more than DRY components right now.

---

## Voice / copy guidance

Read `clearpath-practice/components/FoundersNote.tsx` for the canonical founder voice. Defining traits:

- **Direct.** No hedging. No "we believe" / "we strive."
- **The "corporate America" framing recurs** — don't soften.
- **Italics for thesis emphasis** ("you stay independent")
- **Short sentences for impact.**
- **"We don't [X]. We don't [Y]. We don't [Z]."** cadence works well.
- **Closes with a definitive line** ("That's the whole point.")
- **Avoid:** hype words ("revolutionary", "game-changing"), generic SaaS phrases ("save time / boost productivity"), corporate-speak ("synergize", "operationalize"), startup-bro ("crush it", "10x").

---

## Constraints & guardrails

- **Don't alter SEO metadata or structured data** without checking with Brad first. Current titles/descriptions are tuned.
- **Don't add testimonials or client names** unless Brad provides them. He's actively pursuing pilots; fabrication breaks trust.
- **Don't change pricing numbers** without checking. Practice is locked at $299/advisor + 500 min pool + $0.40 overage. Other product pricing is TBD — ask before making numbers up.
- **Don't ship without Brad's eyes on copy.** Founder voice is non-negotiable.
- **Don't create new fonts or accent colors** beyond what's in the design system. Discipline matters here.
- **Keep accessibility tight** — semantic HTML, alt text, color contrast >= 4.5:1.

---

## Definition of done

- All pages match the editorial aesthetic of clearpath-practice
- Brand thesis surfaces in every hero subhead
- No particle / cursor-glow / pulse-dot effects remain
- Source Serif 4 + Inter loaded; serif applied to all h1/h2/h3
- Each product subpage follows the Practice template structure
- Pricing structure consistent (pool + overage where applicable)
- FAQ sections handle each product's specific objections
- Founder's note appears on holdings home + about page minimum
- Site still passes basic Lighthouse (load time, accessibility, SEO)
- Netlify deploy still works
- All internal links updated; no 404s

---

## Workflow for the next agent

1. Read this brief end-to-end
2. Clone or open clearpath-practice locally and read the reference component files listed above
3. Run Practice's dev server (`npm run dev` in clearpath-practice) to see the live aesthetic
4. Audit current driveclearpath site: `index.html`, `css/styles.css`, all `*.html` pages
5. Propose a phased rewrite plan to Brad before touching anything (e.g., "I'll do `index.html` first, deploy to a preview branch, get sign-off, then OS, then Experience, then Events")
6. Work in small, reviewable chunks. Don't ship a 3,000-line PR.
7. Commit often. Push to a feature branch. Open a PR for review.
8. Each page ships independently — the marketing site can be partially rewritten without breaking.

---

## Questions to ask Brad before starting

- "Voice as a separate product — still planned, or merging?"
- "Pricing for OS / Experience / Events — what numbers do you want anchored?"
- "Real customer stories I can use in 'In the field' sidebars?"
- "Logo treatment — keep `cp-icon-white.png` as is, or refresh to match the new aesthetic?"
- "Hosting — staying on Netlify, or considering Vercel?"
- "Preview deployments — want each page rewrite on a branch URL before merging to main?"

---

Good luck. The Practice page sets the bar. Match it.
