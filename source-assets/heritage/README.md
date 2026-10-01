# Terracotta study: production notes

This is an original contemporary digital sculpture made for ALKEBULAN. It is informed by the triangular eye contours, perforated pupils, and elaborate modeled hairstyles found in Nok terracottas. It is not an archaeological artifact, scan, reconstruction, or claim of historical authenticity. The sculpture and its relief marks were built from original geometry; no third-party model, image, texture, or historic symbol was copied.

Reference: the Metropolitan Museum of Art, [Nok Terracottas](https://www.metmuseum.org/essays/nok-terracottas-500-b-c-200-a-d), Department of the Arts of Africa, Oceania, and the Americas. This source describes those formal traits and distinguishes Nok from later portrait traditions. No dates, translations, or symbolic meanings are asserted by the artwork.

## Rebuild

From the repository root, using Blender 5.2:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --threads 2 --python 'scripts/blender/create_heritage_scene.py' -- --skip-render
npm run build:heritage
node scripts/render-heritage-poster.cjs
```

The shipped detailed revision also runs `scripts/blender/detail_heritage_scene.py` in Blender background mode before the JavaScript build and poster export. It refines the preserved `alkebulan-terracotta-clean.blend` with physical temple and brow scoring, irregular grain, clustered pores and fired-clay pigment variation. Re-running it starts from that clean source and does not compound the displacement. To regenerate from scratch, regenerate the base scene and replace the clean source with that base before applying the detail pass.

`scripts/blender/create_heritage_scene.py` creates the original mesh, carves actual cavities, adds relief, assigns the clay material and portable grain map, authors a bounded turntable animation, saves `alkebulan-terracotta.blend`, and exports the GLB. The source remains editable in Blender and includes the camera, three area lights, and a ground shadow catcher. The web asset contains only the sculpture and animated turntable.

The shipped 800 × 960 transparent poster is generated from the actual exported GLB with the storefront's Three.js camera and lighting. Its WebP is approximately 47 KB. The poster exporter uses a local, isolated browser fixture and writes no commerce data. It requires the locally installed Chrome or Edge executable (or `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`).

Cycles rendering was too slow on the development machine, so the final poster uses the browser renderer for a faithful match to the live scene. To render a Cycles alternative, omit `--skip-render`, or use `scripts/blender/render_heritage_poster.py` with the existing source. `finish_heritage_scene.py` records the original pigment and crown refinement; a clean build now incorporates these changes, so do not apply the refinement script again to the finished source.

## Rendering contract

- Export orientation: glTF Y up, face towards +Z, base at Y = 0, height approximately 5.23 units. `HeritageTurntable` is the animated parent.
- Source camera: orthographic, scale 6.13, Blender position `(0.7, -11.5, 4.2)`, looking at `(0, 0, 2.64)`.
- Material: opaque, nonmetallic clay, roughness 0.84, per-vertex fired-clay color variation, 512 px tiled tangent-space normal texture. Fine silhouette irregularities and scoring are geometry.
- Three source area lights: warm key, soft paper-colored fill, warm rim. Source-only floor catches a coherent shadow in the transparent poster.
- Source animation: 180 frames at 30 fps; turning between -0.24 and 0.29 radians and back. Browser interaction uses its own bounded animation, deferred rendering, offscreen pause, and reduced-motion fallback.
- The browser must create its own lighting and shadow system. The GLB does not transfer the Cycles lighting or shadow catcher; browser lighting is deliberately tuned for the page.
- Transparent compositing is confined to the poster background and the surrounding scene layers. The principal clay mesh stays opaque.

`production-stats.json` records export and poster measurements. The detailed GLB uses Draco mesh compression and is approximately 1.79 MB, with 159,152 triangles. Its normal texture is embedded; the separate PNG is retained as a production resource. The local Three.js license and Draco decoder files ship with the runtime.
