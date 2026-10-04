# lights-perspective

Updated: 2026-10-04

- Latest fix: shared image handling now accepts the site's bundled photos in local-file and HTTP previews. Shirts no longer get replaced with placeholders after loading. Account order thumbnails use the same helper; shared script versions were refreshed across pages.
- Verified: 5 browser regression tests passed for catalog loading/rerenders/refreshes, product zoom, wishlist, cart, checkout, order history, and homepage images. Unit suite passed (46 tests); syntax and local references passed for 32 scripts and 23 pages.
- Admin release provisions are ready: Products -> Set up an original tee -> choose Ijele, Durbar, or Dun Dun -> enter real USD/NGN prices, sizes/category and stock -> Save Product and confirm. Saving publishes immediately; positive stock enables purchasing. No tees were published during this work.
- Next: owner supplies real prices, sizes and stock through admin, and the existing Baileys bot folder when ready for connection.
- Keep working on this branch; preserve the existing cart/payment flow while changing UI.

