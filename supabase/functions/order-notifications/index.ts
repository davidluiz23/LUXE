import { createClient } from "npm:@supabase/supabase-js@2";

type NotificationAction = "order_created" | "order_updated";

function getServiceKey(): string | null {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!secretKeys) return null;
  try {
    return Object.values(JSON.parse(secretKeys)).find(
      (value) => typeof value === "string" && value.length > 20,
    ) as string || null;
  } catch {
    return null;
  }
}

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
  return (Deno.env.get("BRAND_NAME") || "LUXE").trim().slice(0, 80) || "LUXE";
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
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    console.error("[order-notifications] WhatsApp send failed:", response.status, detail);
    return { sent: false, reason: `WhatsApp returned ${response.status}.` };
  }
  return { sent: true };
}

Deno.serve(async (request) => {
  const origin = allowedOrigin(request);
  if (!origin) return new Response("Origin not allowed", { status: 403 });
  if (request.method === "OPTIONS") return json({ ok: true }, 200, origin);
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = getServiceKey();
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
  try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400, origin); }
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

    const [adminResult, customerResult] = await Promise.all([
      order.admin_notified_at ? Promise.resolve({ sent: true, skipped: true }) : sendWhatsApp(
        normalizePhone(Deno.env.get("WHATSAPP_ADMIN_NUMBER")),
        Deno.env.get("WHATSAPP_ADMIN_ORDER_TEMPLATE") || null,
        [order.order_number, order.contact_name, order.contact_phone, itemSummary, total, addressText],
        adminText,
      ),
      !order.whatsapp_opt_in_at
        ? Promise.resolve({ sent: false, skipped: true, reason: "Customer did not opt in." })
        : order.customer_notified_at ? Promise.resolve({ sent: true, skipped: true }) : sendWhatsApp(
        normalizePhone(order.contact_phone),
        Deno.env.get("WHATSAPP_CUSTOMER_ORDER_TEMPLATE") || null,
        [order.contact_name, order.order_number, itemSummary, total],
        customerText,
      ),
    ]);

    const stamps: Record<string, string> = {};
    const now = new Date().toISOString();
    if (adminResult.sent) stamps.admin_notified_at = now;
    if (customerResult.sent) stamps.customer_notified_at = now;
    if (Object.keys(stamps).length) await service.from("orders").update(stamps).eq("id", order.id);
    return json({ ok: true, admin: adminResult, customer: customerResult }, 200, origin);
  }

  const alreadySent = order.customer_notified_at && order.updated_at &&
    new Date(order.customer_notified_at).getTime() >= new Date(order.updated_at).getTime();
  const updateText = `${brand} order ${order.order_number} is now ${String(order.status).replaceAll("_", " ")}. Estimated arrival: ${eta}.${order.waybill_url ? ` Track/waybill: ${order.waybill_url}` : ""}`;
  const customerResult = !order.whatsapp_opt_in_at
    ? { sent: false, skipped: true, reason: "Customer did not opt in." }
    : alreadySent
    ? { sent: true, skipped: true }
    : await sendWhatsApp(
      normalizePhone(order.contact_phone),
      Deno.env.get("WHATSAPP_CUSTOMER_UPDATE_TEMPLATE") || null,
      [order.contact_name, order.order_number, String(order.status).replaceAll("_", " "), eta, order.waybill_url || "Not available"],
      updateText,
    );
  if (customerResult.sent) {
    await service.from("orders").update({ customer_notified_at: new Date().toISOString() }).eq("id", order.id);
  }
  return json({ ok: true, customer: customerResult }, 200, origin);
});
