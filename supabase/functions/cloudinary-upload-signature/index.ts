import { createClient } from "npm:@supabase/supabase-js@2";

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
      "X-Content-Type-Options": "nosniff",
      "Vary": "Origin",
    },
  });
}

async function sha1Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (request) => {
  const origin = allowedOrigin(request);
  if (!origin) return new Response("Origin not allowed", { status: 403 });
  if (request.method === "OPTIONS") return json({ ok: true }, 200, origin);
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 2048) return json({ error: "request_too_large" }, 413, origin);
  let body: { action?: unknown };
  try {
    const rawBody = await request.text();
    if (rawBody.length > 2048) return json({ error: "request_too_large" }, 413, origin);
    body = JSON.parse(rawBody);
  } catch {
    return json({ error: "invalid_json" }, 400, origin);
  }
  if (!body || typeof body !== "object" || body.action !== "sign_product_image") {
    return json({ error: "invalid_action" }, 400, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = getServiceKey();
  const cloudName = String(Deno.env.get("CLOUDINARY_CLOUD_NAME") || "").trim();
  const apiKey = String(Deno.env.get("CLOUDINARY_API_KEY") || "").trim();
  const apiSecret = String(Deno.env.get("CLOUDINARY_API_SECRET") || "").trim();
  const configuredFolder = String(
    Deno.env.get("CLOUDINARY_PRODUCT_FOLDER") || "alkebulan/products",
  ).trim();

  if (!supabaseUrl || !serviceKey || !cloudName || !apiKey || !apiSecret) {
    return json({ error: "cloudinary_not_configured" }, 503, origin);
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(cloudName) || !/^[a-zA-Z0-9_/-]+$/.test(configuredFolder)) {
    return json({ error: "invalid_cloudinary_configuration" }, 500, origin);
  }

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

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const publicId = crypto.randomUUID();
  const signedParams: Record<string, string> = {
    folder: configuredFolder,
    overwrite: "false",
    public_id: publicId,
    tags: "alkebulan-product",
    timestamp,
  };
  const signaturePayload = Object.entries(signedParams)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const signature = await sha1Hex(`${signaturePayload}${apiSecret}`);

  return json({
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    fields: { ...signedParams, api_key: apiKey, signature },
    expiresAt: Number(timestamp) + 300,
  }, 200, origin);
});
