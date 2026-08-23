import { createClient } from "npm:@supabase/supabase-js@2";

type SignupAction = "request" | "check" | "complete";

const TOKEN_TTL_MINUTES = 60;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_SENDS_PER_HOUR = 5;

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
      "Vary": "Origin",
    },
  });
}

function getServiceKey(): string | null {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;

  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!secretKeys) return null;

  try {
    const parsed = JSON.parse(secretKeys);
    const values = Object.values(parsed);
    const first = values.find(
      (value) => typeof value === "string" && value.length > 20,
    );
    return typeof first === "string" ? first : null;
  } catch {
    return null;
  }
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
  return (Deno.env.get("BRAND_NAME") || "LUXE").trim().slice(0, 80) || "LUXE";
}

function genericRequestSuccess(origin: string) {
  return json(
    {
      ok: true,
      message:
        `If this email can be used for a new ${brandName()} account, a verification link has been sent.`,
    },
    200,
    origin,
  );
}

async function sendVerificationEmail(
  email: string,
  fullName: string,
  verificationUrl: string,
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

  const response = await fetch(
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
            <p style="margin:28px 0;">
              <a href="${verificationUrl}"
                 style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:13px 22px;border-radius:6px;">
                Verify Email
              </a>
            </p>
            <p>After opening the link, you’ll choose a password and finish creating your account.</p>
            <p style="color:#777;font-size:13px;">This link expires in ${TOKEN_TTL_MINUTES} minutes.</p>
          </div>
        `,
        textContent:
          `Hello ${fullName},\n\n` +
          `Verify your email to continue creating your ${brand} account:\n${verificationUrl}\n\n` +
          `Your account has not been created yet. This link expires in ${TOKEN_TTL_MINUTES} minutes.`,
        tags: ["luxe-signup-verification"],
      }),
    },
  );

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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = getServiceKey();
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

  const body = await request.json().catch(() => ({}));
  const action = body?.action as SignupAction;

  if (action === "request") {
    const email = normalizeEmail(body?.email);
    const fullName = normalizeName(body?.fullName);

    if (
      !validEmail(email) ||
      fullName.length < 2 ||
      fullName.length > 100
    ) {
      return json({ error: "invalid_signup_details" }, 400, origin);
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

    const { data: currentPending, error: pendingError } =
      await service
        .from("pending_signups")
        .select(
          "email,last_sent_at,send_count,window_started_at",
        )
        .eq("email", email)
        .maybeSingle();

    if (pendingError) {
      console.error(
        "[signup-flow] Pending signup lookup failed:",
        pendingError.message,
      );
      return json({ error: "service_unavailable" }, 503, origin);
    }

    const now = Date.now();

    if (currentPending?.last_sent_at) {
      const lastSent =
        new Date(currentPending.last_sent_at).getTime();

      if (
        Number.isFinite(lastSent) &&
        now - lastSent < RESEND_COOLDOWN_SECONDS * 1000
      ) {
        return genericRequestSuccess(origin);
      }
    }

    let sendCount = 1;
    let windowStartedAt = new Date(now).toISOString();

    if (currentPending?.window_started_at) {
      const windowStart =
        new Date(currentPending.window_started_at).getTime();

      if (
        Number.isFinite(windowStart) &&
        now - windowStart < 60 * 60 * 1000
      ) {
        if (
          Number(currentPending.send_count || 0) >=
          MAX_SENDS_PER_HOUR
        ) {
          return genericRequestSuccess(origin);
        }

        sendCount =
          Number(currentPending.send_count || 0) + 1;
        windowStartedAt = currentPending.window_started_at;
      }
    }

    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(
      now + TOKEN_TTL_MINUTES * 60 * 1000,
    ).toISOString();

    const { error: upsertError } =
      await service.from("pending_signups").upsert(
        {
          email,
          full_name: fullName,
          token_hash: tokenHash,
          expires_at: expiresAt,
          last_sent_at: new Date(now).toISOString(),
          send_count: sendCount,
          window_started_at: windowStartedAt,
        },
        { onConflict: "email" },
      );

    if (upsertError) {
      console.error(
        "[signup-flow] Pending signup save failed:",
        upsertError.message,
      );
      return json({ error: "service_unavailable" }, 503, origin);
    }

    const verificationUrl =
      new URL("verify-signup.html", siteUrl);

    verificationUrl.searchParams.set("token", token);

    const sent = await sendVerificationEmail(
      email,
      fullName,
      verificationUrl.toString(),
    );

    if (!sent) {
      // Let the same user retry instead of leaving a dead token behind.
      await service
        .from("pending_signups")
        .delete()
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

    if (!/^[a-f0-9]{64}$/i.test(token)) {
      return json({ valid: false }, 200, origin);
    }

    const tokenHash = await sha256Hex(token);

    const { data, error } = await service
      .from("pending_signups")
      .select("email,expires_at")
      .eq("token_hash", tokenHash)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (error) {
      console.error(
        "[signup-flow] Token check failed:",
        error.message,
      );
      return json({ valid: false }, 200, origin);
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

    if (
      !/^[a-f0-9]{64}$/i.test(token) ||
      password.length < 8 ||
      password.length > 128
    ) {
      return json(
        { error: "invalid_or_expired_signup" },
        400,
        origin,
      );
    }

    const tokenHash = await sha256Hex(token);

    const { data: pending, error: pendingError } =
      await service
        .from("pending_signups")
        .select("email,full_name,expires_at")
        .eq("token_hash", tokenHash)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

    if (pendingError || !pending) {
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
          signup_source: "luxe_verified_email_link",
        },
      });

    if (createError || !created?.user) {
      console.error(
        "[signup-flow] Auth user creation failed:",
        createError?.message || "Unknown error",
      );

      return json(
        {
          error:
            createError?.message ||
            "Could not create account.",
        },
        400,
        origin,
      );
    }

    await service
      .from("pending_signups")
      .delete()
      .eq("token_hash", tokenHash);

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
