# Storefront images and audience overview

Open `admin.html` and sign in as an owner or administrator.

- **Overview** is the opening dashboard. It shows unique browser visitors for the selected 7, 30 or 90 days, sessions active within 30 seconds, all current registered accounts and accounts with an unexpired ban. The chart shows daily browser visitors and registrations; the account status bar shows current bans. It refreshes every 30 seconds while visible. “View daily numbers” exposes the chart values in a table.
- **Storefront Images** manages 1–12 homepage slides, their order, titles, descriptions and optional product destinations. It also manages the men’s and women’s collection backgrounds and the homepage “A closer look” image, description and button. Vertical positioning is adjustable for the backgrounds and detail image. Uploads use the existing signed Cloudinary uploader. Press **Save images** to publish. Removing a slide does not delete a Cloudinary asset that another part of the site might use.
- Unsaved changes stay in the editor if an upload or save fails. A version conflict prevents one administrator from overwriting another administrator’s changes. **Reload published images** replaces the current draft with the saved version.

The public pages fetch one small content document per load and retain the last valid document locally for offline fallback. Cloudinary images use appropriately sized derivatives. Original local shirt cutouts retain their existing presentation; custom images display without the original shirt masks. Slideshow timing remains 5 seconds and respects pause, keyboard focus, offscreen visibility and reduced motion.

## What the counts mean

Visitor history starts at the migration timestamp. Earlier dates are **not recorded**, not zero. The first day and today are partial. Days are grouped in `Africa/Lagos` (WAT). A browser’s existing random local-storage ID is counted once per day; the period total deduplicates that ID across the whole period. Different devices, cleared storage and blocked tracking affect browser counts. These are recorded browsers, not a guaranteed count of individual humans.

Daily history stores only visit date, random browser ID and first-seen timestamp. It does not copy the live session’s account ID, page path or personal information. Admin pages are excluded. Existing heartbeat throttling and rate limits still apply. The live presence table may expire independently of daily history.

Account totals come directly from `auth.users`, without customer-list pagination. Deleted and anonymous accounts are excluded. Registrations are grouped by creation date for accounts that still exist; deleting an account therefore also removes it from this registration history. Banned accounts use `banned_until > now()`, so expired bans are excluded. Bans are a current snapshot, not an invented historical series.

## Database and verification

Migration: `supabase/migrations/20260913000031_storefront_content_and_audience.sql`.

- `get_storefront_content_v1`: public published images and revision; no editor identity.
- `admin_save_storefront_content_v1`: admin check, bounded content validation, linked-product validation and optimistic revision check.
- `record_storefront_daily_visit`: private trigger after an accepted presence heartbeat.
- `admin_audience_metrics_v1`: admin-only aggregate metrics; direct table access is revoked.

Run `node scripts/check-storefront-db.cjs` to verify the linked database in a rollback-only transaction. Before installing the migration, add `--with-migration` to verify it transactionally as well. All test changes, including temporary visitor records and content revisions, roll back. No real accounts are changed.

Run `node --test tests/browser/admin-storefront.test.cjs` for editor, publishing, mobile layout, accessibility, access gating and error-state coverage. Existing slideshow tests remain in `tests/browser/home-stage.test.cjs`.
