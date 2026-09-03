import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { getSupabaseServiceKey } from "../_shared/supabase-server.ts";

type VerificationAction = "request" | "verify";

const OTP_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_SENDS_PER_HOUR = 5;
const MAX_VERIFY_ATTEMPTS = 5;
const MAX_REQUEST_BYTES = 16_384;

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
      "Vary": "Origin",
    },
  });
}

function normalizePhone(value: unknown, countryCode: string): string | null {
  let phone = String(value || "").replace(/\D/g, "");
  const country = String(countryCode || "234").replace(/\D/g, "");
  if (phone.startsWith("00")) phone = phone.slice(2);
  else if (phone.startsWith("0")) phone = country + phone.slice(1);
  return /^[1-9][0-9]{6,14}$/.test(phone) ? `+${phone}` : null;
}

function generateOtp(): string {
  const maximum = 4_294_000_000;
  const random = new Uint32Array(1);
  do crypto.getRandomValues(random); while (random[0] >= maximum);
  return String(random[0] % 1_000_000).padStart(6, "0");
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

async function sendOtp(phone: string, code: string): Promise<boolean> {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const templateName = Deno.env.get("WHATSAPP_VERIFICATION_TEMPLATE");
  const graphVersion = Deno.env.get("WHATSAPP_GRAPH_VERSION") || "v23.0";
  if (!token || !phoneNumberId || !templateName) return false;

  const components: Record<string, unknown>[] = [{
    type: "body",
    parameters: [{ type: "text", text: code }],
  }];
  if ((Deno.env.get("WHATSAPP_VERIFICATION_COPY_CODE_BUTTON") || "true") === "true") {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: code }],
    });
  }

  const response = await fetch(
    `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone.slice(1),
        type: "template",
        template: {
          name: templateName,
          language: {
            code: Deno.env.get("WHATSAPP_VERIFICATION_TEMPLATE_LANGUAGE") ||
              Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE") || "en",
          },
          components,
        },
      }),
    },
  );

  if (!response.ok) {
    console.error("[whatsapp-verification] Meta send failed:", response.status, await response.text());
    return false;
  }
  return true;
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
  const otpSecret = Deno.env.get("WHATSAPP_OTP_SECRET") || "";
  if (!supabaseUrl || !serviceKey || otpSecret.length < 32) {
    return json({ error: "verification_not_configured" }, 503, origin);
  }

  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "authentication_required" }, 401, origin);

  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userResult, error: userError } = await service.auth.getUser(token);
  const user = userResult?.user;
  if (userError || !user) return json({ error: "authentication_required" }, 401, origin);

  let payload: Record<string, unknown>;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return json({ error: "request_too_large" }, 413, origin);
    }
    const parsed = JSON.parse(rawBody || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_json");
    payload = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_json" }, 400, origin);
  }

  const action = String(payload.action || "") as VerificationAction;
  if (action !== "request" && action !== "verify") {
    return json({ error: "invalid_action" }, 400, origin);
  }

  const { data: settings } = await service
    .from("commerce_settings")
    .select("whatsapp_default_country_code")
    .eq("singleton", true)
    .maybeSingle();
  const phone = normalizePhone(payload.phone, settings?.whatsapp_default_country_code || "234");
  if (!phone) return json({ error: "invalid_phone" }, 400, origin);

  if (action === "request") {
    if (!Deno.env.get("WHATSAPP_ACCESS_TOKEN") || !Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ||
      !Deno.env.get("WHATSAPP_VERIFICATION_TEMPLATE")) {
      return json({ error: "verification_not_configured" }, 503, origin);
    }

    const { data: owner } = await service
      .from("profiles")
      .select("id")
      .eq("whatsapp_phone", phone)
      .not("whatsapp_verified_at", "is", null)
      .maybeSingle();
    if (owner && owner.id !== user.id) return json({ error: "number_unavailable" }, 409, origin);
    if (owner?.id === user.id) return json({ ok: true, alreadyVerified: true, phone }, 200, origin);

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const [userCountResult, phoneCountResult, latestResult] = await Promise.all([
      service.from("whatsapp_verification_challenges").select("id", { count: "exact", head: true })
        .eq("user_id", user.id).gte("created_at", hourAgo),
      service.from("whatsapp_verification_challenges").select("id", { count: "exact", head: true })
        .eq("phone", phone).gte("created_at", hourAgo),
      service.from("whatsapp_verification_challenges").select("created_at")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if ((userCountResult.count || 0) >= MAX_SENDS_PER_HOUR ||
      (phoneCountResult.count || 0) >= MAX_SENDS_PER_HOUR) {
      return json({ error: "too_many_requests" }, 429, origin);
    }
    if (latestResult.data?.created_at) {
      const elapsed = (Date.now() - new Date(latestResult.data.created_at).getTime()) / 1000;
      if (elapsed < RESEND_COOLDOWN_SECONDS) {
        return json({
          error: "resend_too_soon",
          retryAfter: Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed),
        }, 429, origin);
      }
    }

    const code = generateOtp();
    const codeHash = await hmacHex(otpSecret, `${user.id}:${phone}:${code}`);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

    // Preserve rows for hourly rate counts while releasing expired/replaced
    // challenges from the unique active-challenge indexes.
    const consumedAt = new Date().toISOString();
    await service.from("whatsapp_verification_challenges")
      .update({ consumed_at: consumedAt })
      .is("consumed_at", null)
      .lte("expires_at", consumedAt);
    await service.from("whatsapp_verification_challenges")
      .update({ consumed_at: consumedAt })
      .eq("user_id", user.id)
      .is("consumed_at", null);

    const { data: challenge, error: insertError } = await service
      .from("whatsapp_verification_challenges")
      .insert({ user_id: user.id, phone, code_hash: codeHash, expires_at: expiresAt })
      .select("id")
      .single();
    if (insertError || !challenge) {
      console.error("[whatsapp-verification] Challenge insert failed:", insertError?.message);
      return json({ error: insertError?.code === "23505" ? "resend_too_soon" : "request_failed" },
        insertError?.code === "23505" ? 429 : 500, origin);
    }

    if (!await sendOtp(phone, code)) {
      await service.from("whatsapp_verification_challenges")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", challenge.id);
      return json({ error: "message_not_sent" }, 502, origin);
    }
    return json({ ok: true, expiresInSeconds: OTP_TTL_MINUTES * 60 }, 200, origin);
  }

  const code = String(payload.code || "").trim();
  if (!/^\d{6}$/.test(code)) return json({ error: "invalid_code" }, 400, origin);
  const { data: challenge } = await service
    .from("whatsapp_verification_challenges")
    .select("id,code_hash,attempts,expires_at")
    .eq("user_id", user.id)
    .eq("phone", phone)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!challenge || challenge.attempts >= MAX_VERIFY_ATTEMPTS ||
    new Date(challenge.expires_at).getTime() <= Date.now()) {
    return json({ error: "invalid_or_expired_code" }, 400, origin);
  }

  const { data: claimedAttempt } = await service.from("whatsapp_verification_challenges")
    .update({ attempts: challenge.attempts + 1 })
    .eq("id", challenge.id)
    .eq("attempts", challenge.attempts)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  if (!claimedAttempt) return json({ error: "invalid_or_expired_code" }, 400, origin);
  const submittedHash = await hmacHex(otpSecret, `${user.id}:${phone}:${code}`);
  if (!constantTimeEqual(submittedHash, challenge.code_hash)) {
    return json({ error: "invalid_or_expired_code" }, 400, origin);
  }

  const verifiedAt = new Date().toISOString();
  const { error: profileError } = await service
    .from("profiles")
    .update({ phone, whatsapp_phone: phone, whatsapp_verified_at: verifiedAt, updated_at: verifiedAt })
    .eq("id", user.id);
  if (profileError?.code === "23505") return json({ error: "number_unavailable" }, 409, origin);
  if (profileError) {
    console.error("[whatsapp-verification] Profile update failed:", profileError.message);
    return json({ error: "verification_failed" }, 500, origin);
  }

  await service.from("whatsapp_verification_challenges")
    .update({ consumed_at: verifiedAt })
    .eq("user_id", user.id)
    .is("consumed_at", null);
  return json({ ok: true, phone, verifiedAt }, 200, origin);
});
