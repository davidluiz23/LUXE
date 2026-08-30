import {
  createClient,
  type SupabaseClient,
} from "npm:@supabase/supabase-js@2.112.4";
import { getSupabaseServiceKey } from "../_shared/supabase-server.ts";

type SignupAction = "request" | "check" | "complete";

const TOKEN_TTL_MINUTES = 15;
const CODE_TTL_MINUTES = 15;
const MAX_CODE_ATTEMPTS = 5;
const MAX_REQUEST_BYTES = 16_384;

function json(
  body: Record<string, unknown>,
  status: number,
  origin: string,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Vary": "Origin",
    },
  });
}

function configuredOrigins(): string[] {
  const raw =
    Deno.env.get("LUXE_ALLOWED_ORIGINS") ||
    Deno.env.get("LUXE_SITE_URL") ||
    "";

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      try {
        return new URL(value).origin;
      } catch {
        return "";
      }
    })
    .filter(Boolean);
}

function safeRequestOrigin(request: Request): string | null {
  const allowed = configuredOrigins();
  if (!allowed.length) return null;

  const requestOrigin = request.headers.get("origin");

  // Non-browser/manual requests may omit Origin. Use the primary site origin.
  if (!requestOrigin) return allowed[0];

  return allowed.includes(requestOrigin) ? requestOrigin : null;
}

function normalizeEmail(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLowerCase()
    : "";
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeName(value: unknown): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ")
    : "";
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function randomCode(): string {
  const range = 1_000_000;
  const unbiasedLimit = Math.floor(0x1_0000_0000 / range) * range;
  let value: number;

  do {
    value = crypto.getRandomValues(new Uint32Array(1))[0];
  } while (value >= unbiasedLimit);

  return (value % range).toString().padStart(6, "0");
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function primarySiteUrl(): string | null {
  const raw = Deno.env.get("LUXE_SITE_URL");
  if (!raw) return null;

  try {
    return new URL(raw).toString();
  } catch {
    return null;
  }
}

function brandName(): string {
  return (Deno.env.get("BRAND_NAME") || "ALKEBULAN").trim().slice(0, 80) || "ALKEBULAN";
}

async function verifySignupCaptcha(token: unknown): Promise<boolean> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) return Deno.env.get("REQUIRE_SIGNUP_CAPTCHA") !== "true";
  if (typeof token !== "string" || token.length < 10 || token.length > 4096) return false;

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: token }),
        signal: AbortSignal.timeout(8_000),
      },
    );
    const payload = await response.json().catch(() => ({}));
    return response.ok && payload?.success === true;
  } catch (error) {
    console.error("[signup-flow] CAPTCHA verification failed:", error);
    return false;
  }
}

function genericRequestSuccess(origin: string) {
  return json(
    {
      ok: true,
      message:
        `If this email can be used for a new ${brandName()} account, a verification code and link have been sent.`,
    },
    200,
    origin,
  );
}

async function sendVerificationEmail(
  email: string,
  fullName: string,
  verificationUrl: string,
  verificationCode: string,
): Promise<boolean> {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  const senderEmail = Deno.env.get("BREVO_SENDER_EMAIL");
  const brand = brandName();
  const senderName = Deno.env.get("BREVO_SENDER_NAME") || brand;

  if (!apiKey || !senderEmail) {
    console.error(
      "[signup-flow] BREVO_API_KEY or BREVO_SENDER_EMAIL is missing.",
    );
    return false;
  }

  const escapedName = fullName
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  const escapedBrand = brand
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

  let response: Response;
  try {
    response = await fetch(
      "https://api.brevo.com/v3/smtp/email",
      {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "api-key": apiKey,
      },
        body: JSON.stringify({
        sender: {
          name: senderName,
          email: senderEmail,
        },
        to: [
          {
            name: fullName,
            email,
          },
        ],
        subject: `Verify your email to create your ${brand} account`,
        htmlContent: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#111;">
            <h1 style="font-size:26px;margin-bottom:12px;">${escapedBrand}</h1>
            <p>Hello ${escapedName},</p>
            <p>Confirm that this email belongs to you. Your ${escapedBrand} account has <strong>not</strong> been created yet.</p>
            <p style="margin:24px 0 10px;color:#777;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Your verification code</p>
            <p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:0 0 24px;">${verificationCode}</p>
            <p>Enter this code on the verification page, or use the secure button below.</p>
            <p style="margin:28px 0;">
              <a href="${verificationUrl}"
                 style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:13px 22px;border-radius:6px;">
                Verify Email
              </a>
            </p>
            <p>After verification, you'll choose a password and finish creating your account.</p>
            <p style="color:#777;font-size:13px;">The code and secure link expire in ${TOKEN_TTL_MINUTES} minutes.</p>
          </div>
        `,
        textContent:
          `Hello ${fullName},\n\n` +
          `Your verification code is: ${verificationCode}\n\n` +
          `Or open this secure link:\n${verificationUrl}\n\n` +
          `Your account has not been created yet. The code and secure link expire in ${TOKEN_TTL_MINUTES} minutes.`,
        tags: ["luxe-signup-verification"],
        }),
        signal: AbortSignal.timeout(12_000),
      },
    );
  } catch (error) {
    console.error("[signup-flow] Brevo request failed:", error);
    return false;
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(
      "[signup-flow] Brevo send failed:",
      response.status,
      detail,
    );
    return false;
  }

  return true;
}

async function recordFailedCodeAttempt(
  service: SupabaseClient<any, "public", "public", any, any>,
  email: string,
) {
  const { error } = await service.rpc(
    "increment_pending_signup_code_attempts",
    { p_email: email },
  );

  if (error) {
    console.error(
      "[signup-flow] Could not record failed code attempt:",
      error.message,
    );
  }
}

Deno.serve(async (request) => {
  const origin = safeRequestOrigin(request);

  if (!origin) {
    return new Response("Forbidden", { status: 403 });
  }

  if (request.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Vary": "Origin",
      },
    });
  }

  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, origin);
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return json({ error: "request_too_large" }, 413, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = getSupabaseServiceKey();
  const siteUrl = primarySiteUrl();

  if (!supabaseUrl || !serviceKey || !siteUrl) {
    console.error(
      "[signup-flow] Missing Supabase server credentials or LUXE_SITE_URL.",
    );
    return json({ error: "service_unavailable" }, 503, origin);
  }

  const service = createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const rawBody = await request.text();
  if (rawBody.length > MAX_REQUEST_BYTES) {
    return json({ error: "request_too_large" }, 413, origin);
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody || "{}");
  } catch {
    return json({ error: "invalid_json" }, 400, origin);
  }
  const action = body?.action as SignupAction;

  if (action === "request") {
    const email = normalizeEmail(body?.email);
    const fullName = normalizeName(body?.fullName);

    if (
      !validEmail(email) ||
      email.length > 254 ||
      fullName.length < 2 ||
      fullName.length > 100
    ) {
      return json({ error: "invalid_signup_details" }, 400, origin);
    }

    if (!await verifySignupCaptcha(body?.captchaToken)) {
      return json({ error: "captcha_required" }, 400, origin);
    }

    // Opportunistic cleanup keeps fake/uncompleted registrations temporary.
    await service
      .from("pending_signups")
      .delete()
      .lt("expires_at", new Date().toISOString());

    const { data: exists, error: existsError } =
      await service.rpc("deferred_signup_email_exists", {
        p_email: email,
      });

    if (existsError) {
      console.error(
        "[signup-flow] Existing-user lookup failed:",
        existsError.message,
      );
      return json({ error: "service_unavailable" }, 503, origin);
    }

    // Do not reveal whether an Auth account already exists.
    if (exists === true) {
      return genericRequestSuccess(origin);
    }

    const now = Date.now();
    const token = randomToken();
    const verificationCode = randomCode();
    const tokenHash = await sha256Hex(token);
    const codeHash = await sha256Hex(verificationCode);
    const expiresAt = new Date(
      now + TOKEN_TTL_MINUTES * 60 * 1000,
    ).toISOString();
    const codeExpiresAt = new Date(
      now + CODE_TTL_MINUTES * 60 * 1000,
    ).toISOString();

    const { data: reservation, error: upsertError } = await service.rpc(
      "service_store_pending_signup_v1",
      {
        p_email: email,
        p_full_name: fullName,
        p_token_hash: tokenHash,
        p_code_hash: codeHash,
        p_expires_at: expiresAt,
        p_code_expires_at: codeExpiresAt,
      },
    );

    if (upsertError) {
      console.error(
        "[signup-flow] Pending signup save failed:",
        upsertError.message,
      );
      return json({ error: "service_unavailable" }, 503, origin);
    }
    if (reservation?.allowed !== true) return genericRequestSuccess(origin);

    const verificationUrl =
      new URL("verify-signup.html", siteUrl);

    verificationUrl.searchParams.set("token", token);

    const sent = await sendVerificationEmail(
      email,
      fullName,
      verificationUrl.toString(),
      verificationCode,
    );

    if (!sent) {
      // Invalidate the unsent token while retaining its rate-limit counters.
      await service
        .from("pending_signups")
        .update({
          expires_at: new Date().toISOString(),
          code_expires_at: new Date().toISOString(),
        })
        .eq("email", email)
        .eq("token_hash", tokenHash);
    }

    // Always generic: no user/account enumeration.
    return genericRequestSuccess(origin);
  }

  if (action === "check") {
    const token =
      typeof body?.token === "string"
        ? body.token.trim()
        : "";
    const email = normalizeEmail(body?.email);
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    let query = service
      .from("pending_signups")
      .select("email,expires_at,code_expires_at");

    if (/^[a-f0-9]{64}$/i.test(token)) {
      query = query
        .eq("token_hash", await sha256Hex(token))
        .gt("expires_at", new Date().toISOString());
    } else if (validEmail(email) && /^\d{6}$/.test(code)) {
      query = query
        .eq("email", email)
        .eq("code_hash", await sha256Hex(code))
        .gt("code_expires_at", new Date().toISOString())
        .lt("failed_code_attempts", MAX_CODE_ATTEMPTS);
    } else {
      return json({ valid: false }, 200, origin);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error(
        "[signup-flow] Verification check failed:",
        error.message,
      );
      return json({ valid: false }, 200, origin);
    }

    if (!data && validEmail(email) && /^\d{6}$/.test(code)) {
      await recordFailedCodeAttempt(service, email);
    }

    return json({ valid: !!data }, 200, origin);
  }

  if (action === "complete") {
    const token =
      typeof body?.token === "string"
        ? body.token.trim()
        : "";
    const password =
      typeof body?.password === "string"
        ? body.password
        : "";
    const email = normalizeEmail(body?.email);
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    const hasToken = /^[a-f0-9]{64}$/i.test(token);
    const hasCode = validEmail(email) && /^\d{6}$/.test(code);

    if (
      (!hasToken && !hasCode) ||
      password.length < 8 ||
      password.length > 128
    ) {
      return json(
        { error: "invalid_or_expired_signup" },
        400,
        origin,
      );
    }

    let completionQuery = service
      .from("pending_signups")
      .delete()
      .select(
        "email,full_name,token_hash,code_hash,expires_at,code_expires_at,last_sent_at,send_count,window_started_at,created_at,failed_code_attempts",
      );

    if (hasToken) {
      completionQuery = completionQuery.eq(
        "token_hash",
        await sha256Hex(token),
      ).gt("expires_at", new Date().toISOString());
    } else {
      completionQuery = completionQuery
        .eq("email", email)
        .eq("code_hash", await sha256Hex(code))
        .gt("code_expires_at", new Date().toISOString())
        .lt("failed_code_attempts", MAX_CODE_ATTEMPTS);
    }

    const { data: pending, error: pendingError } =
      await completionQuery.maybeSingle();

    if (pendingError || !pending) {
      if (!hasToken && hasCode) {
        await recordFailedCodeAttempt(service, email);
      }

      return json(
        { error: "invalid_or_expired_signup" },
        400,
        origin,
      );
    }

    const { data: created, error: createError } =
      await service.auth.admin.createUser({
        email: pending.email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: pending.full_name,
        },
        app_metadata: {
          signup_source: "luxe_verified_email",
        },
      });

    if (createError || !created?.user) {
      console.error(
        "[signup-flow] Auth user creation failed:",
        createError?.message || "Unknown error",
      );

      const { error: restoreError } = await service
        .from("pending_signups")
        .upsert(pending, { onConflict: "email" });
      if (restoreError) {
        console.error(
          "[signup-flow] Could not restore signup claim:",
          restoreError.message,
        );
      }
      return json({ error: "account_creation_failed" }, 400, origin);
    }

    return json(
      {
        ok: true,
        email: pending.email,
        fullName: pending.full_name,
        userId: created.user.id,
      },
      200,
      origin,
    );
  }

  return json({ error: "invalid_action" }, 400, origin);
});
