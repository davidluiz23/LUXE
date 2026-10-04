# Original collection scope

The public storefront now recognizes only ALKEBULAN Ijele, Durbar, and Dùn Dùn tees. The predicate matches the whole normalized brand and product name, tolerating accents, Unicode dashes, and common tee suffixes. It does not match incidental words in unrelated products.

The rule lives in `Frontend/js/products.js` and covers public lists, search, related products, direct product lookup, cached catalog reads, and saved bag/wishlist reconciliation after a successful catalog request. An outage retains the visitor's saved contents. Admin uses the raw backend API and retains every product record and historical order.

Product records, prices, stock and variants are managed in the admin console. The homepage shows the three editorial artworks and binds product links and prices to their intended catalog records. When the intended live catalog is empty, collection, men, and women pages also show those three local designs as artwork. These cards have no product IDs, prices, stock claims, wishlist or purchase controls. They are embedded in page HTML and open product.html?piece=<design>, with descriptions, artwork, styling notes and an image close-up. Local designs render before the inventory request resolves. They never enter `getProducts()`, search inventory, carts or checkout. Once intended products are published, the pages use actual catalog records and controls. Filtered selections still use an empty state when nothing matches. No live inventory, prices, orders or policies were changed by the presentation work.

## Staged database policy

`supabase/proposals/20261002000032_curate_original_collection.sql` is a **draft, not applied**. It adds restrictive read policies, the same whole-name identity helper, guards in security-definer quote/new-order functions, and scoped public metrics. It preserves all rows and existing order idempotency behavior. Its companion rollback restores previous public access/definitions.

This draft was not validated against PostgreSQL. It is kept outside the automatically applied migration directory. Review and exercise it in a disposable Supabase database before promoting it to migrations or applying it to a live project. Frontend filtering alone does not change direct REST or RPC authorization. This distinction is intentional and must not be reported as a live database retirement.

Validation: catalog unit cases cover collisions, normalization, cache replacement, empty vs unavailable, and admin access. Browser cases cover listings/search, rejected unrelated direct URLs, stale bag/wishlist reconciliation, outage preservation, and complete admin access.

## Live catalog removal ? 2026-10-04

At the user's explicit request, all 88 legacy product records (IDs 1?88) were deleted from the linked ALKEBULAN project. A snapshot fingerprint guarded the transaction. The four order records and three order-item records were verified byte-for-byte unchanged. No intended tee records existed in that catalog. The previous visibility-only SQL proposal remains unapplied and is not the mechanism used for removal. An excluded local recovery snapshot and execution result are in `artifacts/catalog-removal/`.
