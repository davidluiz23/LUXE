# ALKEBULAN storefront redesign

Updated to follow the user's supplied homepage screenshot and the three original product photographs.

The homepage uses one rounded sage hero with Ijele and “Wear the story.”, followed by three artwork cards in Ijele / Durbar / Dùn Dùn order, a Durbar close-up, and the full shared footer with collection, account, support, and legal links. Its navigation pairs the logo with ALKEBULAN on the homepage only, alongside search, bag, notifications, and profile controls. The notification link takes guests through sign-in to their notifications. At widths up to 1120px, the shared navigation uses the keyboard-accessible drawer; wider screens show the navigation links. Homepage presentation lives in `Frontend/css/home.css`; the shared shop, account, and checkout presentation remains in `Frontend/css/storefront.css`.

The hero cycles through the three shirts every five seconds with a sliding crossfade, restrained pointer tilt, and bounded scroll shift. A slide counter, keyboard-accessible selectors, and Play/Pause control keep image, label, destination, and any verified price together. Playback pauses for hover, keyboard interaction, a hidden tab, or an offscreen hero. Reduced motion starts with autoplay paused and disables decorative movement; visitors can explicitly play the slideshow with instant transitions. No animation library was added.

The original JPEG files remain intact in `Frontend/assets/products/`. CSS silhouettes and shadows place those photographs on the hero and card surfaces; the feature panel crops the real Durbar photograph. The artwork and fabric perspective come from the supplied flat photographs, so they are not exact replicas of the reference's angled garment rendering. No generated artwork, inferred garment views, or new fabric/stock claims are used.

## Catalog and integrations

The public live catalog contained 88 products when checked on September 9, 2026. None were verified as the supplied Durbar, Ijele, or Dùn Dùn tees. They therefore appear as editorial artwork previews linking to the real shop, with no invented price or catalog ID. A unique ALKEBULAN catalog name matching the artwork can supply its product destination and existing currency formatting. Ambiguous names and other brands remain previews.

Existing product IDs, catalog data, variants, cart persistence, inventory, totals, authentication, verification, payment handling, newsletter integration, and Supabase configuration remain in their original modules. Shipping/returns/support links and account routes remain available. Production orders, payments, signup emails, and newsletter submissions were not sent during review; commerce behavior is exercised with the project's mocked browser fixture.

## Local review

The three homepage artwork previews are static and stay visible while the catalog loads or is unavailable. `home-stage.js` binds a hero, card, or detail link to a product only when its ALKEBULAN name matches uniquely. Other cases link to the real shop without invented prices or IDs. The main shopping icons use the existing local SVG system so their visibility does not depend on a font CDN.

From this directory, run `npm run dev` and open <http://127.0.0.1:4173>. This is a static application, so there is no compilation step. `PORT` can override the preview port.

Checks: `npm run check`, `npm test`, and `npm run test:browser`. Browser test files run sequentially to avoid competing Chromium instances on limited hardware. They include desktop/mobile accessibility, existing commerce/account flows, artwork selection, catalog matching and failure recovery, keyboard controls, and reduced motion. The signup test now waits for its existing authentication API to initialize before substituting the mock.

The obsolete `dist/review` screenshot folder has been moved out of the project into a system temporary backup. Development and GitHub Pages both serve `Frontend` directly; no `dist` output is needed. New review screenshots are written to the system temporary directory. The supplied tees still require actual catalog entries and prices before they can be purchased as those products.

## Navigation and collection update — September 13, 2026

- The search control uses a single local SVG with centered, responsive sizing. The floating navigation has a translucent background and a subtle 8px blur. The old scrolling progress line is removed.
- Hamburger navigation opens a centered dialog with the same dimmed, blurred backdrop and entrance animation as search, on desktop and mobile. The dialog sits outside the floating header, traps keyboard focus, restores focus when closed, and preserves the page's scroll position.
- The homepage back-to-top button works before catalog requests resolve and respects reduced motion. The existing homepage collection presentation and five-second shirt slideshow are preserved.
- Shop, Men, Women, Wishlist, and related products use compact rounded gray cards with inset images, category pills, real ratings, prices, and persistent shopping actions. Product cards show the ALKEBULAN mark, wordmark, and animated track while catalog data or primary images load; image success and failure both clear the loader. Reduced motion uses a static lockup.
- Conflicting card overrides and the unused generic skeleton animation were removed. Sort/filter chevrons render without the icon font. Shared assets use version `20260913-1` across all 23 pages.
- Validation: static checks and all 13 unit tests pass. Focused browser checks cover the five collection routes, slow catalog/image requests, image failure, add-to-cart, keyboard navigation, scroll preservation, homepage back-to-top, utilities through 2560px, and five-second slideshow behavior. Mobile shop and open-menu accessibility audits report no violations. Desktop/mobile card, menu, and branded loader screenshots were inspected using the local fixture; review images remain in the system temporary directory.

## Homepage update validation — September 12, 2026

- Static checks cover 28 scripts and 23 pages; all 13 unit tests pass.
- Homepage browser checks verify five-second rotation and wrapping, manual selection, pause/resume, reduced motion, catalog matching, account destinations, and navigation from 320px through 2560px. The final small-phone layout and tablet slideshow bounds were also checked visually and in the browser.
- Password sign-in and the Google callback return notification visitors to their notifications. Browser checks confirm the destination allowlist still rejects unrelated and external redirects.
- All 30 selected shared browser checks pass: eight pages at desktop and mobile widths, plus search, account, menu, checkout, admin, and payment flows. The page sweep covers home, shop, about, login, cart, checkout, dashboard, and videos.
- Desktop and mobile homepage accessibility audits report no violations. Screenshots were inspected for the restored footer, navigation controls, and shirt presentation.
- Shared asset versions were updated across all 23 pages so returning visitors receive the navigation fixes.

## Earlier reference update validation

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
