# African Modern implementation

The active design is the user's fifth clean African streetwear concept. `npm run build` and `npm run build:home` now assemble `scripts/african-modern/` and bundle its motion locally. Serve with `npm run dev` and open `http://127.0.0.1:4173/`.

## What changed

- The homepage combines Instrument Serif and Manrope with ivory, ink, and clay. Three fictional campaign poses sit in front of an independently animated portrait. The user's follow-up replaces the glossy red rendering with thinner matte clay ink and the condensed brand wordmark with tracked Manrope 600. A pixel-derived mask still draws the artwork on every refresh.
- Hero height and campaign layers adapt to the available viewport, keeping the shop action and pose controls visible without scrolling at short desktop sizes such as 1005×585 and phones down to 320×568. Mobile pose controls sit below the headline, clear of the garment artwork.
- Manual pose controls, explicit play/pause, image decoding before transitions, keyboard navigation, focus/hover suspension, offscreen/hidden pause, reduced motion, and no-JavaScript content are supported. GSAP controls the animation. Lenis is the only smooth-scroll engine; touch scrolling stays native. Three.js and Blender were unnecessary for this treatment.
- The three supplied garment photographs have their own collection cards and an interactive artwork study. Existing admin content publishing still controls that study. The campaign's model poses remain separate from merchandise data.
- Every public page uses the same header, footer, fonts, forms, and controls. Admin has its own matching cream and ink utility theme while retaining data tables, authorization, and editor functions.
- Public catalog helpers allow only the intended ALKEBULAN tees. Live inventory was not fabricated. Read `collection-scope.md` for the real catalog audit and the unapplied database proposal.

## Source and asset provenance

The UI used the installed **build-awwwards-quality-sites**, **ui-design**, **cinematic-gsap-lenis-motion-system**, **ui-animation**, and **imagegen** skills. The chosen design image is `output/imagegen/clean-african-streetwear-v3/05-african-modern.png`.

Original tee photos remain in `Frontend/assets/products`. The built-in image generator produced three isolated campaign poses and the red portrait. Original PNGs are saved in `output/imagegen/african-modern-production`; exact prompts are in `scripts/african-modern/asset-prompts.json`. WebP assets in `Frontend/assets/african-modern` total about 1.4 MB across all desktop/mobile variants; the initial pose is approximately 252 KB on desktop or 117 KB on mobile. Alternate poses load on demand. Local font, Solar icon, GSAP, and Lenis license files remain alongside their assets.

`prepare-assets.cjs` mechanically encodes responsive WebP and traces the portrait's actual pixels to create its reveal mask. It does not invent replacement artwork or modify the original product graphics.

## Cleanup

Inactive generated `Frontend/js/culture`, `Frontend/js/living-canvas`, and `Frontend/js/world` bundles and six obsolete concept-specific browser tests were moved out of the workspace. Recovery copies are under `C:/Users/OWNER/.codex/backups/alkebulan-modern-20261002`, retaining their relative paths. Legacy authoring commands/sources are retained where they can regenerate those experiments. The new campaign tests cover the current visual, motion, and accessibility requirements; commerce and admin regression tests remain active.

## Verification

The production build and syntax/local-link checks pass across all 23 HTML pages and 30 classic scripts. All 35 unit tests pass. Browser checks exercise the campaign, responsive views from 320 to 1920 pixels, reduced motion, reload drawing, failed images, menu/search focus, catalog exclusion, admin publishing, saved items, checkout, authentication, and payment recovery. Captures and reports are saved in `artifacts/african-modern`.

The viewport/font/ink refinement also passes the six campaign browser tests and a ten-viewport regression covering 1005×585, 1366×650, 320×568, and phone landscapes. Assertions verify that the hero and shopping controls fit the first viewport and the shop action is unobscured. Updated visual captures are in `artifacts/african-modern/refinement`.

No production deployment, live database policy update, product import, price/stock change, or external message was performed. The next merchandising input is real prices, stock, and variants for the three tees.
