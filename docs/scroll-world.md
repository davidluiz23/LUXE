# ALKEBULAN — The living gallery

## Direction and scope

Travel through one warm stone gallery, from ALKEBULAN's original clay portrait to the real artwork-bearing clothing, then leave with the collection in view. Native document scroll conducts the camera and light. Pointer, touch and keyboard control local inspection and artwork selection.

This replaces the homepage's overlapping presentation layers. The existing store, account, content management, catalog matching and checkout remain the destination. The previous proposed light storefront brief is superseded for this homepage by the user's continuous-world direction.

Visual thesis: fired clay against quiet, monumental stone; expressive typography occupies the gallery's negative space. The sculpture is grounded on a plinth. Product photographs are mounted on physical exhibition panels. No simulated garment backs, invented heritage claims, particle filler or drawn background symbols.

## Visual constants

| Role | Constant |
| --- | --- |
| Units | 1 unit = 1 metre; normalized sculpture 4.6 m, exhibition scale |
| Palette | charcoal `#211e1a`, warm paper `#f0eadf`, secondary `#c2b7a7`, copper `#c9875e` |
| Typography | existing Manrope 400/600; existing Instrument Serif regular/italic for expressive words |
| Scale | desktop display 112/96/80 px; tablet 88/72/64; phone 64/56/48; reading copy 16 px |
| Spacing | 8/16/24/32/48/64/96 px; desktop gutter 64 px, mobile 24 px |
| Surface | open layouts, squared exhibition edges, 2 px control radius; no card grid |
| Lens | 35–43° desktop, explicit phone positions at 42–48°; zero roll |
| Motion | one GSAP intro, two word reveals, CSS control feedback 150–220 ms; camera damping 6.5/s |
| Input | pointer offsets ≤0.08 m; raking light exposes existing carved relief |

## Chapter and camera ledger

Full numerical camera, light and responsive endpoints live in `scripts/world/spec.mjs` and are consumed directly by the renderer.

| Chapter | Beat and composition | Change | DOM | Interaction |
| --- | --- | --- | --- | --- |
| heritage | Frontal portrait on a stone plinth, framed by receding portals | Arrival; whole silhouette | Rooted. Unruled. / shop | Small pointer light response |
| form | Three-quarter close study; face on the left, copy on the right | Approach and turn expose relief and crown | A language of form. | Raking-light toggle, identical DOM and raycast action |
| expression | Camera travels left to the mounted clothing photograph | Sculpture recedes; actual artwork becomes focal | Wear your origin. / named selector and verified product link | Choose any published artwork; immediate keyboard state |
| collection | Pull back to see sculpture, exhibition panel and architecture together | Departure makes the spatial relationship explicit | Culture lives on. / collection link | Direct store entry |

Endpoints use ordinary semantic sections, approximately one viewport each. There is no wheel trapping or snap. Camera travel is continuous and reversible; no landmark teleports. Exact progress owns navigation and interaction availability; a damped copy owns only camera and light interpolation.

```text
main
  scroll-world
    sticky viewport (one canvas, poster, chapter navigation)
      worldRoot
        environment: floor, back wall, three depth portals
        landmarks: fixed terracotta on stepped plinth
        exhibition: photograph, thick mount, supporting base
        lights: hemisphere, one shadow key, fill, rim
        interactions: simplified sculpture and exhibit proxies
    four semantic chapters and real controls
  shared footer and support links
```

## Surface / light / asset ledgers

| Asset / family | Provenance and material | Loading / fallback |
| --- | --- | --- |
| Terracotta | Existing original Blender GLB, 159,152 triangles, 1,789,312 bytes; opaque nonmetallic clay, vertex pigment, embedded linear normal; roughness ≥.78 | Deferred local Draco decode; exact-world poster before ready |
| Stone architecture | Original architectural geometry with bevels and thickness; roughness .92, nonmetallic; restrained shader mineral variation | In runtime bundle; no external assets |
| Garment exhibit | Existing user-provided Ijele, Durbar, Dùn Dùn photographs, unchanged; sRGB, tone mapping disabled for fidelity | First photo then adjacent choices; failed photos show labeled HTML fallback |
| Typeface | Existing local OFL Manrope / Instrument Serif files | Local preload; system / Georgia fallback |
| Poster | Exported from the actual new world, desktop and phone framing | Visible with no JS, reduced motion, save-data, WebGL / asset failure |
| Icons / mark | Existing original ALKEBULAN mark; Solar outline interface icons sourced through Iconify | Local SVG; source URL recorded in asset directory |
| Light | Warm key, restrained hemisphere fill, copper rim; one shadow map, no bloom | Light intensity and position share the scroll conductor |

Lenis is chosen over Locomotive because it preserves native document geometry and integrates directly with the GSAP ticker. Exactly one instance, no automatic RAF, no touch smoothing. GSAP ScrollTrigger owns the two text entrances. The renderer is a deferred module. Reduced motion uses the composed still and complete DOM, with no smooth scroll, WebGL or split-word animation.

## Interaction matrix

| Control | Availability | Feedback | Exit / fallback |
| --- | --- | --- | --- |
| Chapter anchors | All four chapters | current label + progress line, native focus | meaningful hash; ordinary links without JS |
| Raking light | Form chapter; raycast gated to exact progress .65–1.35 | aria-pressed, label and light direction | resets outside chapter; plain sculpture provenance link in static mode |
| Artwork selector | Expression chapter | named pressed button, synchronized photo / caption / link | last loaded image remains until next is ready; explicit unavailable message |
| Exhibit activation | Expression chapter only | same destination as visible HTML product link | no invented ID or price; unmatched / ambiguous catalog names go to shop |
| Motion mode | Entire gallery | user can choose still view at any point | no loss of ordered content; preference changes tear down world |

## Budget and validation contract

Mobile DPR 1.25; desktop 1.5, dropping to 1 after sustained slow frames. One shadow light. Target under 90 draw calls / 180k visible triangles, first transfer under 5 MB. No continuous ambient motion: render only while scroll/input/light settles, pause hidden/offscreen, dispose on teardown. Measurements and actual limitations are recorded in `artifacts/scroll-world/validation.json` after browser review.

Verify all four endpoints at 1440×900, 768×1024 and 390×844; forward/reverse jumps, reload at depth, resize, keyboard, artwork selection, menu/search, reduced motion, no JS, missing model and context loss. Browser screenshots are evidence, not build assertions. Real mobile GPU and touch hardware require separate device testing.

Skills used: build-awwwards-quality-sites, build-threejs-scroll-worlds, cinematic-gsap-lenis-motion-system, ui-design (Build, marketing direction), ui-animation. No separate threejs-* or ui-verification skill is installed. Read references: world-bible, realtime-architecture, quality-and-qa; aesthetic-direction, design-in-code, marketing-ui, design-guidelines; colors, typography, custom-fonts, heading-groups, landing-pages, buttons, headers, navigation, responsive-design, images, footers; animation decision-framework and scroll-animations. User authorization covers the reversible implementation and local review gates.

Implementation references: [Three.js](https://threejs.org/docs/), [Lenis GSAP integration](https://github.com/darkroomengineering/lenis), [ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/).
