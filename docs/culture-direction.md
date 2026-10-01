# ALKEBULAN — Culture in motion

The September 30 direction builds a contemporary African art house: orange contour ribbons flow behind the entire website, with a subtle original geometric relief-print texture. Four independent forms drift, move away from the pointer and spring back. Real garment photography, confident condensed typography, and rounded warm paper surfaces bring the collection forward. The brand's own Ijele, Durbar, and Dùn Dùn artwork carry the cultural story. The owner's uploaded orange contour and graphic-poster references supersede the earlier indigo textile background; earlier assets remain preserved.

Skills used: `build-awwwards-quality-sites`, `ui-design` in Build mode, `ui-animation`, `cinematic-gsap-lenis-motion-system` for the authored scroll scenes, and `imagegen` for the original artwork.

- Hero: a rounded cream editorial panel with the actual Ijele photograph floating over the continuous orange contour field.
- Type: locally hosted Barlow Condensed 600 for display; existing Manrope 400/600 for reading and controls; existing Instrument Serif 400 italic for editorial emphasis.
- Palette: paper `#f5f1e8`, charcoal `#24241f`, clay accent `#a14428`, orange liquid `#f38d42`. One radius family: 40px reading surfaces, 26px cards, 16px fields, pill buttons and circular icon controls, scaled down on phones. Closely nested surfaces use concentric radii.
- Sequence: culture hero → moving type ribbon → pinned “From our roots / Into your rhythm” composition → desktop horizontal artwork archive → oversized manifesto and detail photograph → collection invitation → complete footer.
- Shared system: floating pill navigation; rounded catalog mastheads and product imagery; consistent forms, bag, checkout, support, account, and footer. The continuous liquid artwork stays visible in the gutters, section gaps, hero, and pinned story.
- Motion: GSAP entrance and heading choreography; hero depth on departure; a pinned, reversible brand-story timeline; a horizontal desktop archive with keyboard focus navigation; manifesto image parallax. Lenis is the sole smooth-scroll engine, with native touch. Reduced motion restores ordinary flowing content, full headings, static artwork, and vertical product cards. The first hero entrance runs once per session.
- Three.js: one fixed canvas on each public route. Four spring-driven fields form merging orange contour bands. Window-level pointer repulsion, independent drift, and gentle scroll displacement keep the background interactive past the hero. Passive touch input preserves native scrolling. Lazy loading, capped DPR, visibility pausing, context-loss fallback, reduced motion, and complete disposal keep the effect optional.
- Sources: original product photographs remain unchanged; generated abstract artwork is decorative and not presented as a historical object. Existing local Solar icons and brand mark remain. All assets hosted locally.

```text
ALKEBULAN             Collection / Men / Women / Story             utilities
──────────────────────────────────────────────────────────────────────────
AFRICAN ROOTS                         [interactive pigment artwork]
CULTURE                               [actual Ijele photograph]
in motion.                            [artwork selector]
Brand proposition / Shop the collection
──────────────────────────────────────────────────────────────────────────
                     A living expression of where we come from.
THE WEARABLE ARCHIVE                         [all pieces ↗]
[Ijele]                       [Durbar]                     [Dùn Dùn]
──────────────────────────────────────────────────────────────────────────
[Durbar detail photograph]    ROOTS RUN DEEP. / EXPRESSION RUNS FREE.
──────────────────────────────────────────────────────────────────────────
FIND YOUR EXPRESSION.         Men ↗ / Women ↗ / All pieces ↗
ALKEBULAN / complete shop, account, contact and support footer
```

## Implementation and review

The default production build is `npm run build` (`scripts/build-culture.cjs`). Home, story, shared background, and shared footer templates live in `scripts/culture/`; all public routes load the authoritative `Frontend/css/culture.css`. The build inserts exactly one background and pause control per public route and is safe to repeat. Prior concept files remain on disk but are not loaded by the active templates. The admin application and commerce/authentication data modules retain their existing behavior.

GSAP and Lenis are bundled locally in `Frontend/js/culture/experience.js`. Three.js is a lazy chunk loaded only when motion is permitted. The contour field is capped at 30 paints per second and DPR 1–1.25. Its original relief-print texture supplies worn geometric impressions. A Pause/Play control, tab/window pausing, context-loss fallback, preference-change cleanup, and page lifecycle cleanup keep it optional. `flow-field.mjs` advances the four independent forms with bounded, critically damped springs and a reused buffer.

The three original product photographs remain unchanged. Published admin slide imagery and explicit catalog product bindings feed the hero; the supplied artwork receives a product destination only when its ALKEBULAN catalog name has a unique match. Otherwise its destination remains the real collection. No invented prices, availability, or product identifiers are shown.

Original generated artwork, exact prompts, and research links are documented in [asset provenance](../Frontend/assets/culture/SOURCES.md). The active generated texture is `source-assets/culture/print-rhythm.png`, exported as `Frontend/assets/culture/print-rhythm.webp`. `scripts/render-flow-posters.cjs` captures the actual rendered shader into desktop and phone `contour-flow` posters, providing the same visual direction without WebGL or motion. Prior pigment and indigo artworks remain preserved. No supplied Pinterest artwork is embedded in the storefront.

## Motion reference and implementation

The owner supplied [Black Balance](https://black-balance.shop/). It was inspected directly in Chromium on September 30 after the text browser could not reach it. Captured scroll positions revealed a pinned opening composition, a statement assembled through scrolling, floating product imagery, and a persistent wave background. The new ALKEBULAN work borrows the interaction principles, with original typography, textile artwork, motion timing, layout and implementation; no Black Balance code, copy, logos or product assets ship with ALKEBULAN.

Pinterest was also searched for indigo textile references. Museum sources remain the attribution sources for the artwork direction. `scripts/inspect-reference.cjs` is a read-only research utility; captures remain in the ignored artifacts directory.

`scripts/culture/chapters.mjs` owns the two scroll scenes. The story pins for 1.4 viewport heights on desktop and 1.05 on phones, only if the whole scene fits below the header. The archive uses a horizontal track only above 1024px wide and 680px tall, and only when the track actually overflows. Resize reconciliation removes empty pins and restores them when needed. Keyboard focus brings offscreen products into view immediately, without waiting for wheel smoothing; short landscape views retain normal flow and a reachable story CTA. All pins, event handlers, transforms, and enhancement classes revert on reduced-motion changes and page cleanup. `scripts/review-motion.cjs` captures live arrival, unfolding, and archive states on desktop and phone.

Current behavior validation: all 30 unit tests (including autonomous drift, pointer repulsion, recovery and bounded physics); all nine culture browser tests; all three responsive chapter browser tests. Static validation checks 34 scripts and 23 HTML pages. The first chapter test run exposed an over-strict identity-matrix assertion and a native smooth-focus delay; both were corrected and the three-case suite passed.

Final September 30 review: all 16 direct audits passed for index, shop, product, cart, checkout, login, contact, and videos at 1440px and 390px. Across those audits there were zero axe WCAG 2 A/AA or WCAG 2.1 AA violations, horizontal-overflow failures, or runtime errors. Cart was audited separately at both widths. The final hero and unfolding-story screenshots were visually reviewed at both widths: `artifacts/culture/motion-hero-{1440,390}.png` and `artifacts/culture/motion-unravel-{1440,390}.png`.

September 29 validation (before the whole-page background and rounded-surface revision):

- Production bundle and static syntax, duplicate-ID and local-asset checks.
- All 25 existing unit tests.
- All seven focused browser tests in `tests/browser/culture.test.cjs`: selection and image failure, no JavaScript, reduced motion, WebGL/pause/context-loss behavior, deferred loading during preference changes, keyboard dialog focus, and layouts from 320px to 2560px.
- Desktop, mobile, and tablet screenshots inspected in `artifacts/culture/`. Initial additional screenshots of shop, story, and sign-in are in `artifacts/redesign/`.
- All 16 accessibility/overflow/runtime checks for home, shop, product, cart, checkout, contact, sign-in, and films at 1440px and 390px passed. Shared browser scenarios for catalog search/retry, checkout loading, account recovery, notification write failure, payment return safety, and unavailable products passed.

The initial broad browser run exceeded local resources when multiple Chromium suites ran concurrently; it was stopped and focused suites are run sequentially. `node scripts/verify-culture-storefront.cjs` runs the shared shopping/account regression suite with eight representative routes at desktop and mobile sizes. No live orders, payments, account emails, or newsletter messages are submitted during review.
