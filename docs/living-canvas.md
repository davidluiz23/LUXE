# Living Canvas — selected direction 05

The owner selected the fifth image concept on October 1: a warm cream page, the supplied orange contour artwork, a centered arched garment display, oversized condensed “CULTURE” and italic “in motion.”, floating cream navigation, and generous rounded collection surfaces. This pass implements that selection; further cultural art direction is a later owner-led refinement.

Composition: navigation → centered garment and explicit artwork selector → three original garment photographs in a cream collection island → an editorial Durbar detail and house story → category links → full existing support footer. No prices or inventory are invented. Existing published slide configuration and unique catalog matching still determine garment links.

Motion: the installed GSAP/ScrollTrigger and Lenis, with native touch scrolling, a small hero entrance, bounded product depth, and quiet section reveals. Lenis is the only smoothing engine. The existing lazy Three.js shader animates the actual supplied orange image; this homepage uses a fill crop that matches its static fallback. Reduced motion shows the complete static layout immediately. A visible pause control, hidden-tab pausing, context-loss fallback, and cleanup remain.

Assets: unchanged `Frontend/assets/products/{ijele,durbar,dun-dun}.jpg`; unchanged `Frontend/assets/references/orange-liquid.jpg` (see that directory’s SOURCES.md); existing local Solar icons, brand mark, Barlow Condensed, Instrument Serif and Manrope. The known garment silhouettes use the existing photograph-specific CSS outlines; uploaded custom photos retain a complete rectangular image. No generated mockup is used as production content.

Source: `scripts/culture/home.html`, `scripts/culture/experience.mjs`, `scripts/culture/chapters.mjs`, `scripts/culture/liquid.mjs`, and homepage-only `Frontend/css/living-canvas.css`. Run `npm run build:home` for the selected homepage without reassembling unrelated pages. `npm run build` also includes the selected direction in a complete public-site assembly. Previous source snapshots for the edited homepage are in ignored `artifacts/living-canvas/before/`.

Skills: ui-design (Build), build-awwwards-quality-sites, cinematic-gsap-lenis-motion-system. UI guidance read: aesthetic-direction, design-in-code, design-guidelines, colors, typography, custom-fonts, headers, heading-groups, landing-pages, buttons, images, responsive-design, and footers.

## Verification

`npm run build:home` and `npm run check` pass (34 scripts and 23 HTML pages). All 30 unit tests pass. The 17 targeted browser cases in culture, chapter-resize and admin-storefront pass across the initial run and focused reruns. The reruns resolved an 851px headline overlap, outdated test selectors, an absolute-image-URL assertion, and initial published-slide ordering. A visitor's explicit artwork selection is preserved on subsequent content refreshes.

Final rendered review: desktop 1440px and mobile 390px report zero axe WCAG 2 A/AA and WCAG 2.1 AA violations; 1440, 390, 768 and 320px report no horizontal overflow, broken images, or runtime errors. Responsive tests also cover 600, 601, 850, 851, 1000, 1200 and 2560px. Motion checks cover pause, WebGL context loss, reduced-motion changes during deferred loading, separate selection/depth transforms, keyboard dialogs, and native-flow short landscape. Original assets and no-JavaScript content remain visible. Publishing, one-slide content, custom image and catalog destinations are exercised with the existing isolated fixtures; no live purchases or account messages were sent.

Screenshots and the measured report: `artifacts/living-canvas/hero-{1440,390}.png`, `home-{1440,390,768,320}.png`, `hero-motion-1440.png`, and `review.json`. Preview: http://127.0.0.1:4173/.
