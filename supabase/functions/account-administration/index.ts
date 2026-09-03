import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { getSupabaseServiceKey } from "../_shared/supabase-server.ts";

const MAX_REQUEST_BYTES = 16_384;

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

Deno.serve(async (request) => {
  const origin = allowedOrigin(request);
  if (!origin) return new Response("Origin not allowed", { status: 403 });
  if (request.method === "OPTIONS") return json({ ok: true }, 200, origin);
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return json({ error: "request_too_large" }, 413, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = getSupabaseServiceKey();
  if (!supabaseUrl || !serviceKey) return json({ error: "server_not_configured" }, 500, origin);
  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: authData, error: authError } = await service.auth.getUser(token);
  const admin = authData.user;
  if (authError || !admin) return json({ error: "authentication_required" }, 401, origin);
  const { data: adminRole } = await service.from("admin_users")
    .select("role").eq("user_id", admin.id).maybeSingle();
  if (!adminRole || !["owner", "admin"].includes(adminRole.role)) {
    return json({ error: "admin_permission_required" }, 403, origin);
  }

  let body: Record<string, unknown>;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return json({ error: "request_too_large" }, 413, origin);
    }
    const parsed = JSON.parse(rawBody || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_json");
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_json" }, 400, origin);
  }
  if (body.action !== "set_suspension") return json({ error: "invalid_action" }, 400, origin);

  const userId = String(body.userId || "");
  const suspended = body.suspended === true;
  const reason = String(body.reason || "").trim().replace(/\s+/g, " ");
  const confirmation = String(body.confirmation || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return json({ error: "invalid_customer" }, 400, origin);
  }
  if (reason.length < 5 || reason.length > 300) return json({ error: "invalid_reason" }, 400, origin);
  if (userId === admin.id) return json({ error: "cannot_suspend_self" }, 400, origin);

  const [{ data: targetAdmin }, targetResult] = await Promise.all([
    service.from("admin_users").select("role").eq("user_id", userId).maybeSingle(),
    service.auth.admin.getUserById(userId),
  ]);
  const target = targetResult.data.user;
  if (!target) return json({ error: "customer_not_found" }, 404, origin);
  if (targetAdmin) return json({ error: "admin_account_protected" }, 400, origin);
  const email = String(target.email || "").trim().toLowerCase();
  const requiredConfirmation = `${suspended ? "BAN" : "UNBAN"} ${email}`;
  if (confirmation !== requiredConfirmation) {
    return json({ error: "confirmation_mismatch", requiredConfirmation }, 400, origin);
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: rateError } = await service.from("admin_action_log")
    .select("id", { count: "exact", head: true })
    .eq("admin_user_id", admin.id)
    .in("action", ["customer_suspended", "customer_reactivated"])
    .gte("created_at", oneHourAgo);
  if (rateError) return json({ error: "rate_limit_check_failed" }, 503, origin);
  if ((count || 0) >= 20) return json({ error: "account_action_rate_limit" }, 429, origin);

  const { error: authUpdateError } = await service.auth.admin.updateUserById(userId, {
    ban_duration: suspended ? "876000h" : "none",
  });
  if (authUpdateError) {
    console.error("[account-administration] Auth update failed:", authUpdateError.message);
    return json({ error: "auth_update_failed" }, 502, origin);
  }

  const { error: recordError } = await service.rpc("service_record_account_suspension", {
    p_admin_user_id: admin.id,
    p_user_id: userId,
    p_suspended: suspended,
    p_reason: reason,
  });
  if (recordError) {
    console.error("[account-administration] Database update failed:", recordError.message);
    const rollback = await service.auth.admin.updateUserById(userId, {
      ban_duration: suspended ? "none" : "876000h",
    });
    if (rollback.error) console.error("[account-administration] Auth rollback failed:", rollback.error.message);
    return json({ error: "account_update_failed" }, 500, origin);
  }

  return json({ ok: true, accountStatus: suspended ? "suspended" : "active" }, 200, origin);
});
