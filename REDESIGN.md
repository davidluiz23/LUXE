# ALKEBULAN storefront redesign

Updated to follow the user's supplied homepage screenshot and the three original product photographs.

The homepage now uses one rounded sage hero with Ijele and “Wear the story.”, followed by three generously padded artwork cards in Ijele / Durbar / Dùn Dùn order, a compact Durbar close-up, and a minimal wordmark footer. The header shows Shop, Our story, Search, and Bag. Small screens use the existing accessible navigation drawer. Homepage presentation lives in `Frontend/css/home.css`; the shared shop, account, and checkout presentation remains in `Frontend/css/storefront.css`.

The hero uses **photo-based depth**, with a single settle, a restrained pointer tilt, and a bounded scroll shift. It is not a 3D model or a 360-degree viewer. Selection is deliberate, keyboard accessible, and keeps image, label, destination, and any verified price together. Reduced motion disables decorative movement; touch does not depend on hovering. No animation library was added.

The original JPEG files remain intact in `Frontend/assets/products/`. CSS silhouettes and shadows place those photographs on the hero and card surfaces; the feature panel crops the real Durbar photograph. The artwork and fabric perspective come from the supplied flat photographs, so they are not exact replicas of the reference's angled garment rendering. No generated artwork, inferred garment views, or new fabric/stock claims are used.

## Catalog and integrations

The public live catalog contained 88 products when checked on September 9, 2026. None were verified as the supplied Durbar, Ijele, or Dùn Dùn tees. They therefore appear as editorial artwork previews linking to the real shop, with no invented price or catalog ID. A unique ALKEBULAN catalog name matching the artwork can supply its product destination and existing currency formatting. Ambiguous names and other brands remain previews.

Existing product IDs, catalog data, variants, cart persistence, inventory, totals, authentication, verification, payment handling, newsletter integration, and Supabase configuration remain in their original modules. Shipping/returns/support links and account routes remain available. Production orders, payments, signup emails, and newsletter submissions were not sent during review; commerce behavior is exercised with the project's mocked browser fixture.

## Local review

The three homepage artwork previews are static and stay visible while the catalog loads or is unavailable. `home-stage.js` binds a hero, card, or detail link to a product only when its ALKEBULAN name matches uniquely. Other cases link to the real shop without invented prices or IDs. The main shopping icons use the existing local SVG system so their visibility does not depend on a font CDN.

From this directory, run `npm run dev` and open <http://127.0.0.1:4173>. This is a static application, so there is no compilation step. `PORT` can override the preview port.

Checks: `npm run check`, `npm test`, and `npm run test:browser`. Browser test files run sequentially to avoid competing Chromium instances on limited hardware. They include desktop/mobile accessibility, existing commerce/account flows, artwork selection, catalog matching and failure recovery, keyboard controls, and reduced motion. The signup test now waits for its existing authentication API to initialize before substituting the mock.

Current reference-layout captures are `dist/review/home-reference-1122.png`, `home-reference-390.png`, and `home-reference-768.png` (ignored by Git). They display the supplied artwork with fixture-backed catalog fallback links. The supplied tees still require actual catalog entries and prices before they can be purchased as those products.

## Reference update validation

- Static syntax, duplicate-ID, local-reference and diff checks pass; all 13 unit tests pass.
- All eight focused homepage browser cases verified, including unique catalog matching, fallback links, three usable previews offline, image switching, keyboard selection, reduced motion, responsive cards, and compact-header search/navigation behavior.
- Homepage accessibility checks pass at 1440px and 390px. Header interactions cover 390px, 760px, 761px, and 1440px.
- Desktop and mobile screenshots inspected, with adjustments to button contrast, the tablet navigation breakpoint, image silhouettes, and feature cropping.

## Earlier storefront validation

- Static validation: 28 frontend scripts and 22 HTML pages pass syntax, duplicate-ID, and local-reference checks; `git diff --check` passes.
- All 13 existing unit tests pass.
- The full browser sweep covered 22 pages at 1440px and 390px, including admin, plus 13 existing shopping/account/admin scenarios. It surfaced seven individual failures (three artwork cases and four mobile header contrast cases). These were fixed, and all six artwork tests plus all eight page/width checks for the four affected routes then passed in targeted reruns. The full sweep was not repeated after those targeted reruns.
- Additional screenshot inspection covers 360px, 390px, 768px, and 1440px, with no horizontal homepage overflow. Shared product, bag, checkout, and shop screenshots were inspected and layout issues corrected.
- Manual fixture shopping check: size/color selection, add to bag, quantity changes, recalculated totals, persistence after reload, removal, and checkout required-field validation passed.
- A live homepage load returned the existing 88-product catalog without page errors. No production purchase or outbound account/newsletter message was submitted.
