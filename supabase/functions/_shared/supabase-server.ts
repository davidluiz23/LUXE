import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.4";

// Edge functions use the service client against tables/RPCs whose generated
// database types are not bundled in this static site repository.
// deno-lint-ignore no-explicit-any
export type SupabaseServiceClient = SupabaseClient<any, "public", "public", any, any>;

function isNewSecretKey(value: unknown): value is string {
  return typeof value === "string" && /^sb_secret_[A-Za-z0-9_-]{20,}$/.test(value);
}

function isLegacyServiceRoleKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as Record<string, unknown>;
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

/**
 * Resolve one explicitly named Supabase secret key. Never select the first
 * value from SUPABASE_SECRET_KEYS: projects can contain several independently
 * scoped/rotated keys and JSON property order is not an authorization policy.
 */
export function getSupabaseServiceKey(): string | null {
  const singleSecret = Deno.env.get("SUPABASE_SECRET_KEY");
  if (isNewSecretKey(singleSecret)) return singleSecret;

  const keyMap = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keyMap) {
    try {
      const parsed = JSON.parse(keyMap) as Record<string, unknown>;
      const requestedName = Deno.env.get("LUXE_SUPABASE_SECRET_KEY_NAME")?.trim() || "default";
      const namedSecret = parsed[requestedName];
      if (isNewSecretKey(namedSecret)) return namedSecret;
    } catch {
      // Fall through to the validated legacy key during a staged migration.
    }
  }

  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return isLegacyServiceRoleKey(legacy) ? legacy : null;
}
