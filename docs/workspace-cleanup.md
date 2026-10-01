# Workspace cleanup - 2026-10-01

Removed 129 files (34.56 MiB) from the workspace.

Recovery copy and SHA-256 manifest: `C:\Users\OWNER\.codex\backups\alkebulan-cleanup-20261001-160056`.

Validation: all 129 files are absent from the workspace and present in the recovery copy. The selected homepage build passes, page/reference checks pass for 30 scripts and 23 pages, and all 30 unit tests pass.

The removed presentation styles and scripts are not loaded by any public or admin HTML entrypoint. The street-direction migration only targeted the retired atelier markup. Historical review screenshots and logs can be regenerated.

Preserved the current Living Canvas output and review, all original garment photographs and supplied references, fonts and licenses, editable Blender/art sources, explicit world/heritage authoring commands and their dependencies, commerce code, Supabase data and migrations, and all regression tests.

Older design notes remain as history; any references to the retired style files now resolve through the external recovery copy. The selected implementation is documented in living-canvas.md.

Removed presentation and temporary files:
- Frontend/css/art-direction.css
- Frontend/css/atelier.css
- Frontend/css/editorial-commerce.css
- Frontend/css/house-photography.css
- Frontend/css/poster-commerce-tail.tmp
- Frontend/css/poster-commerce.css
- Frontend/css/poster.css
- Frontend/css/poster.css.new
- Frontend/css/streetwear.css
- Frontend/css/home.css
- Frontend/js/art-direction.js
- Frontend/js/atelier.js
- Frontend/js/culture-field.js
- Frontend/js/home-stage.js
- scripts/apply-street-direction.cjs

Removed review output:
- artifacts/culture
- artifacts/heritage
- artifacts/redesign
- artifacts/reference
- artifacts/scroll-world
- artifacts/black-balance-reference.html
- artifacts/culture-interaction-tests.log
- artifacts/culture-storefront-tests.log
- heritage-blender.log
- heritage-browser-tests.log
- heritage-reference.log
- heritage-review.log
- heritage-unit-tests.log
