# Original collection scope

The public storefront now recognizes only ALKEBULAN Ijele, Durbar, and Dùn Dùn tees. The predicate matches the whole normalized brand and product name, tolerating accents, Unicode dashes, and common tee suffixes. It does not match incidental words in unrelated products.

The rule lives in `Frontend/js/products.js` and covers public lists, search, related products, direct product lookup, cached catalog reads, and saved bag/wishlist reconciliation after a successful catalog request. An outage retains the visitor's saved contents. Admin uses the raw backend API and retains every product record and historical order.

A read-only audit during this redesign found 88 unrelated live products and zero intended products. No live products, prices, inventory, orders, or policies were changed. The supplied photographs are editorial artwork, not inventory records. The homepage shows all three artworks and binds product links and prices only when a unique intended record exists. An empty curated catalog displays artwork and a contact-for-availability message. The owner still needs to provide the intended prices, stock and variants before those products can be published through admin.

## Staged database policy

`supabase/proposals/20261002000032_curate_original_collection.sql` is a **draft, not applied**. It adds restrictive read policies, the same whole-name identity helper, guards in security-definer quote/new-order functions, and scoped public metrics. It preserves all rows and existing order idempotency behavior. Its companion rollback restores previous public access/definitions.

This draft was not validated against PostgreSQL. It is kept outside the automatically applied migration directory. Review and exercise it in a disposable Supabase database before promoting it to migrations or applying it to a live project. Frontend filtering alone does not change direct REST or RPC authorization. This distinction is intentional and must not be reported as a live database retirement.

Validation: catalog unit cases cover collisions, normalization, cache replacement, empty vs unavailable, and admin access. Browser cases cover listings/search, rejected unrelated direct URLs, stale bag/wishlist reconciliation, outage preservation, and complete admin access.
