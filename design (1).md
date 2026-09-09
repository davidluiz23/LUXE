# ALKEBULAN — Storefront design brief

Status: proposed creative direction, based on the supplied layout reference and three product photos. The existing website and codebase have not been audited for this document. The Google Flow palette is not confirmed.

## 1. Your assignment

Act as a fashion art director, interaction designer, and frontend engineer. Redesign the existing Alkebulan storefront into a distinctive, premium streetwear experience with clean spacing, rounded forms, confident typography, and a memorable sense of depth.

The owner likes minimal, spacious layouts and the polished, dimensional websites people share in short videos. Translate that ambition into specific composition and movement. Make the clothes, their artwork, and the brand recognizable within the opening screen. Keep browsing and buying straightforward.

When this brief is supplied inside the existing project, inspect the application and implement the redesign. Exercise creative judgment; the suggested composition below is a direction to develop, not a template to reproduce. Explain your chosen direction briefly, then continue working.

## 2. Read the references correctly

| Supplied reference | What it establishes |
| --- | --- |
| `Screenshot_20260908-195845.png` | A Figma ecommerce layout reference: light canvas, generous margins, rounded media, clear hierarchy, a muted green hero, pale neutral surfaces, and a mobile adaptation. Study its spacing and visual rhythm. |
| `IMG-20260831-WA0070.jpg` | Black tee with prominent Ijele artwork and warm lettering. Use the real image and verify the product name against the catalog. |
| `IMG-20260831-WA0069.jpg` | Black tee with Durbar lettering, a mounted figure, and warm gold/cream details. Use the real image and verify catalog naming. |
| `IMG-20260831-WA0071.jpg` | Black tee with Dùn Dùn lettering and drumming imagery. Preserve the lettering and diacritics exactly as supplied. Verify official naming. |

These are visual references, not proof of the current site's structure or product specifications. The photos are front views with opaque backgrounds. No garment mesh, back views, transparent cutouts, or cloth animations have been supplied.

Locate these images by filename or visual match in the project or conversation. Work with existing product assets if the attachments have not been copied into the repository. Do not invent file paths or claim to have inspected unavailable files.

If a separate Google Flow mockup is supplied, use its approved colors as palette guidance. Its layout has not been approved. The screenshot above is visibly a Figma UI-kit reference; do not assume it is the Flow output.

## 3. Creative direction: a contemporary collection on display

Build an editorial streetwear storefront in which the garments feel carefully exhibited. Let open space, scale, image placement, and precise transitions create the premium feeling.

Give Alkebulan three recognizable design decisions:

- A large typographic composition that interacts with the featured garment while keeping the print readable.
- A consistent product presentation with soft studio lighting, restrained shadows, and deliberate breathing room.
- A recurring way to connect each garment with its artwork and approved story, such as quiet captions, close crops, and short editorial passages.

Use the visual differences between the supplied products. Preserve their individual cultural references; build storytelling from brand-approved material. Avoid inventing cultural explanations, ceremonial meanings, origins, translations, or a founder narrative.

Make the first screen strong as a still image. Add motion once the composition works. Reserve the most theatrical treatment for one product moment, and keep the rest of the shopping experience calm.

## 4. Color, typography, and spacing

Keep the page predominantly light. The dark tees should create the main contrast. Use muted colors for selected surfaces and let the prints carry most of the saturated color.

The values below are a provisional starting palette interpreted from the visible reference. They are not sampled exact values, confirmed brand colors, or a reconstruction of the missing Flow palette. Refine them when the owner's palette reference is available.

| Role | Starting value | Application |
| --- | --- | --- |
| Canvas | `#FAFAF7` | Main page background |
| Soft surface | `#E5E8E6` | Product stages and quiet secondary areas |
| Ink | `#171917` | Headings, body text, primary actions |
| Secondary text | `#62675F` | Supporting information on light backgrounds |
| Muted sage | `#A9B497` | One prominent campaign surface or selected detail |
| Warm stone | `#C7B8A6` | Occasional editorial surface |

Use dark text on the pale accents. Keep warm gold, red, and yellow primarily inside the product artwork. Check actual text/background pairs for readability, including hover, focus, and disabled states.

Choose typography after inspecting the existing brand assets and available fonts. Use an expressive display face with a readable supporting face, or one family with a convincing range of weights. Preserve an existing approved logo. Allow large headlines to wrap intentionally; avoid distorted type and tiny supporting copy. Support the characters and diacritics used in product names.

Use these dimensions as starting points, then judge the rendered result:

| Element | Desktop direction | Mobile direction |
| --- | --- | --- |
| Content width and gutters | Approximately 1280–1440px maximum; 32–64px outer gutters | 16–24px gutters |
| Section spacing | Approximately 80–120px | Approximately 48–72px |
| Media corners | Approximately 20–32px | Approximately 16–24px |
| Heading scale | Large enough to anchor the composition without obscuring products | Recompose for the viewport; preserve readable line breaks |
| Body and controls | Comfortable reading sizes and clear hierarchy | Body/input text around 16px; controls at least 44px tall |

Use shared spacing and radius tokens. Mix open layouts with selected rounded media areas. Let some sections breathe without enclosing them in cards. Use gloss selectively on a small surface, button, or light reflection; preserve the natural appearance of the cotton and print.

## 5. The signature opening screen

Develop one strong hero around a real featured product. A promising composition is an oversized ALKEBULAN wordmark, an isolated tee floating above a soft shadow, a small amount of campaign copy, and a clearly visible shopping action. The model may improve this composition while retaining its clarity and garment focus.

Keep the product artwork unobstructed. Any decorative duplicate wordmark should not create repeated screen-reader content. Use the actual brand logo or approved wordmark treatment where available.

The garment should appear immediately in a stable frame. Let it settle gently into position, respond slightly to a pointer where available, and change depth subtly as the page scrolls. The header and shopping action must remain usable throughout.

If featuring all three tees, use an explicit product selector with real names and visible selected state. Update the image, name, destination, and any displayed price together. Changing the featured tee should be a deliberate interaction, not a timer that interrupts reading.

Use concise, brand-specific copy from the project where possible. An optional draft headline is “Wear the story.” Treat it as proposed copy, not an established brand slogan. Use real collection names, prices, availability, and destinations.

On mobile, compose this hero again: readable brand and navigation, a large product, brief copy, and a visible shopping action within roughly the opening screen when space permits. Accommodate browser chrome, larger text, and short screens without clipping content. Keep the shop reachable with a normal scroll.

## 6. Page rhythm and storefront coverage

Use a concise sequence with clear changes in scale:

1. **Featured garment:** the signature product stage and primary shopping action.
2. **The collection:** the real catalog in a clean, useful grid. Show actual available products; let a small collection remain small. Keep names and prices outside the artwork.
3. **A closer look:** one editorial composition using an authentic detail crop and approved information about that piece. Match the image resolution to the crop. Link directly to its product page.
4. **Brand or collection story:** a short passage supported by available brand content or genuine campaign photography. Omit this module if meaningful content is unavailable.
5. **Service and footer:** concise existing shipping, sizing, returns, support, account, and social links. Include newsletter signup only if a functioning integration exists.

Choose the exact arrangement and asymmetry yourself. Keep the store's current important navigation and content reachable as the layout changes.

Carry the same design language through the existing customer-facing routes:

| Surface | Required result |
| --- | --- |
| Header, menus, search, footer | Consistent hierarchy, useful navigation, accessible drawers, visible account and bag actions |
| Collection and search | Readable product information; functional filters/sorting when present; useful empty and loading states |
| Product detail | Large faithful media, clear price and availability, usable variant/size selection, size guide when available, and an obvious add-to-bag action |
| Bag and checkout | Clear line items, quantities, totals, validation, and loading/error feedback; preserve existing checkout behavior |
| Authentication and account | The same typography, spacing, and controls; preserve verification, sessions, forms, order history, and navigation |

Keep third-party hosted checkout within its supported customization options. Keep admin functionality outside this visual redesign unless separately requested. Audit shared styles so storefront changes do not accidentally alter admin screens.

## 7. Motion direction

Use motion to explain depth, selection, and feedback. Prefer smooth acceleration and controlled settling. These timings are creative starting points, not rigid requirements.

| Moment | Suggested behavior | Simplified behavior |
| --- | --- | --- |
| Hero entrance | One 700–1000ms settle, with a small change in position or angle | Stable image immediately |
| Pointer movement | About 2–4 degrees of gentle tilt and a few pixels of movement on the featured garment | No pointer dependence on touch devices |
| First scroll | A short, subtle depth shift while the hero leaves the viewport naturally | Static product stage |
| Featured-product selection | A controlled 300–450ms transition; matching text and action update together | Immediate change or brief fade |
| Product grid and controls | Restrained reveals and 150–250ms feedback; shopping controls stay visible | Immediate, clear state changes |

Honor `prefers-reduced-motion` across CSS, JavaScript, video, and any 3D renderer. Disable decorative tilt and scroll movement when requested. Keep focus feedback and functional state changes clear. Technical reference: [MDN reduced-motion guidance](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion).

Keep native scrolling, a normal cursor, and touch scrolling. Avoid mandatory intro sequences, scroll hijacking, cursor followers, bouncing text, particles, and simultaneous moving backgrounds. Do not require a drag, hover, or animation to reveal a price or shopping action. Any continuing decorative animation needs an accessible pause control.

## 8. Choose a realistic depth approach

Use the best approach supported by the available assets. Start with the first option unless an approved 3D asset or render already exists.

| Approach | Assets needed | Appropriate result |
| --- | --- | --- |
| **Photo-based depth — recommended first version** | The supplied product photo; ideally a carefully verified transparent cutout | Layered shadows, a small perspective tilt, and subtle movement. This is a 2D image staged in depth. |
| **Rendered garment animation** | An accurate garment scene and a short exported clip with a matching poster | A controlled lighting or garment reveal. This provides a fixed camera sequence. |
| **Interactive 3D garment** | An approved mesh, accurate print textures, necessary garment views, and a web-ready export | Real viewpoint changes, lighting, and optional controlled rotation in a renderer compatible with the existing application. |

CSS perspective provides the transform basis for the first approach: [MDN perspective reference](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/transform-function/perspective). My recommendation is to start here because the supplied assets are photographs.

Keep original photos intact. If image tools are available, create separate cutouts and inspect collars, sleeves, dark edges, lettering, and print details against the originals. Never regenerate the product artwork or present an altered print as the real product. If a clean cutout is unavailable, art-direct the original photograph within a deliberate media surface and continue the implementation.

A rotating photo plane does not reveal the garment's unseen sides or back. Do not label it a 360-degree product viewer. Avoid approximating a full garment from a single view and presenting it as an accurate product model.

Blender is an optional asset-production tool for the latter approaches. Its glTF exporter supports a web asset workflow; see the [official Blender glTF exporter](https://github.com/KhronosGroup/glTF-Blender-IO) and [Khronos glTF overview](https://www.khronos.org/gltf/). A `.blend` scene requires an appropriate export or render for delivery on the website.

If true 3D is warranted later, define the needed mesh, accurate artwork textures, garment proportions/views, static poster, and optimized glTF/GLB deliverable. Verify any animation after export in the target renderer. Keep simulation work in asset production unless there is a justified runtime need. Until the asset is available, complete the photo-based design.

## 9. Engineering and performance

Inspect the current framework, routes, components, styles, assets, dependencies, and project instructions before changing code. Reuse the established stack and any suitable motion tools already installed. Use CSS for simple effects. Add a rendering or animation dependency only when a specific approved interaction requires it, and explain the choice.

Preserve the application contracts: routes, catalog IDs, product data, variant handling, inventory, currency, cart persistence, calculations, authentication, verification, checkout, APIs, database integration, and environment configuration. Keep existing event handlers and data sources connected as components are redesigned. Any necessary logic change should be small, isolated, and explained.

Keep product names, descriptions, availability, prices, and links in normal document content. Render a visible hero image before optional animation or 3D initializes. Define media dimensions to prevent jumps. Use responsive image sizes, load the primary image promptly, and defer below-the-fold media and optional renderers.

As a proposed starting budget, aim for a hero image around 500 KB or less where print quality allows. Measure actual transfer sizes and visual quality. Treat optional 3D/video as a separate deferred cost; it should not delay browsing. Pause rendering offscreen and in hidden tabs. Provide a useful static fallback for unavailable assets, renderer errors, reduced motion, and limited devices.

Recompose grids and typography for phones, including ordinary Android hardware. Keep controls reachable without hover, dialogs keyboard-operable, focus visible, images meaningfully described, and drawers dismissible with focus restored. Handle empty, loading, unavailable, and error states as designed parts of the store.

## 10. Keep the result specific to Alkebulan

Evaluate every decorative element against the products and brand. Use the actual prints, garment silhouettes, typography, and editorial rhythm to establish identity.

Remove filler modules that exist only to make the homepage longer. Avoid generic gradient blobs, unrelated metallic objects, repeated bento cards, and interchangeable luxury slogans. Do not import the reference's shoe categories, colorful filters, testimonials, or blog sections unless the actual business has those features and content.

Keep claims grounded in the catalog and approved copy. Do not fabricate reviews, scarcity, countdowns, stock levels, discounts, shipping promises, fabric specifications, cultural stories, or campaign photography. Use current product photography confidently when lifestyle imagery is unavailable.

## 11. Workflow and definition of done

1. Audit the existing app and the supplied assets. Summarize what is present, the proposed visual direction, and any asset limitation in a short note. Continue with reasonable reversible design choices.
2. Establish the tokens and build the opening screen in desktop and mobile compositions. Resolve the static design before polishing movement.
3. Complete the collection and product experience, then apply the shared language to the remaining customer-facing surfaces in scope.
4. Connect and check the existing controls and states. Add the selected motion approach and its fallbacks.
5. Run the project's relevant existing checks. Inspect actual rendered pages around 390px and 1440px wide; check overflow and hierarchy at 360px and tablet width. Inspect reduced motion and keyboard navigation. If browser verification is unavailable, state that limitation.
6. Exercise the existing shopping and authentication flows using available test or sandbox setup, including variant selection, bag quantity/removal, totals, persistence, and validation. Preserve unrelated work. Inspect shared-style effects on excluded routes.
7. Review screenshots for legibility, print fidelity, composition, and consistency. Fix concrete issues. Report what changed, what was checked, remaining limitations, and any optional asset still needed.

The result is ready for review when:

- The first screen clearly communicates Alkebulan and its clothing, with a visible shopping action.
- The page has a distinctive composition even with motion disabled.
- Product artwork is faithful and readable; supplied prints have not been silently altered.
- The layout retains breathing room and deliberate rounded forms on desktop and mobile.
- One memorable motion moment gives the page depth without delaying shopping.
- Existing customer flows remain functional and consistent throughout the redesign.
- The delivered result accurately states whether it uses photo-based depth, a rendered clip, or true interactive 3D.

Finish with a working, reviewable implementation and concise validation notes. Where a requested asset is missing, deliver the available fallback and identify the specific asset that would improve it.

## Copyable handoff

Read `design.md` and inspect this project and the attached Alkebulan references. Use the brief to redesign and implement the existing storefront. Make an original composition around the real garments, retain the clean spacing and rounded forms, and add the signature depth interaction described in the brief. Preserve the application's working logic and integrations. Use the photo-based approach unless an accurate 3D asset is available. Briefly explain your creative direction, then complete the implementation and check the desktop and mobile result.
