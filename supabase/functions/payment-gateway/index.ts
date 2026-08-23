import { createClient } from "npm:@supabase/supabase-js@2";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

function getServiceKey(): string | null {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!secretKeys) return null;
  try {
    return Object.values(JSON.parse(secretKeys)).find(
      (value) => typeof value === "string" && value.length > 20,
    ) as string || null;
  } catch { return null; }
}

function originFor(request: Request): string | null {
  const allowed = (Deno.env.get("LUXE_ALLOWED_ORIGINS") || Deno.env.get("LUXE_SITE_URL") || "")
    .split(",").map((v) => v.trim()).filter(Boolean)
    .map((v) => { try { return new URL(v).origin; } catch { return ""; } }).filter(Boolean);
  const origin = request.headers.get("origin");
  if (!allowed.length) return null;
  if (!origin) return allowed[0];
  return allowed.includes(origin) ? origin : null;
}

function json(body: Record<string, unknown>, status: number, origin: string) {
  return new Response(JSON.stringify(body), { status, headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-paystack-signature",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  }});
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function normalizePhone(value: unknown): string {
  let phone = String(value || "").replace(/\D/g, "");
  const country = (Deno.env.get("WHATSAPP_DEFAULT_COUNTRY_CODE") || "234").replace(/\D/g, "");
  if (phone.startsWith("00")) phone = phone.slice(2);
  if (phone.startsWith("0")) phone = country + phone.slice(1);
  return phone;
}

function paymentMethodFields(data: Record<string, unknown>) {
  const authorization = (data.authorization || {}) as Record<string, unknown>;
  const clean = (value: unknown, max = 60) => String(value || "")
    .trim().replace(/[^a-zA-Z0-9 .&_-]/g, "").slice(0, max);
  const channel = clean(data.channel || authorization.channel, 30).toLowerCase() || null;
  const cardType = clean(authorization.card_type || authorization.brand, 30);
  const bank = clean(authorization.bank, 60);
  const last4 = String(authorization.last4 || "").replace(/\D/g, "").slice(-4);
  const labelParts = channel === "card"
    ? [cardType || "Card", last4 ? `ending ${last4}` : "", bank]
    : [channel || "Paystack", bank];
  return {
    payment_channel: channel,
    payment_method_label: labelParts.filter(Boolean).join(" · ").slice(0, 140) || null,
  };
}

function fetchWithTimeout(input: string, init: RequestInit = {}, timeoutMs = 12000) {
  return fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

async function notifyAdminOfPayment(order: Record<string, unknown>, reference: string) {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const to = normalizePhone(Deno.env.get("WHATSAPP_ADMIN_NUMBER"));
  if (!token || !phoneNumberId || !to) return;
  const templateName = Deno.env.get("WHATSAPP_ADMIN_PAYMENT_TEMPLATE");
  const total = `${String(order.currency || "USD").toUpperCase()} ${Number(order.total || 0).toFixed(2)}`;
  const body = templateName ? {
    messaging_product: "whatsapp", to, type: "template",
    template: {
      name: templateName,
      language: { code: Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE") || "en" },
      components: [{ type: "body", parameters: [order.order_number, total, reference].map((text) => ({ type: "text", text: String(text) })) }],
    },
  } : {
    messaging_product: "whatsapp", to, type: "text",
    text: { preview_url: false, body: `PAYMENT CONFIRMED\nOrder: ${order.order_number}\nTotal: ${total}\nReference: ${reference}` },
  };
  const version = Deno.env.get("WHATSAPP_GRAPH_VERSION") || "v23.0";
  const response = await fetchWithTimeout(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) console.error("[payment-gateway] Admin payment WhatsApp failed:", response.status, await response.text());
}

function notifyAdminInBackground(order: Record<string, unknown>, reference: string) {
  EdgeRuntime.waitUntil(
    notifyAdminOfPayment(order, reference).catch((error) => {
      console.error("[payment-gateway] Background WhatsApp error:", error);
    }),
  );
}

Deno.serve(async (request) => {
  const origin = originFor(request);
  if (!origin) return new Response("Origin not allowed", { status: 403 });
  if (request.method === "OPTIONS") return json({ ok: true }, 200, origin);
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = getServiceKey();
  const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!supabaseUrl || !serviceKey || !paystackKey) return json({ error: "server_not_configured" }, 500, origin);
  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const rawBody = await request.text();
  let body: Record<string, unknown>;
  try { body = JSON.parse(rawBody); } catch { return json({ error: "invalid_json" }, 400, origin); }

  if (body.event) {
    const signature = request.headers.get("x-paystack-signature") || "";
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(paystackKey), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
    const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
    if (!safeEqual(expected, signature)) return json({ error: "invalid_signature" }, 401, origin);

    if (body.event === "charge.success") {
      const data = body.data as Record<string, unknown>;
      const metadata = (data?.metadata || {}) as Record<string, unknown>;
      const orderId = String(metadata.order_id || "");
      const reference = String(data?.reference || "");
      const { data: order } = await service.from("orders").select("id,order_number,total,currency,payment_reference,payment_status").eq("id", orderId).maybeSingle();
      const expectedAmount = Math.round(Number(order?.total || 0) * 100);
      if (order && order.payment_reference === reference && Number(data?.amount) === expectedAmount &&
          String(data?.currency || "").toUpperCase() === String(order.currency).toUpperCase() && data?.status === "success") {
        const { data: paidOrder } = await service.from("orders")
          .update({ payment_status: "paid", status: "processing", admin_seen_at: null, updated_at: new Date().toISOString(), ...paymentMethodFields(data) })
          .eq("id", order.id).neq("payment_status", "paid").select("id").maybeSingle();
        if (paidOrder) notifyAdminInBackground(order, reference);
      }
    }
    return json({ ok: true }, 200, origin);
  }

  const authorization = request.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  const { data: authData, error: authError } = await service.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "authentication_required" }, 401, origin);
  if (Deno.env.get("PAYSTACK_ENABLED") !== "true") return json({ error: "payments_temporarily_disabled" }, 503, origin);

  const action = String(body.action || "");
  const orderId = String(body.orderId || "");
  const { data: order } = await service.from("orders").select("*").eq("id", orderId).eq("user_id", authData.user.id).maybeSingle();
  if (!order || order.payment_provider !== "paystack") return json({ error: "order_not_found" }, 404, origin);

  if (action === "initialize") {
    if (order.payment_status === "paid") return json({ error: "order_already_paid" }, 409, origin);
    const reference = `${order.order_number}-${crypto.randomUUID().slice(0, 8)}`;
    const channels = (Deno.env.get("PAYSTACK_CHANNELS") || "card,bank,ussd,bank_transfer")
      .split(",").map((value) => value.trim()).filter(Boolean);
    let response: Response;
    try {
      response = await fetchWithTimeout("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: { "Authorization": `Bearer ${paystackKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: order.contact_email,
          amount: Math.round(Number(order.total) * 100),
          currency: order.currency,
          reference,
          channels,
          callback_url: Deno.env.get("PAYSTACK_CALLBACK_URL") || `${Deno.env.get("LUXE_SITE_URL")}/dashboard.html?payment=return`,
          metadata: { order_id: order.id, order_number: order.order_number },
        }),
      });
    } catch (error) {
      console.error("[payment-gateway] Initialization request failed:", error);
      return json({ error: "payment_provider_unavailable" }, 502, origin);
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.status) return json({ error: "payment_initialization_failed" }, 502, origin);
    await service.from("orders").update({ payment_reference: reference, updated_at: new Date().toISOString() }).eq("id", order.id);
    return json({ ok: true, authorizationUrl: payload.data.authorization_url, reference }, 200, origin);
  }

  if (action === "verify") {
    if (!order.payment_reference) return json({ error: "payment_not_initialized" }, 400, origin);
    let response: Response;
    try {
      response = await fetchWithTimeout(`https://api.paystack.co/transaction/verify/${encodeURIComponent(order.payment_reference)}`, {
        headers: { "Authorization": `Bearer ${paystackKey}` },
      });
    } catch (error) {
      console.error("[payment-gateway] Verification request failed:", error);
      return json({ error: "payment_provider_unavailable" }, 502, origin);
    }
    const payload = await response.json().catch(() => ({}));
    const valid = response.ok && payload.status && payload.data?.status === "success" &&
      Number(payload.data?.amount) === Math.round(Number(order.total) * 100) &&
      payload.data?.reference === order.payment_reference &&
      String(payload.data?.currency || "").toUpperCase() === String(order.currency).toUpperCase();
    if (!valid) return json({ ok: false, status: payload.data?.status || "unverified" }, 200, origin);
    const { data: paidOrder } = await service.from("orders")
      .update({ payment_status: "paid", status: "processing", admin_seen_at: null, updated_at: new Date().toISOString(), ...paymentMethodFields(payload.data as Record<string, unknown>) })
      .eq("id", order.id).neq("payment_status", "paid").select("id").maybeSingle();
    if (paidOrder) notifyAdminInBackground(order, order.payment_reference);
    return json({ ok: true, status: "paid" }, 200, origin);
  }

  return json({ error: "invalid_action" }, 400, origin);
});
