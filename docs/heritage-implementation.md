# ALKEBULAN interactive storefront redesign

Implemented on `lights-perspective` without replacing the static HTML/CSS/JavaScript application or changing its backend schema.

## Visual direction

The owner's subsequent streetwear direction supersedes the earlier quiet presentation. An oversized ROOTED / UNRULED typographic composition and the detailed terracotta sculpture open the homepage. An original cursor-reactive abstract print field runs behind the experience, followed by a tilted moving strip, a clay-and-paper garment stage, staggered collection artwork and an enlarged print detail. The real Ijele, Durbar and Dùn Dùn photography and admin-managed slideshow remain connected to their existing catalog destinations.

The shared navigation places the house signature between discovery links and account tools. The numbered mobile menu has bold typography, original abstract artwork, focus management and dismissal behavior. Shop, category, saved and related-product grids use varied scale and cut-corner print surfaces. Product pages use a large gallery, a sticky desktop image stage, bold titles, options and purchase actions before the detailed description. Cart, checkout, sign-in, account, story, contact, film and support pages share the ink, bone, clay and ochre palette, uppercase Poppins and compact rounded controls. Existing routes, selectors, data and form handlers are retained.

Poppins is used for display, Manrope for interface/body text and Instrument Serif for editorial and commerce headings. A pre-existing circular font-token reference was removed and local fonts now swap in reliably. Purple is not part of the UI palette.

The owner's supplied reference images informed weight, composition and linework. `expression-study.svg`, `clay-maze.svg` and `heritage-lines.svg` are original decorative artwork, not transcriptions of historical writing. Black Balance's pointer-reactive line field informed the interaction concept; the ALKEBULAN contour implementation is original, local, and settles when the pointer stops.

There was no `design-references/` directory in the checkout. All twelve useful images supplied directly from Downloads were inspected, including the extensionless reference. No Pinterest image is used as a production asset. The three known house photos use their existing hand-traced CSS silhouettes; remote catalog photography retains its own framing and original-resolution viewer.

`streetwear.css` supplies the final visual direction across the customer routes, over the shared layout in `atelier.css` and product presentation in `editorial-commerce.css`. `house-photography.css` contains only known photographic silhouettes. `culture-field.js` draws original moving abstract marks with damped pointer repulsion; the homepage background and ticker have a pause control and respect reduced motion. `atelier.js` owns the contextual cursor and scroll response. The cursor appears over visual shopping targets, yields to form controls and keyboard use, and disappears for touch/reduced motion. Scroll influences the sculpture through a damped, bounded rotation; the page never locks visitors into a pinned sequence.

## Blender production and runtime

- Editable source: `source-assets/heritage/alkebulan-terracotta.blend`.
- Reproducible production: `scripts/blender/create_heritage_scene.py`, followed by `scripts/blender/detail_heritage_scene.py` for the detailed finish.
- Optimized Draco GLB: `Frontend/assets/heritage/terracotta-study.glb`.
- Static alpha poster: `Frontend/assets/heritage/terracotta-study.webp`.
- Portable clay grain: embedded in the GLB, with its PNG source retained.
- Production provenance and rebuild command: [source notes](../source-assets/heritage/README.md).

The sculpture is an original contemporary study informed specifically by Nok eye forms, not an archaeological artifact or a blend of Nok and Ife presented as authentic. The story page links its source, the Nigerian National Commission for Museums and Monuments. No oldest-name claims, translations, dates or symbolic meanings are invented.

The browser renders the actual exported mesh through Three.js. It recreates a warm key/fill/rim rig, uses surface normals and the grain normal texture, casts a moving shadow onto a transparent shadow receiver, and turns the sculpture through a controlled arc. A small pointer offset adds depth. Clay remains opaque; the background and caption layers supply transparency. This is live interactive geometry, not a video or CSS photo rotation.

The renderer is bundled locally with pinned dependencies and Draco decoder files. It loads only near its section. Shopping markup and the poster are available first. Automatic rendering stops when paused, outside the viewport or in a hidden tab. Reduced motion, data-saving connections, missing observers, unavailable WebGL, failed downloads and context loss retain the still composition. Sustained slow rendering first reduces pixel density, then falls back to the poster.

```sh
npm ci
npm run build:heritage
npm run dev
```

The generated renderer is stored as a static asset; deployment does not require a framework build. Rebuild it whenever `scripts/heritage-renderer.mjs` changes. The shipped poster was generated with `node scripts/render-heritage-poster.cjs` from the Blender export; the slower Cycles alternative remains available in the production scripts.

## Data preservation and cleanup

Unrelated bundled starter merchandise has been retired. Offline/unconfigured catalogs are honestly empty; unavailable live catalogs remain unavailable. Editorial tee images are not fabricated inventory. Empty starter imports perform no writes. Production product records were not edited or deleted.

Collection defaults use branded photographs. Only a complete untouched historical version-one stock-image seed is replaced in the presentation/cache path. Authored documents, later revisions, image positions, product links and revision checks are preserved. Existing public catalog/content events and image error recovery remain intact.

The pointer layout read for the garment stage is scheduled once per animation frame. Two initialization debug logs were removed; useful error reporting remains. No auth, cart totals, inventory, payment, role or storefront publishing contracts were rewritten.

## Verification

Use `npm run check`, `npm test` and `npm run test:browser`. The browser tests use fixture data and mocked services, never live purchases or customer messages. `node scripts/review-heritage.cjs` writes screenshots and actual browser font measurements to `artifacts/heritage/` at 360, 390, 768, 1120 and 1440 pixels, with a separate live scene view. `node scripts/review-redesign.cjs` captures customer pages at 390 and 1440 pixels, including populated cart/checkout fixtures. These screenshots contain test prices, not published catalog data.

Run browser reviews sequentially on low-memory machines. Desktop Chrome and emulated mobile viewports do not establish performance on physical Android hardware. Live payment-provider and production-backend operations are outside the fixture checks.
