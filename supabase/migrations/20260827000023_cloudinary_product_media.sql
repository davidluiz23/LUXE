-- Product media now uploads through the admin-only Cloudinary signing flow.
-- Keep public read access to legacy Supabase objects so existing product URLs
-- do not break, and leave the separate per-user avatar policies untouched.

drop policy if exists "luxe_uploads_admin_insert_products" on storage.objects;
drop policy if exists "luxe_uploads_admin_update_products" on storage.objects;
drop policy if exists "luxe_uploads_admin_delete_products" on storage.objects;
