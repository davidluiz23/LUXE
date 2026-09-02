import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import {
  sendOrderStatusEmail,
  type OrderEmailRecord,
} from "../_shared/order-email.ts";
import { sendPushToAdmins, sendPushToUsers } from "../_shared/web-push.ts";
import {
  getSupabaseServiceKey,
  type SupabaseServiceClient,
} from "../_shared/supabase-server.ts";

type NotificationAction = "order_created" | "order_updated";

type EmailDeliveryClaim = {
  delivery_id: string;
  claim_token: string;
  kind: "order" | "site_update";
  order_id: string | null;
  site_update_id: string | null;
  template_key: string;
  recipient_email: string;
  recipient_name: string;
  payload: Record<string, unknown> | null;
};

function allowedOrigin(request: Request): string | null {
  const configured = (Deno.env.get("LUXE_ALLOWED_ORIGINS") || Deno.env.get("LUXE_SITE_URL") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      try { return new URL(value).origin; } catch { return ""; }
    })
    .filter(Boolean);
  const origin = request.headers.get("origin");
  if (!configured.length) return null;
  if (!origin) return configured[0];
  return configured.includes(origin) ? origin : null;
}

function json(body: Record<string, unknown>, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Vary": "Origin",
    },
  });
}

function normalizePhone(value: unknown): string {
  let phone = String(value || "").replace(/[^0-9]/g, "");
  const country = (Deno.env.get("WHATSAPP_DEFAULT_COUNTRY_CODE") || "234").replace(/\D/g, "");
  if (phone.startsWith("00")) phone = phone.slice(2);
  if (phone.startsWith("0")) phone = country + phone.slice(1);
  return phone;
}

function money(value: unknown, currency: unknown): string {
  const code = String(currency || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: code }).format(Number(value) || 0);
  } catch {
    return `${code} ${(Number(value) || 0).toFixed(2)}`;
  }
}

function brandName(): string {
  return (Deno.env.get("BRAND_NAME") || "ALKEBULAN").trim().slice(0, 80) || "ALKEBULAN";
}

async function sendWhatsApp(
  to: string,
  templateName: string | null,
  parameters: string[],
  fallbackText: string,
) {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const graphVersion = Deno.env.get("WHATSAPP_GRAPH_VERSION") || "v23.0";
  if (!token || !phoneNumberId || !to) {
    return { sent: false, reason: "WhatsApp Cloud API is not fully configured." };
  }

  const body = templateName
    ? {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE") || "en" },
        components: [{
          type: "body",
          parameters: parameters.map((text) => ({ type: "text", text: text.slice(0, 1024) })),
        }],
      },
    }
    : {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: fallbackText.slice(0, 4096) },
    };

  const response = await fetch(
    `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    console.error("[order-notifications] WhatsApp send failed:", response.status, detail);
    return { sent: false, reason: `WhatsApp returned ${response.status}.` };
  }
  return { sent: true };
}

async function deliverWithClaim(
  service: SupabaseServiceClient,
  orderId: string,
  eventKey: string,
  channel: "admin_whatsapp" | "customer_whatsapp" | "admin_push" | "customer_push",
  deliver: () => Promise<unknown>,
) {
  const { data: claimToken, error: claimError } = await service.rpc(
    "service_claim_order_notification_v1",
    { p_order_id: orderId, p_event_key: eventKey, p_channel: channel },
  );
  if (claimError) {
    console.error("[order-notifications] Claim failed:", claimError.message);
    return { sent: false, skipped: true, claimError: true };
  }
  if (!claimToken) return { sent: false, skipped: true, alreadyClaimed: true };

  try {
    const rawResult = await deliver();
    const result = rawResult && typeof rawResult === "object"
      ? rawResult as Record<string, unknown>
      : {};
    const delivered = result.sent === true || Number(result.sent || 0) > 0;
    await service.rpc("service_finish_order_notification_v1", {
      p_claim_token: claimToken,
      p_succeeded: delivered,
      p_error: delivered ? null : String(result.reason || result.status || "Delivery unavailable"),
    });
    return { ...result, delivered };
  } catch (error) {
    await service.rpc("service_finish_order_notification_v1", {
      p_claim_token: claimToken,
      p_succeeded: false,
      p_error: error instanceof Error ? error.message : "Delivery failed",
    });
    console.error("[order-notifications] Delivery failed:", error);
    return { sent: false, delivered: false };
  }
}

async function deliverQueuedOrderEmail(
  service: SupabaseServiceClient,
  order: OrderEmailRecord & { admin_version?: number },
  dedupeKey: string,
) {
  const { data, error } = await service.rpc(
    "service_claim_email_delivery_by_key_v1",
    { p_dedupe_key: dedupeKey },
  );
  if (error) {
    // The durable worker can still deliver the queued message. This also keeps
    // rolling deployments safe when the Edge function reaches production first.
    console.error("[order-notifications] Email queue claim failed:", error.message);
    return { sent: false, queued: true, skipped: true, status: "queued" };
  }

  const claim = (Array.isArray(data) ? data[0] : data) as EmailDeliveryClaim | undefined;
  if (!claim) {
    return {
      sent: false,
      queued: false,
      skipped: true,
      status: "not_pending",
    };
  }

  const payload = claim.payload && typeof claim.payload === "object" ? claim.payload : {};
  const status = String(payload.status || order.status || "updated")
    .toLowerCase()
    .replace(/[^a-z_]/g, "") || "updated";
  const rawVersion = Number(payload.admin_version ?? order.admin_version ?? 0);
  const version = Number.isSafeInteger(rawVersion) && rawVersion >= 0 ? rawVersion : 0;
  const eventKey = claim.template_key === "order_received"
    ? `created:${order.id}`
    : `status:${version}:${status}`;

  try {
    const result = await sendOrderStatusEmail({
      ...order,
      contact_email: claim.recipient_email,
      contact_name: claim.recipient_name || order.contact_name,
    }, eventKey, {
      idempotencyKey: claim.delivery_id,
      logContext: "order-notifications",
    });
    const finishResult = result.sent
      ? "sent"
      : result.status === "invalid_recipient"
      ? "suppressed"
      : result.retryable
      ? "retry"
      : "failed";
    const { error: finishError } = await service.rpc(
      "service_finish_email_delivery_v1",
      {
        p_claim_token: claim.claim_token,
        p_result: finishResult,
        p_provider_message_id: result.messageId || null,
        p_error: result.sent ? null : result.reason || result.status,
      },
    );
    if (finishError) {
      console.error("[order-notifications] Email queue completion failed:", finishError.message);
    }
    return {
      sent: result.sent,
      accepted: result.sent,
      queued: !result.sent && result.retryable,
      status: result.status,
      reference: result.messageId,
    };
  } catch (sendError) {
    const message = sendError instanceof Error ? sendError.message : "Email delivery failed.";
    await service.rpc("service_finish_email_delivery_v1", {
      p_claim_token: claim.claim_token,
      p_result: "retry",
      p_provider_message_id: null,
      p_error: message,
    });
    console.error("[order-notifications] Email delivery failed:", sendError);
    return { sent: false, accepted: false, queued: true, status: "failed" };
  }
}

Deno.serve(async (request) => {
  const origin = allowedOrigin(request);
  if (!origin) return new Response("Origin not allowed", { status: 403 });
  if (request.method === "OPTIONS") return json({ ok: true }, 200, origin);
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 4096) return json({ error: "request_too_large" }, 413, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = getSupabaseServiceKey();
  if (!supabaseUrl || !serviceKey) return json({ error: "server_not_configured" }, 500, origin);

  const authorization = request.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "authentication_required" }, 401, origin);

  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await service.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "invalid_session" }, 401, origin);

  let body: { action?: NotificationAction; orderId?: string };
  try {
    const rawBody = await request.text();
    if (rawBody.length > 4096) return json({ error: "request_too_large" }, 413, origin);
    body = JSON.parse(rawBody || "{}");
  } catch { return json({ error: "invalid_json" }, 400, origin); }
  if (!body.orderId || !["order_created", "order_updated"].includes(body.action || "")) {
    return json({ error: "invalid_request" }, 400, origin);
  }

  const { data: order, error: orderError } = await service
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", body.orderId)
    .maybeSingle();
  if (orderError || !order) return json({ error: "order_not_found" }, 404, origin);

  const isOwner = order.user_id === authData.user.id;
  const { data: adminRow } = await service
    .from("admin_users")
    .select("role")
    .eq("user_id", authData.user.id)
    .maybeSingle();
  const isAdmin = adminRow?.role === "owner" || adminRow?.role === "admin";
  if ((body.action === "order_created" && !isOwner) || (body.action === "order_updated" && !isAdmin)) {
    return json({ error: "not_authorized" }, 403, origin);
  }

  const itemSummary = (order.order_items || [])
    .map((item: { product_name: string; quantity: number }) => `${item.product_name} ×${item.quantity}`)
    .join(", ") || "Order items";
  const total = money(order.total, order.currency);
  const address = order.shipping_address || {};
  const addressText = [address.address, address.city, address.state, address.zip].filter(Boolean).join(", ");
  const eta = order.estimated_delivery_min_days
    ? `${order.estimated_delivery_min_days}${order.estimated_delivery_max_days && order.estimated_delivery_max_days !== order.estimated_delivery_min_days ? `–${order.estimated_delivery_max_days}` : ""} days`
    : "To be confirmed";

  const brand = brandName();

  if (body.action === "order_created") {
    const eventKey = `created:${String(order.created_at || order.id)}`.slice(0, 160);
    const adminText = [
      `NEW ${brand.toUpperCase()} ORDER ${order.order_number}`,
      `Customer: ${order.contact_name}`,
      `Phone: ${order.contact_phone}`,
      `Email: ${order.contact_email}`,
      `Items: ${itemSummary}`,
      order.promotion_code ? `Promo: ${order.promotion_code} (-${money(order.discount_amount, order.currency)})` : null,
      `Total: ${total}`,
      `Delivery: ${addressText}`,
      `Payment: ${order.payment_provider} (${order.payment_status})`,
    ].filter(Boolean).join("\n");
    const promoText = order.promotion_code ? ` Promo ${order.promotion_code} saved ${money(order.discount_amount, order.currency)}.` : "";
    const customerText = `Hi ${order.contact_name}, ${brand} received order ${order.order_number} for ${itemSummary}.${promoText} Total: ${total}. We will confirm it and share delivery updates here.`;

    const pushAlreadySent = order.customer_push_notified_at && order.created_at &&
      new Date(order.customer_push_notified_at).getTime() >= new Date(order.created_at).getTime();
    const [adminResult, customerResult, adminPushResult, customerPushResult, customerEmailResult] = await Promise.all([
      order.admin_notified_at
        ? Promise.resolve({ sent: true, skipped: true, delivered: true })
        : deliverWithClaim(service, order.id, eventKey, "admin_whatsapp", () => sendWhatsApp(
          normalizePhone(Deno.env.get("WHATSAPP_ADMIN_NUMBER")),
          Deno.env.get("WHATSAPP_ADMIN_ORDER_TEMPLATE") || null,
          [order.order_number, order.contact_name, order.contact_phone, itemSummary, total, addressText],
          adminText,
        )),
      !order.whatsapp_opt_in_at
        ? Promise.resolve({ sent: false, skipped: true, delivered: false, reason: "Customer did not opt in." })
        : order.customer_notified_at
        ? Promise.resolve({ sent: true, skipped: true, delivered: true })
        : deliverWithClaim(service, order.id, eventKey, "customer_whatsapp", () => sendWhatsApp(
          normalizePhone(order.contact_phone),
          Deno.env.get("WHATSAPP_CUSTOMER_ORDER_TEMPLATE") || null,
          [order.contact_name, order.order_number, itemSummary, total],
          customerText,
        )),
      order.admin_push_notified_at
        ? Promise.resolve({ status: "sent", configured: true, attempted: 0, sent: 0, failed: 0, expired: 0, delivered: true })
        : deliverWithClaim(service, order.id, eventKey, "admin_push", () => sendPushToAdmins(service, {
          title: `New order ${order.order_number}`,
          body: `${order.contact_name} · ${total} · ${itemSummary}`,
          url: `admin.html?panel=orders&order=${encodeURIComponent(order.order_number)}`,
          tag: `admin-order-${order.id}`,
          data: { orderId: order.id, orderNumber: order.order_number, audience: "admin" },
        })),
      pushAlreadySent
        ? Promise.resolve({ status: "sent", configured: true, attempted: 0, sent: 0, failed: 0, expired: 0, delivered: true })
        : deliverWithClaim(service, order.id, eventKey, "customer_push", () => sendPushToUsers(service, [order.user_id], {
          title: `Order ${order.order_number} received`,
          body: `${brand} received your order for ${total}. Tap to view its status.`,
          url: `dashboard.html?tab=orders&order=${encodeURIComponent(order.order_number)}`,
          tag: `customer-order-${order.id}`,
          data: { orderId: order.id, orderNumber: order.order_number, audience: "customer" },
        })),
      deliverQueuedOrderEmail(
        service,
        order as OrderEmailRecord & { admin_version?: number },
        `order:${order.id}:received`,
      ),
    ]);

    const stamps: Record<string, string> = {};
    const now = new Date().toISOString();
    if (adminResult.delivered) stamps.admin_notified_at = now;
    if (customerResult.delivered) stamps.customer_notified_at = now;
    if (adminPushResult.delivered) stamps.admin_push_notified_at = now;
    if (customerPushResult.delivered) stamps.customer_push_notified_at = now;
    if (Object.keys(stamps).length) await service.from("orders").update(stamps).eq("id", order.id);
    return json({
      ok: true,
      admin: adminResult,
      customer: customerResult,
      adminPush: adminPushResult,
      customerPush: customerPushResult,
      customerEmail: customerEmailResult,
    }, 200, origin);
  }

  const alreadySent = order.customer_notified_at && order.updated_at &&
    new Date(order.customer_notified_at).getTime() >= new Date(order.updated_at).getTime();
  const eventKey = `updated:${String(order.admin_version ?? order.updated_at ?? order.id)}`.slice(0, 160);
  const updateText = `${brand} order ${order.order_number} is now ${String(order.status).replaceAll("_", " ")}. Estimated arrival: ${eta}.${order.waybill_url ? ` Track/waybill: ${order.waybill_url}` : ""}`;
  const pushAlreadySent = order.customer_push_notified_at && order.updated_at &&
    new Date(order.customer_push_notified_at).getTime() >= new Date(order.updated_at).getTime();
  const emailEligible = ["processing", "confirmed", "shipped", "delivered", "cancelled"]
    .includes(String(order.status));
  const [customerResult, customerPushResult, customerEmailResult] = await Promise.all([
    !order.whatsapp_opt_in_at
      ? Promise.resolve({ sent: false, skipped: true, delivered: false, reason: "Customer did not opt in." })
      : alreadySent
      ? Promise.resolve({ sent: true, skipped: true, delivered: true })
      : deliverWithClaim(service, order.id, eventKey, "customer_whatsapp", () => sendWhatsApp(
        normalizePhone(order.contact_phone),
        Deno.env.get("WHATSAPP_CUSTOMER_UPDATE_TEMPLATE") || null,
        [order.contact_name, order.order_number, String(order.status).replaceAll("_", " "), eta, order.waybill_url || "Not available"],
        updateText,
      )),
    pushAlreadySent
      ? Promise.resolve({ status: "sent", configured: true, attempted: 0, sent: 0, failed: 0, expired: 0, delivered: true })
      : deliverWithClaim(service, order.id, eventKey, "customer_push", () => sendPushToUsers(service, [order.user_id], {
        title: `Order ${order.order_number} updated`,
        body: `${brand} marked your order ${String(order.status).replaceAll("_", " ")}. Estimated arrival: ${eta}.`,
        url: `dashboard.html?tab=orders&order=${encodeURIComponent(order.order_number)}`,
        tag: `customer-order-${order.id}`,
        data: { orderId: order.id, orderNumber: order.order_number, audience: "customer" },
      })),
    emailEligible
      ? deliverQueuedOrderEmail(
        service,
        order as OrderEmailRecord & { admin_version?: number },
        `order:${order.id}:status:${order.status}`,
      )
      : Promise.resolve({ sent: false, queued: false, skipped: true, status: "not_applicable" }),
  ]);
  const stamps: Record<string, string> = {};
  const now = new Date().toISOString();
  if (customerResult.delivered) stamps.customer_notified_at = now;
  if (customerPushResult.delivered) stamps.customer_push_notified_at = now;
  if (Object.keys(stamps).length) await service.from("orders").update(stamps).eq("id", order.id);
  return json({
    ok: true,
    customer: customerResult,
    customerPush: customerPushResult,
    customerEmail: customerEmailResult,
  }, 200, origin);
});
