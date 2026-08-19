import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const genericResponse = () =>
  new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: corsHeaders,
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
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return genericResponse();
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey =
    Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    console.error(
      "[password-reset] Missing Supabase environment variables.",
    );
    return genericResponse();
  }

  try {
    const body = await request.json().catch(() => ({}));

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
    if (!email || !redirectTo) {
      return genericResponse();
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
      return genericResponse();
    }

    const eligible =
      (portal === "admin" && accountType === "admin") ||
      (portal === "customer" &&
        accountType === "customer");

    if (!eligible) {
      return genericResponse();
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

    return genericResponse();
  } catch (error) {
    console.error("[password-reset] Unexpected error:", error);
    return genericResponse();
  }
});
