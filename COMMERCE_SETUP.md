# LUXE commerce setup

The storefront is WhatsApp-first by default. Every checkout creates a protected
Supabase order before opening WhatsApp, so the order is visible in both the
customer dashboard and the admin console even if the WhatsApp tab is closed.
Checkout requests are idempotent, rate-limited, validated server-side, and only
send customer WhatsApp messages after explicit consent.

## Deploy the database and functions

```sh
supabase db push
supabase functions deploy order-notifications
supabase functions deploy whatsapp-verification
supabase functions deploy admin-messaging
supabase functions deploy account-administration
supabase functions deploy payment-gateway --no-verify-jwt
```

Set Edge Function secrets from `supabase/.env.example`. Keep all access tokens
and payment secret keys in Supabase secrets, never in `Frontend/js`.

## WhatsApp Cloud API

Configure `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, and
`WHATSAPP_ADMIN_NUMBER`. Approved templates are recommended for messages sent
outside the customer-service conversation window.

Template body parameter order:

- `WHATSAPP_ADMIN_ORDER_TEMPLATE`: order number, customer name, phone, items,
  total, delivery address.
- `WHATSAPP_CUSTOMER_ORDER_TEMPLATE`: customer name, order number, items, total.
- `WHATSAPP_CUSTOMER_UPDATE_TEMPLATE`: customer name, order number, status,
  estimated arrival, waybill URL.
- `WHATSAPP_ADMIN_PAYMENT_TEMPLATE`: order number, total, payment reference.

If templates are left blank, the function sends normal text messages. WhatsApp
may reject those outside an open conversation window; checkout still provides a
reliable prefilled click-to-chat handoff to the admin.

## Individual customer updates

The admin console can send a targeted in-app notification to an individual
account. Email and WhatsApp are optional additional channels and are only
attempted after that customer enables the matching preference in their account
dashboard. General WhatsApp updates also require a verified number. These
preferences are separate from the consent captured for transactional order
messages.

For optional email delivery, create a Resend API key, verify a domain, then set
`RESEND_API_KEY` and `EMAIL_FROM`. For optional WhatsApp delivery, approve a
template with body parameters in this order: customer name, update title, update
message; set its name as `WHATSAPP_ADMIN_CUSTOMER_MESSAGE_TEMPLATE`.

The `admin-messaging` function checks the authenticated admin role, keeps
provider credentials server-side, rate-limits each admin to 20 targeted messages
per 10 minutes, records channel results and writes an admin audit entry. In-app
delivery remains available when an external provider is not configured.

## Customer security history and account suspension

The Customers section can search by name, email, verified WhatsApp number or
order number. Its protected detail view includes recent transactions, payment
providers/channels, safe card descriptors such as card brand and last four
digits, successful sign-ins, IP addresses, device/user-agent information and
admin actions affecting that customer. Full card numbers, CVVs, Paystack
authorization codes and reusable payment tokens are never copied into LUXE.

For sign-in IP and device history, enable **Write audit logs to the database**
under Supabase Dashboard -> Authentication -> Audit Logs. When this optional
storage is disabled, the customer detail screen clearly reports that login
history is unavailable instead of inventing client-provided IP data. Restrict
this data to fraud, security and customer-support use, document the purpose in
the privacy policy, and apply an appropriate retention period.

Account suspension is a reversible ban performed only inside the authenticated
`account-administration` Edge Function. It requires an admin role, a written
reason and an exact `BAN customer@example.com` confirmation. Admin/owner
accounts and self-suspension are blocked. Orders and audit evidence are
preserved, new orders are blocked at the database even while an old access token
is expiring, and restoring access requires the matching `UNBAN` confirmation.

Sensitive console changes use confirmation screens. Order fulfilment changes
show the administrator email and time through an admin-only attribution record;
staff identities are not exposed through customer order queries. Order changes,
catalog changes, site updates, promotions, customer messages, team changes and
account suspensions also appear in the shared Activity Log.
Order updates use optimistic concurrency: if another administrator changes the
same order after it was loaded, the stale save is rejected and the console
refreshes instead of silently overwriting the newer decision.

## Promo codes

Admins can create and edit percentage-off codes, schedule start/end times, set a
minimum subtotal, cap total uses, limit uses per account and pause a code without
deleting its history. Discounts are calculated on the product subtotal. Shipping
uses the pre-discount subtotal and tax uses the discounted subtotal.

Promo validation and final totals run in PostgreSQL, not in browser-controlled
JavaScript. Checkout revalidates stock, dates and redemption limits, locks the
promotion while creating the order, records the redemption atomically, and uses
the discounted stored order total for Paystack. Percentage discounts are capped
at 95% so online payment orders cannot become zero-value charges.

## One account per verified WhatsApp number

WhatsApp verification is feature-gated so an incomplete provider setup cannot
accidentally lock every customer out of checkout. The database is the source of
truth: OTP codes are hashed, expire after 10 minutes, allow at most five guesses,
and are rate-limited to five sends per account or number each hour. A verified
number can belong to only one account.

1. In WhatsApp Manager, create and approve an authentication template with one
   body code parameter and a copy-code button.
2. Set `WHATSAPP_VERIFICATION_TEMPLATE`, `WHATSAPP_OTP_SECRET`, and the shared
   Cloud API secrets shown in `supabase/.env.example`.
3. Deploy `whatsapp-verification` and test requesting and confirming a code with
   a real WhatsApp number.
4. Only after the test succeeds, require verification at checkout:

```sql
update public.commerce_settings
set whatsapp_verification_required = true,
    updated_at = now()
where singleton = true;
```

If the Meta provider is unavailable, existing verified customers remain linked,
but new numbers cannot be verified. To keep checkout available during a provider
incident, set `whatsapp_verification_required` back to `false`; this does not
erase any verified identities. Changing a number requires verifying the new one,
and the unique database index prevents it from being attached to another user.

## Enable Paystack later

1. Set `PAYSTACK_SECRET_KEY` and `PAYSTACK_ENABLED=true` in Supabase secrets.
2. Set the Paystack webhook URL to the deployed `payment-gateway` function.
3. Set `providers.paystack.enabled` to `true` in
   `Frontend/js/store-config.js`.
4. Test initialization, callback, webhook signature validation, amount matching,
   and idempotent fulfilment with Paystack test keys before using live keys.

Products can store merchant-entered USD and NGN prices independently. Existing
catalog rows keep their USD price and show `NGN price not set` in the admin
console until an administrator supplies the Nigerian price. The current order
calculation remains USD-authoritative, so do not treat the NGN catalog field as
the charged amount until NGN checkout, promotion, shipping and Paystack handling
are migrated together and tested end to end.

# Production URLs

For the GitHub Pages deployment, enable Pages in the repository under
**Settings > Pages > Build and deployment > GitHub Actions**.

In Supabase, open **Authentication > URL Configuration** and set:

- Site URL: `https://davidluiz23.github.io/LUXE/`
- Redirect URL: `https://davidluiz23.github.io/LUXE/**`

Keep the local development redirect URLs as additional entries if local sign-in,
email confirmation, or password-reset testing is still required.
