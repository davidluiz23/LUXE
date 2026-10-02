# ALKEBULAN interface system

The `lights-perspective` campaign uses the rounded interface treatment from the `Alkebulan` branch. The active sources are `Frontend/css/african-modern.css` and `Frontend/css/african-modern-home.css`, loaded after the legacy storefront styles by `scripts/build-african-modern.cjs`.

## Shape and spacing

These values follow rendered reference components, rather than unused legacy token declarations.

| Role | Token | Desktop | At 760px and below |
| --- | --- | --- | --- |
| Text fields | `--modern-radius-field` | 13px | 13px |
| Nested utility surfaces | `--modern-radius-inset` | 18px | 18px |
| Product and contact cards | `--modern-radius-card` | 24px | 22px |
| Checkout, account, contact panels | `--modern-radius-panel` | 26px | 22px |
| Main media and authentication container | `--modern-radius-media` | 28px | 28px |
| Primary actions and category controls | `--modern-radius-pill` | 999px | 999px |
| Product image inset | `--modern-card-inset` | 7px | 7px |
| Panel padding | `--modern-panel-padding` | clamp(24px, 3vw, 36px) | 24px 20px |
| Main form/action height | `--modern-control-height` | 52px minimum | 52px minimum |

Product image corners use `calc(var(--modern-radius-card) - var(--modern-card-inset))`. Authentication imagery is clipped by its rounded outer container. Standalone images and loosely nested panels use their own radius role. Compact choices and search controls retain at least 44px height; native checkboxes and radio buttons retain native dimensions and associated labels.

## Color and type

| Role | Value |
| --- | --- |
| Canvas | `#faf7f0` |
| Quiet surface | `#f0ede6` |
| Field | `#fdfbf7` |
| Selected surface | `#e5dfd3` |
| Ink | `#24231f` |
| Secondary text | `#69655c` |
| Borders | `#dad5cb` |
| UI, labels, wordmark | Locally hosted Manrope |
| Navbar wordmark | Manrope 700, .94rem, .13em tracking; matches the `Alkebulan` homepage |
| Navbar links | Manrope 550, .82rem, -.01em tracking |
| Campaign and editorial headings | Locally hosted Instrument Serif |
| Utility panel headings | Manrope 500, 26–28px |
| Product card names | Manrope 500, 18px desktop / 16px mobile |
| Fields | 16px |
| Main actions | Manrope 500, 14px |

Cards and form panels use quiet fills without shadows. Active navigation and selected filters use a persistent filled state; hover does not replace selection. Interaction text and focus indicators use ink, including the legacy accent aliases, so clicking, hovering, or focusing black text does not turn it red. Editorial color remains separate from interaction state. Disabled controls keep their dimensions.

## Components and scope

- `african-modern.css`: navigation, filters, catalog cards, product options, bag, checkout, account, authentication, contact, support, search, and footer.
- `african-modern-home.css`: campaign, editorial product cards, artwork study, and brand sections.
- `admin-modern.css`: existing separate admin theme; customer selectors exclude admin.
- Existing semantic HTML, native form controls, Solar SVG icons, commerce hooks, and GSAP/Lenis motion remain the component conventions.

All garment and editorial image containers use rounded rectangles, including the collection header, artwork study, and story photograph. The campaign portrait, circular icon buttons and avatars, and large section transitions are deliberate shape exceptions. Interior form sections remain open inside their shared panel. Policy text, captions, and dividers are not interactive cards.

## Verification provenance

The `Alkebulan` browser reference measured 24px catalog cards, 13px fields, and 26px form panels. The patched browser render confirms 24px campaign cards with 7px insets, 13px email fields, and 26px account panels with 36px desktop padding. Reference captures are in `artifacts/ui-normalization/reference`; target captures, computed values, and layout reports are in `artifacts/ui-normalization/after`. The 14 affected public routes pass desktop/mobile accessibility checks; narrow-screen layout, campaign controls, search/menu focus, and catalog loading checks also pass.

Skill workflow: UI design extraction followed by an implementation pass. Loaded sources: `SKILL.md`, `references/design-system-extract.md`, `direction/aesthetic-direction.md`, `design-guidelines.md`, and the border-radius, buttons, form-controls, surfaces, and colors guidelines.
