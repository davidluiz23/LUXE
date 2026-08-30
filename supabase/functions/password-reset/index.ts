import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { getSupabaseServiceKey } from "../_shared/supabase-server.ts";

function allowedOrigin(request: Request): string | null {
  const configured = (
    Deno.env.get("LUXE_ALLOWED_ORIGINS") || Deno.env.get("LUXE_SITE_URL") || ""
  ).split(",").map((value) => value.trim()).filter(Boolean).map((value) => {
    try { return new URL(value).origin; } catch { return ""; }
  }).filter(Boolean);
  const origin = request.headers.get("origin");
  if (!configured.length) return null;
  if (!origin) return configured[0];
  return configured.includes(origin) ? origin : null;
}

function responseHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
  };
}

const genericResponse = (origin: string, status = 200) =>
  new Response(JSON.stringify({ ok: true }), {
    status,
    headers: responseHeaders(origin),
  });

function safeRedirect(
  redirectTo: unknown,
  requestOrigin: string | null,
): string | null {
  if (typeof redirectTo !== "string" || !requestOrigin) {
    return null;
  }

  try {
    const url = new URL(redirectTo);
    const origin = new URL(requestOrigin);

    if (url.origin !== origin.origin) {
      return null;
    }

    if (!url.pathname.endsWith("/reset-password.html")) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

Deno.serve(async (request) => {
  const origin = allowedOrigin(request);
  if (!origin) return new Response("Origin not allowed", { status: 403 });
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: responseHeaders(origin) });
  }

  if (request.method !== "POST") {
    return genericResponse(origin, 405);
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 4096) return genericResponse(origin, 413);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = getSupabaseServiceKey();
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ||
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY");

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    console.error(
      "[password-reset] Missing Supabase environment variables.",
    );
    return genericResponse(origin);
  }

  try {
    const rawBody = await request.text();
    if (rawBody.length > 4096) return genericResponse(origin, 413);
    const body = JSON.parse(rawBody || "{}") as Record<string, unknown>;

    const email =
      typeof body?.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    const portal =
      body?.portal === "admin" ? "admin" : "customer";

    const redirectTo = safeRedirect(
      body?.redirectTo,
      request.headers.get("origin"),
    );

    // Never reveal malformed/not-found/wrong-portal information.
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !redirectTo) {
      return genericResponse(origin);
    }

    const serviceClient = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const { data: accountType, error: typeError } =
      await serviceClient.rpc(
        "password_reset_account_type",
        { p_email: email },
      );

    if (typeError) {
      console.error(
        "[password-reset] Account type lookup failed:",
        typeError.message,
      );
      return genericResponse(origin);
    }

    const eligible =
      (portal === "admin" && accountType === "admin") ||
      (portal === "customer" &&
        accountType === "customer");

    if (!eligible) {
      return genericResponse(origin);
    }

    // Use the public Auth client only after the server-side account
    // classification succeeds. Supabase Auth sends the actual recovery
    // email using the project's configured email provider/template.
    const publicClient = createClient(
      supabaseUrl,
      anonKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const { error: resetError } =
      await publicClient.auth.resetPasswordForEmail(
        email,
        { redirectTo },
      );

    if (resetError) {
      console.error(
        "[password-reset] Recovery email request failed:",
        resetError.message,
      );
    }

    return genericResponse(origin);
  } catch (error) {
    console.error("[password-reset] Unexpected error:", error);
    return genericResponse(origin);
  }
});
