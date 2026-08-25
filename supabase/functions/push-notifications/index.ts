import { createClient } from "npm:@supabase/supabase-js@2";
import { sendPushToAllUsers, webPushPublicKey } from "../_shared/web-push.ts";

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

function allowedOrigin(request: Request): string | null {
  const configured = (Deno.env.get("LUXE_ALLOWED_ORIGINS") || Deno.env.get("LUXE_SITE_URL") || "")
    .split(",").map((value) => value.trim()).filter(Boolean)
    .map((value) => { try { return new URL(value).origin; } catch { return ""; } })
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
      "Vary": "Origin",
    },
  });
}

function validEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 20 || value.length > 2048) return false;
  try { return new URL(value).protocol === "https:"; }
  catch { return false; }
}

Deno.serve(async (request) => {
  const origin = allowedOrigin(request);
  if (!origin) return new Response("Origin not allowed", { status: 403 });
  if (request.method === "OPTIONS") return json({ ok: true }, 200, origin);
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = getServiceKey();
  if (!supabaseUrl || !serviceKey) return json({ error: "server_not_configured" }, 500, origin);

  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "authentication_required" }, 401, origin);

  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await service.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "invalid_session" }, 401, origin);

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return json({ error: "invalid_json" }, 400, origin); }

  if (body.action === "config") {
    const publicKey = webPushPublicKey();
    if (!publicKey) return json({ error: "push_not_configured" }, 503, origin);
    return json({ publicKey }, 200, origin);
  }

  if (body.action === "broadcast_update") {
    const { data: adminRole } = await service.from("admin_users")
      .select("role").eq("user_id", authData.user.id).maybeSingle();
    if (!adminRole || !["owner", "admin"].includes(adminRole.role)) {
      return json({ error: "admin_permission_required" }, 403, origin);
    }
    const title = String(body.title || "").trim().replace(/\s+/g, " ");
    const message = String(body.message || "").trim();
    if (title.length < 3 || title.length > 100 || message.length < 3 || message.length > 1000) {
      return json({ error: "invalid_update" }, 400, origin);
    }
    const delivery = await sendPushToAllUsers(service, {
      title,
      body: message,
      url: "index.html#site-updates",
      tag: `site-update-${Date.now()}`,
      data: { notificationKind: "site_update" },
    });
    return json({ ok: true, delivery }, 200, origin);
  }

  const subscription = body.subscription && typeof body.subscription === "object"
    ? body.subscription as Record<string, unknown>
    : {};
  const endpoint = String(subscription.endpoint || body.endpoint || "");

  if (body.action === "unsubscribe") {
    if (!validEndpoint(endpoint)) return json({ error: "invalid_subscription" }, 400, origin);
    const { error } = await service.from("push_subscriptions")
      .delete().eq("user_id", authData.user.id).eq("endpoint", endpoint);
    if (error) return json({ error: "unsubscribe_failed" }, 500, origin);
    return json({ ok: true }, 200, origin);
  }

  if (body.action !== "subscribe") return json({ error: "invalid_action" }, 400, origin);
  const keys = subscription.keys && typeof subscription.keys === "object"
    ? subscription.keys as Record<string, unknown>
    : {};
  const p256dh = String(keys.p256dh || "");
  const authSecret = String(keys.auth || "");
  const expirationTime = subscription.expirationTime === null || subscription.expirationTime === undefined
    ? null
    : Number(subscription.expirationTime);

  if (!webPushPublicKey()) return json({ error: "push_not_configured" }, 503, origin);
  if (!validEndpoint(endpoint) || p256dh.length < 20 || p256dh.length > 512 || authSecret.length < 8 || authSecret.length > 512) {
    return json({ error: "invalid_subscription" }, 400, origin);
  }
  if (expirationTime !== null && (!Number.isSafeInteger(expirationTime) || expirationTime < 0)) {
    return json({ error: "invalid_expiration" }, 400, origin);
  }

  const { error } = await service.from("push_subscriptions").upsert({
    user_id: authData.user.id,
    endpoint,
    p256dh,
    auth_secret: authSecret,
    expiration_time: expirationTime,
    user_agent: String(request.headers.get("user-agent") || "").slice(0, 500) || null,
    failure_count: 0,
    disabled_at: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "endpoint" });

  if (error) {
    console.error("[push-notifications] Subscription save failed:", error.message);
    return json({ error: "subscription_failed" }, 500, origin);
  }
  return json({ ok: true }, 200, origin);
});
