import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import {
  getSupabaseServiceKey,
  type SupabaseServiceClient,
} from "../_shared/supabase-server.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

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
    "X-Content-Type-Options": "nosniff",
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

async function notifyAdminOfPayment(
  order: Record<string, unknown>,
  reference: string,
  state: "paid" | "review_required" = "paid",
) {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const to = normalizePhone(Deno.env.get("WHATSAPP_ADMIN_NUMBER"));
  if (!token || !phoneNumberId || !to) return;
  const templateName = Deno.env.get("WHATSAPP_ADMIN_PAYMENT_TEMPLATE");
  const total = `${String(order.currency || "USD").toUpperCase()} ${Number(order.total || 0).toFixed(2)}`;
  const heading = state === "review_required"
    ? "PAYMENT NEEDS MANUAL REVIEW"
    : "PAYMENT CONFIRMED";
  const body = templateName && state === "paid" ? {
    messaging_product: "whatsapp", to, type: "template",
    template: {
      name: templateName,
      language: { code: Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE") || "en" },
      components: [{ type: "body", parameters: [order.order_number, total, reference].map((text) => ({ type: "text", text: String(text) })) }],
    },
  } : {
    messaging_product: "whatsapp", to, type: "text",
    text: { preview_url: false, body: `${heading}\nOrder: ${order.order_number}\nTotal: ${total}\nReference: ${reference}` },
  };
  const version = Deno.env.get("WHATSAPP_GRAPH_VERSION") || "v23.0";
  const response = await fetchWithTimeout(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) console.error("[payment-gateway] Admin payment WhatsApp failed:", response.status, await response.text());
}

function notifyAdminInBackground(
  order: Record<string, unknown>,
  reference: string,
  state: "paid" | "review_required" = "paid",
) {
  EdgeRuntime.waitUntil(
    notifyAdminOfPayment(order, reference, state).catch((error) => {
      console.error("[payment-gateway] Background WhatsApp error:", error);
    }),
  );
}

type PaymentState = {
  state?: string;
  order?: Record<string, unknown>;
};

async function applyVerifiedPayment(
  service: SupabaseServiceClient,
  orderId: string,
  reference: string,
  amountInMinorUnits: unknown,
  currency: unknown,
  providerData: Record<string, unknown>,
): Promise<PaymentState> {
  const minorAmount = Number(amountInMinorUnits);
  if (!Number.isSafeInteger(minorAmount) || minorAmount < 0) {
    return { state: "mismatch" };
  }
  const method = paymentMethodFields(providerData);
  const { data, error } = await service.rpc("service_mark_order_paid_v1", {
    p_order_id: orderId,
    p_reference: reference,
    p_amount: minorAmount / 100,
    p_currency: String(currency || ""),
    p_channel: method.payment_channel,
    p_method_label: method.payment_method_label,
  });
  if (error) {
    console.error("[payment-gateway] Could not apply verified payment:", error.message);
    return { state: "error" };
  }
  return (data || { state: "error" }) as PaymentState;
}

function validCallbackUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ||
      (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname));
  } catch {
    return false;
  }
}

Deno.serve(async (request) => {
  const origin = originFor(request);
  if (!origin) return new Response("Origin not allowed", { status: 403 });
  if (request.method === "OPTIONS") return json({ ok: true }, 200, origin);
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = getSupabaseServiceKey();
  const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!supabaseUrl || !serviceKey || !paystackKey) return json({ error: "server_not_configured" }, 500, origin);
  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 65_536) return json({ error: "request_too_large" }, 413, origin);
  const rawBody = await request.text();
  if (rawBody.length > 65_536) return json({ error: "request_too_large" }, 413, origin);
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
      if (orderId && reference && data?.status === "success") {
        const result = await applyVerifiedPayment(
          service, orderId, reference, data.amount, data.currency, data,
        );
        if (result.state === "error") {
          return json({ error: "payment_state_unavailable" }, 500, origin);
        }
        if (["paid", "review_required"].includes(result.state || "") && result.order) {
          notifyAdminInBackground(
            result.order,
            reference,
            result.state as "paid" | "review_required",
          );
        } else if (!["already_paid", "already_review_required", "mismatch", "not_found"].includes(result.state || "")) {
          console.error("[payment-gateway] Unexpected payment state:", result.state);
        }
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
    if (order.status === "cancelled" || order.inventory_released_at) {
      return json({ error: "order_expired" }, 409, origin);
    }
    const reference = `${order.order_number}-${crypto.randomUUID().slice(0, 8)}`;
    const { data: preparation, error: preparationError } = await service.rpc(
      "service_prepare_payment_initialization",
      { p_order_id: order.id, p_user_id: authData.user.id, p_reference: reference },
    );
    if (preparationError) {
      console.error("[payment-gateway] Initialization claim failed:", preparationError.message);
      return json({ error: "payment_initialization_failed" }, 500, origin);
    }
    const prepared = (preparation || {}) as Record<string, unknown>;
    if (prepared.state === "ready") {
      return json({
        ok: true,
        authorizationUrl: prepared.authorizationUrl,
        reference: prepared.reference,
        reused: true,
      }, 200, origin);
    }
    if (prepared.state === "paid") return json({ error: "order_already_paid" }, 409, origin);
    if (["cancelled", "expired"].includes(String(prepared.state))) {
      return json({ error: "order_expired" }, 409, origin);
    }
    if (prepared.state === "initializing") {
      return json({ error: "payment_initialization_in_progress" }, 409, origin);
    }
    if (prepared.initialize !== true || typeof prepared.reference !== "string") {
      return json({ error: "payment_initialization_failed" }, 500, origin);
    }
    const claimedReference = prepared.reference;
    const allowedChannels = new Set([
      "card", "bank", "ussd", "qr", "mobile_money", "bank_transfer", "eft",
    ]);
    const channels = (Deno.env.get("PAYSTACK_CHANNELS") || "card,bank,ussd,bank_transfer")
      .split(",").map((value) => value.trim()).filter((value) => allowedChannels.has(value));
    if (!channels.length) channels.push("card");
    const callbackUrl = Deno.env.get("PAYSTACK_CALLBACK_URL") ||
      `${Deno.env.get("LUXE_SITE_URL") || ""}/dashboard.html?payment=return`;
    if (!validCallbackUrl(callbackUrl)) {
      await service.rpc("service_finish_payment_initialization", {
        p_order_id: order.id, p_reference: claimedReference, p_succeeded: false,
      });
      return json({ error: "payment_callback_not_configured" }, 500, origin);
    }
    let response: Response;
    try {
      response = await fetchWithTimeout("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: { "Authorization": `Bearer ${paystackKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: order.contact_email,
          amount: Math.round(Number(order.total) * 100),
          currency: order.currency,
          reference: claimedReference,
          channels,
          callback_url: callbackUrl,
          metadata: { order_id: order.id, order_number: order.order_number },
        }),
      });
    } catch (error) {
      console.error("[payment-gateway] Initialization request failed:", error);
      await service.rpc("service_finish_payment_initialization", {
        p_order_id: order.id, p_reference: claimedReference, p_succeeded: false,
      });
      return json({ error: "payment_provider_unavailable" }, 502, origin);
    }
    const payload = await response.json().catch(() => ({}));
    const authorizationUrl = String(payload?.data?.authorization_url || "");
    const accessCode = String(payload?.data?.access_code || "");
    if (!response.ok || !payload.status || !validCallbackUrl(authorizationUrl) || !accessCode) {
      await service.rpc("service_finish_payment_initialization", {
        p_order_id: order.id, p_reference: claimedReference, p_succeeded: false,
      });
      return json({ error: "payment_initialization_failed" }, 502, origin);
    }
    const { data: saved, error: saveError } = await service.rpc(
      "service_finish_payment_initialization",
      {
        p_order_id: order.id,
        p_reference: claimedReference,
        p_authorization_url: authorizationUrl,
        p_access_code: accessCode,
        p_succeeded: true,
      },
    );
    if (saveError || saved !== true) {
      console.error("[payment-gateway] Initialization result was not saved:", saveError?.message);
      return json({ error: "order_state_changed" }, 409, origin);
    }
    return json({ ok: true, authorizationUrl, reference: claimedReference }, 200, origin);
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
    if (!response.ok || !payload.status || payload.data?.status !== "success") {
      return json({ ok: false, status: payload.data?.status || "unverified" }, 200, origin);
    }
    const result = await applyVerifiedPayment(
      service,
      order.id,
      order.payment_reference,
      payload.data?.amount,
      payload.data?.currency,
      payload.data as Record<string, unknown>,
    );
    if (result.state === "error") return json({ error: "payment_state_unavailable" }, 500, origin);
    if (["review_required", "already_review_required"].includes(result.state || "")) {
      if (result.state === "review_required" && result.order) {
        notifyAdminInBackground(result.order, order.payment_reference, "review_required");
      }
      return json({ ok: false, status: "review_required" }, 409, origin);
    }
    if (!["paid", "already_paid"].includes(result.state || "")) {
      return json({ ok: false, status: "unverified" }, 200, origin);
    }
    if (result.state === "paid" && result.order) {
      notifyAdminInBackground(result.order, order.payment_reference, "paid");
    }
    return json({ ok: true, status: "paid" }, 200, origin);
  }

  return json({ error: "invalid_action" }, 400, origin);
});
