# Original collection scope

The public storefront now recognizes only ALKEBULAN Ijele, Durbar, and Dùn Dùn tees. The predicate matches the whole normalized brand and product name, tolerating accents, Unicode dashes, and common tee suffixes. It does not match incidental words in unrelated products.

The rule lives in `Frontend/js/products.js` and covers public lists, search, related products, direct product lookup, cached catalog reads, and saved bag/wishlist reconciliation after a successful catalog request. An outage retains the visitor's saved contents. Admin uses the raw backend API and retains every product record and historical order.

Product records, prices, stock and variants are managed in the admin console. Shop, category, homepage, wishlist and related-product cards use `catalog-ui.js`. Published tees show real prices, a wishlist action and Add to cart or Choose options. Both `product.html?id=<id>` and `product.html?piece=<design>` use the same product page, including its description, gallery, variants, quantity, cart and WhatsApp checkout actions.

Local photographs and descriptions keep the three shirts visible while inventory loads. They never manufacture an inventory ID, selling price, stock quantity or review. An unpublished tee has an explicitly disabled purchase action and no structured offer. Publishing the actual product through admin enables commerce through the existing server-priced checkout. The admin's “Set up an original tee” selector pre-fills its name, photo and description, then requires the owner to enter prices and stock. The original product save path and confirmation remain in use. Choosing an already-published tee edits the existing record.

The display-only artwork detail layout was removed on 2026-10-04. Product details and purchase controls now share a compact shopping layout. Mobile keeps price and Add to cart visible in the bottom bar. The existing cart, checkout and secure order RPC contracts are retained from `main`.

## Staged database policy

`supabase/proposals/20261002000032_curate_original_collection.sql` is a **draft, not applied**. It adds restrictive read policies, the same whole-name identity helper, guards in security-definer quote/new-order functions, and scoped public metrics. It preserves all rows and existing order idempotency behavior. Its companion rollback restores previous public access/definitions.

This draft was not validated against PostgreSQL. It is kept outside the automatically applied migration directory. Review and exercise it in a disposable Supabase database before promoting it to migrations or applying it to a live project. Frontend filtering alone does not change direct REST or RPC authorization. This distinction is intentional and must not be reported as a live database retirement.

Validation: catalog unit cases cover collisions, normalization, cache replacement, empty vs unavailable, and admin access. Browser cases cover listings/search, rejected unrelated direct URLs, stale bag/wishlist reconciliation, outage preservation, and complete admin access.

## Live catalog removal - 2026-10-04

At the user's explicit request, all 88 legacy product records (IDs 1 through 88) were deleted from the linked ALKEBULAN project. A snapshot fingerprint guarded the transaction. The four order records and three order-item records were verified byte-for-byte unchanged. No intended tee records existed in that catalog. The previous visibility-only SQL proposal remains unapplied and is not the mechanism used for removal. An excluded local recovery snapshot and execution result are in `artifacts/catalog-removal/`.

`supabase/migrations/20261004000033_remove_legacy_catalog.sql` records the same removal for database rebuilds. It matches each reviewed ID, name and brand together, so a different product reusing an ID is preserved.

Read-only checks during the commerce repair confirmed an empty published catalog and a live payment configuration with WhatsApp ordering enabled and Paystack disabled. No tee prices or quantities have been supplied, so no replacement inventory has been invented or published. Browser tests use explicitly isolated fixture prices and fake order/payment services; their amounts are not live selling prices. No live payment or customer WhatsApp message was sent for validation.

The local preview now defaults to `http://127.0.0.1:5500`, an origin already allowed by the linked payment backend. The former preview default (`4173`) and Vite (`5173`) return `403 Origin not allowed` for payment settings. Run `npm run dev` and use the HTTP preview rather than opening the HTML directly. No backend origin/security configuration was loosened.
