# ALKEBULAN ↔ existing Baileys bot

This adapter mounts beside the bot you already built. The bot keeps its own Baileys version, socket, login session, credentials, reconnect handling and command handlers. Nothing here starts a second WhatsApp session.

The storefront's authenticated Edge functions now share `supabase/functions/_shared/whatsapp.ts` for:

- New-order messages to admin and opted-in customers.
- Customer fulfilment and tracking updates after admin changes an order.
- Individual customer messages sent from the admin console.
- Payment confirmation/review alerts and account verification codes.

Inventory, prices and stock remain controlled by admin and the existing database checkout. Customer consent, verification, order ownership and admin permission checks still happen before sending. Delivery is recorded only after the bot returns a message ID.

## Attach when the bot location is provided

Import the adapter into the bot's existing process. Adapt the two callbacks to the socket and connection-state variables that bot already maintains:

```js
import { createBaileysBridge } from './baileys-bridge.mjs';

const bridge = createBaileysBridge({
  getSocket: () => currentSocket,
  isConnected: () => connectionState === 'open',
  token: process.env.WHATSAPP_BRIDGE_TOKEN,
  receiptDirectory: process.env.WHATSAPP_RECEIPT_DIRECTORY || './.whatsapp-bridge',
});

// Keep this on loopback behind your HTTPS reverse proxy.
bridge.listen(8787, '127.0.0.1');
```

The callbacks must follow the bot's replacement socket on reconnect. `currentSocket` and `connectionState` are integration placeholders, not new bot implementations. This uses Baileys' documented [`sendMessage(jid, content)` API](https://github.com/WhiskeySockets/Baileys/blob/master/README.md) and the existing bot's [`connection.update` state](https://github.com/WhiskeySockets/docs/blob/main/concepts/events.mdx).

Set these only in the bot host / Supabase Edge secrets, never in browser JavaScript:

```dotenv
WHATSAPP_PROVIDER=baileys
WHATSAPP_BRIDGE_URL=https://your-bot-host.example
WHATSAPP_BRIDGE_TOKEN=<same random secret of at least 32 characters on both servers>
WHATSAPP_ADMIN_NUMBER=<real international admin number, digits only>
WHATSAPP_OTP_SECRET=<separate random secret of at least 32 characters>
```

The adapter accepts `GET /health` and `POST /v1/messages`, both with `Authorization: Bearer <WHATSAPP_BRIDGE_TOKEN>`. Sending also requires a stable `Idempotency-Key` header and JSON `{ "to": "international digits", "text": "message" }`. Success is `{ "ok": true, "messageId": "..." }`. Health reports the actual bot connection; there is no public QR/login or send endpoint.

Keep `receiptDirectory` on persistent private storage. Receipts contain a content fingerprint and message ID, never message bodies, phone numbers or codes. Retried completed deliveries return the original receipt, including after a restart. Reusing a key for different content returns a conflict. If a send is interrupted or cannot be confirmed, its receipt stays unresolved and retries do not send a duplicate. Reconcile that receipt against the bot's message store before deciding whether to retry. Use one adapter process for the bot session; don't mount separate receipt stores for the same bot.

No bridge URL, credentials, pairing, deployment or customer messages have been configured by this change. Once the existing bot is supplied, attach the callbacks, configure the private endpoint, verify health, and deploy the four changed Edge functions: `order-notifications`, `admin-messaging`, `payment-gateway`, `whatsapp-verification`.

## Current automation boundary

The existing checkout saves the order through the secure database RPC, requests order notifications, and offers the customer's manual WhatsApp chat handoff. A configured admin number enables that checkout option; it does not prove that the bot is connected. New-order and fulfilment notification requests currently originate from the checkout/admin UI. Delivery claims and the bridge deduplicate retries, but a durable background retry worker has not been installed. Payment-alert transport failures are logged; they are not queued automatically.

The contact form saves requests to `contact_messages`. Forwarding support requests to WhatsApp, receiving incoming WhatsApp support messages, and routing them to the existing bot's handlers are not implemented in this adapter. Those handlers must be connected after the bot's folder and command structure are supplied. Do not describe this scaffold as deployed or fully automated.

## Local checks

`node --test tests/whatsapp.test.cjs` exercises the real HTTP adapter against a fake socket. It covers authentication, order/OTP routing, disconnects, failed acknowledgements, persistent duplicate protection and explicit Meta compatibility without sending WhatsApp messages.
