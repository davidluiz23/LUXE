import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { getSupabaseServiceKey } from "../_shared/supabase-server.ts";
import {
  deliverPushSubscriptionBatch,
  type PushPayload,
  type StoredPushSubscription,
  webPushPublicKey,
} from "../_shared/web-push.ts";

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function sha1Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

type DeletionClaim = {
  id: string;
  public_id: string;
  claim_token: string;
};

type BroadcastClaim = {
  delivery_id: string;
  claim_token: string;
  broadcast_id: string;
  subscription_id: string;
  endpoint: string;
  p256dh: string;
  auth_secret: string;
  failure_count: number;
  title: string;
  message: string;
  target_url: string;
  tag: string;
  data: Record<string, unknown>;
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const expectedSecret = Deno.env.get("COMMERCE_MAINTENANCE_SECRET") || "";
  const suppliedSecret = request.headers.get("x-maintenance-secret") || "";
  if (expectedSecret.length < 32 || !safeEqual(expectedSecret, suppliedSecret)) {
    return json({ error: "not_authorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = getSupabaseServiceKey();
  if (!supabaseUrl || !serviceKey) return json({ error: "server_not_configured" }, 500);

  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: released, error: releaseError } = await service.rpc(
    "service_release_expired_order_inventory",
    { p_limit: 250 },
  );
  if (releaseError) {
    console.error("[commerce-maintenance] Reservation release failed:", releaseError.message);
  }

  const { data: retention, error: retentionError } = await service.rpc(
    "service_cleanup_commerce_operations_v1",
  );
  if (retentionError) {
    console.error("[commerce-maintenance] Retention cleanup failed:", retentionError.message);
  }

  const pushSummary = {
    configured: Boolean(webPushPublicKey()),
    claimed: 0,
    sent: 0,
    expired: 0,
    failed: 0,
    invalid: 0,
  };
  let pushError = false;

  if (pushSummary.configured) {
    const { data, error } = await service.rpc(
      "service_claim_push_broadcast_deliveries_v1",
      { p_limit: 25 },
    );
    if (error) {
      pushError = true;
      console.error("[commerce-maintenance] Push broadcast claim failed:", error.message);
    } else {
      const claims = (data || []) as BroadcastClaim[];
      pushSummary.claimed = claims.length;
      const byBroadcast = new Map<string, BroadcastClaim[]>();
      for (const claim of claims) {
        const group = byBroadcast.get(claim.broadcast_id) || [];
        group.push(claim);
        byBroadcast.set(claim.broadcast_id, group);
      }

      const finishResults: Array<Record<string, unknown>> = [];
      for (const group of byBroadcast.values()) {
        const first = group[0];
        const payload: PushPayload = {
          title: first.title,
          body: first.message,
          url: first.target_url,
          tag: first.tag,
          data: first.data || {},
        };
        const subscriptions: StoredPushSubscription[] = group.map((claim) => ({
          id: claim.subscription_id,
          endpoint: claim.endpoint,
          p256dh: claim.p256dh,
          auth_secret: claim.auth_secret,
          failure_count: Number(claim.failure_count || 0),
        }));
        const delivery = await deliverPushSubscriptionBatch(service, subscriptions, payload);
        if (!delivery.configured) {
          pushSummary.configured = false;
          break;
        }

        const claimsBySubscription = new Map(
          group.map((claim) => [claim.subscription_id, claim]),
        );
        for (const result of delivery.results) {
          const claim = claimsBySubscription.get(result.id);
          if (!claim) continue;
          pushSummary[result.result] += 1;
          finishResults.push({
            claim_token: claim.claim_token,
            result: result.result,
            error: result.error || null,
          });
        }
      }

      if (finishResults.length) {
        const { error: finishError } = await service.rpc(
          "service_finish_push_broadcast_deliveries_v1",
          { p_results: finishResults },
        );
        if (finishError) {
          pushError = true;
          console.error("[commerce-maintenance] Push broadcast completion failed:", finishError.message);
        }
      }
    }
  }

  const cloudName = String(Deno.env.get("CLOUDINARY_CLOUD_NAME") || "").trim();
  const apiKey = String(Deno.env.get("CLOUDINARY_API_KEY") || "").trim();
  const apiSecret = String(Deno.env.get("CLOUDINARY_API_SECRET") || "").trim();
  let claimed = 0;
  let deleted = 0;
  let failed = 0;

  if (cloudName && apiKey && apiSecret && /^[A-Za-z0-9_-]+$/.test(cloudName)) {
    const { data, error } = await service.rpc("service_claim_cloudinary_deletions", {
      p_limit: 25,
    });
    if (error) {
      console.error("[commerce-maintenance] Media claim failed:", error.message);
    } else {
      const claims = (data || []) as DeletionClaim[];
      claimed = claims.length;

      for (let offset = 0; offset < claims.length; offset += 5) {
        const batch = claims.slice(offset, offset + 5);
        const results = await Promise.all(batch.map(async (claim) => {
          let succeeded = false;
          let errorMessage = "Cloudinary deletion failed";
          try {
            if (!/^[A-Za-z0-9][A-Za-z0-9_./-]{0,254}$/.test(claim.public_id) ||
                /(^|\/)\.\.(\/|$)/.test(claim.public_id)) {
              throw new Error("Invalid queued public ID");
            }
            const timestamp = Math.floor(Date.now() / 1000).toString();
            const signatureBase = `invalidate=true&public_id=${claim.public_id}&timestamp=${timestamp}`;
            const signature = await sha1Hex(`${signatureBase}${apiSecret}`);
            const response = await fetch(
              `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
              {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                  public_id: claim.public_id,
                  timestamp,
                  invalidate: "true",
                  api_key: apiKey,
                  signature,
                }),
                signal: AbortSignal.timeout(12_000),
              },
            );
            const payload = await response.json().catch(() => ({}));
            succeeded = response.ok && ["ok", "not found"].includes(String(payload?.result));
            if (!succeeded) errorMessage = `Cloudinary returned ${response.status}`;
          } catch (error) {
            errorMessage = error instanceof Error ? error.message : errorMessage;
          }

          const { error: finishError } = await service.rpc(
            "service_finish_cloudinary_deletion",
            {
              p_claim_token: claim.claim_token,
              p_succeeded: succeeded,
              p_error: succeeded ? null : errorMessage,
            },
          );
          if (finishError) {
            console.error("[commerce-maintenance] Media completion failed:", finishError.message);
            return false;
          }
          return succeeded;
        }));
        deleted += results.filter(Boolean).length;
        failed += results.filter((result) => !result).length;
      }
    }
  }

  return json({
    ok: !releaseError && !retentionError && !pushError,
    inventoryReservationsReleased: Number(released || 0),
    retention: retention || null,
    pushBroadcasts: pushSummary,
    media: { claimed, deleted, failed },
  }, releaseError || retentionError || pushError ? 500 : 200);
});
