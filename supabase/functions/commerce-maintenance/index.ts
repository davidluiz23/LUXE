import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import {
  escapeEmailHtml,
  sendBrevoEmail,
  type BrevoEmailResult,
} from "../_shared/brevo-email.ts";
import {
  sendOrderStatusEmail,
  type OrderEmailRecord,
} from "../_shared/order-email.ts";
import {
  getSupabaseServiceKey,
  type SupabaseServiceClient,
} from "../_shared/supabase-server.ts";
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

type EmailDeliveryClaim = {
  delivery_id: string;
  claim_token: string;
  kind: "order" | "site_update";
  order_id: string | null;
  site_update_id: string | null;
  template_key: string;
  recipient_email: string;
  recipient_name: string;
  payload: Record<string, unknown> | null;
};

function boundedInteger(value: string | undefined, fallback: number, maximum: number): number {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? Math.min(parsed, maximum)
    : fallback;
}

function safeSiteUrl(): string | null {
  try {
    const url = new URL((Deno.env.get("LUXE_SITE_URL") || "").trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

async function sendSiteUpdateEmail(
  claim: EmailDeliveryClaim,
): Promise<BrevoEmailResult> {
  const payload = claim.payload && typeof claim.payload === "object" ? claim.payload : {};
  const title = String(payload.title || "Store update").trim().slice(0, 160) || "Store update";
  const message = String(payload.message || "There is a new update from our store.")
    .trim()
    .slice(0, 8_000) || "There is a new update from our store.";
  const brand = (Deno.env.get("BRAND_NAME") || "ALKEBULAN").trim().slice(0, 80) || "ALKEBULAN";
  const name = claim.recipient_name || "Customer";
  const siteUrl = safeSiteUrl();
  const safeBrand = escapeEmailHtml(brand);
  const safeName = escapeEmailHtml(name);
  const safeTitle = escapeEmailHtml(title);
  const safeMessage = escapeEmailHtml(message).replace(/\n/g, "<br>");
  const safeUrl = siteUrl ? escapeEmailHtml(siteUrl) : "";
  const textContent = [
    `Hello ${name},`,
    "",
    title,
    message,
    siteUrl ? `Visit ${brand}: ${siteUrl}` : null,
    "",
    `${brand} Customer Care`,
    "You can turn off site-update emails from your account notification settings.",
  ].filter((line) => line !== null).join("\n");

  return await sendBrevoEmail({
    toEmail: claim.recipient_email,
    toName: name,
    subject: `${brand}: ${title}`,
    textContent,
    htmlContent: `
      <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px;color:#171717;line-height:1.65">
        <p style="font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#777">${safeBrand}</p>
        <p>Hello ${safeName},</p>
        <h1 style="font-size:24px;margin:18px 0 8px">${safeTitle}</h1>
        <p>${safeMessage}</p>
        ${siteUrl ? `<p><a href="${safeUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px">Visit ${safeBrand}</a></p>` : ""}
        <p style="color:#777">${safeBrand} Customer Care</p>
        <p style="font-size:12px;color:#888">You can turn off site-update emails from your account notification settings.</p>
      </div>`,
    tag: "luxe-site-update",
    idempotencyKey: claim.delivery_id,
    logContext: "commerce-maintenance",
  });
}

async function sendClaimedEmail(
  service: SupabaseServiceClient,
  claim: EmailDeliveryClaim,
) {
  let deliveryResult: BrevoEmailResult | null = null;
  let queueResult: "sent" | "retry" | "failed" | "suppressed" = "failed";
  let errorMessage: string | null = null;

  try {
    if (claim.kind === "order" && claim.order_id) {
      const { data: order, error } = await service
        .from("orders")
        .select("*, order_items(*)")
        .eq("id", claim.order_id)
        .maybeSingle();
      if (error) throw error;
      if (!order) {
        queueResult = "suppressed";
        errorMessage = "Order no longer exists.";
      } else {
        const payload = claim.payload && typeof claim.payload === "object" ? claim.payload : {};
        const status = String(payload.status || order.status || "updated")
          .toLowerCase()
          .replace(/[^a-z_]/g, "") || "updated";
        const rawVersion = Number(payload.admin_version ?? order.admin_version ?? 0);
        const version = Number.isSafeInteger(rawVersion) && rawVersion >= 0 ? rawVersion : 0;
        const eventKey = claim.template_key === "order_received"
          ? `created:${order.id}`
          : `status:${version}:${status}`;
        deliveryResult = await sendOrderStatusEmail({
          ...order,
          contact_email: claim.recipient_email,
          contact_name: claim.recipient_name || order.contact_name,
        } as OrderEmailRecord, eventKey, {
          idempotencyKey: claim.delivery_id,
          logContext: "commerce-maintenance",
        });
      }
    } else if (claim.kind === "site_update" && claim.site_update_id) {
      deliveryResult = await sendSiteUpdateEmail(claim);
    } else {
      queueResult = "suppressed";
      errorMessage = "Queued email has no valid source record.";
    }

    if (deliveryResult) {
      queueResult = deliveryResult.sent
        ? "sent"
        : deliveryResult.status === "invalid_recipient"
        ? "suppressed"
        : deliveryResult.retryable
        ? "retry"
        : "failed";
      errorMessage = deliveryResult.sent
        ? null
        : deliveryResult.reason || deliveryResult.status;
    }
  } catch (error) {
    queueResult = "retry";
    errorMessage = error instanceof Error ? error.message : "Email delivery failed.";
    console.error("[commerce-maintenance] Queued email failed:", error);
  }

  const { error: finishError } = await service.rpc(
    "service_finish_email_delivery_v1",
    {
      p_claim_token: claim.claim_token,
      p_result: queueResult,
      p_provider_message_id: deliveryResult?.messageId || null,
      p_error: errorMessage,
    },
  );
  if (finishError) {
    console.error("[commerce-maintenance] Email queue completion failed:", finishError.message);
  }
  return { result: queueResult, finishError: Boolean(finishError) };
}

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

  const emailSummary = {
    configured: Boolean(
      (Deno.env.get("BREVO_API_KEY") || "").trim() &&
        (Deno.env.get("BREVO_SENDER_EMAIL") || "").trim()
    ),
    claimed: 0,
    sent: 0,
    retry: 0,
    failed: 0,
    suppressed: 0,
  };
  let emailError = false;
  if (emailSummary.configured) {
    const emailBatchSize = boundedInteger(Deno.env.get("BREVO_EMAIL_BATCH_SIZE"), 12, 25);
    const broadcastDailyLimit = boundedInteger(
      Deno.env.get("BREVO_BROADCAST_DAILY_LIMIT"),
      200,
      10_000,
    );
    const { data, error } = await service.rpc(
      "service_claim_email_deliveries_v1",
      {
        p_limit: emailBatchSize,
        p_broadcast_daily_limit: broadcastDailyLimit,
      },
    );
    if (error) {
      emailError = true;
      console.error("[commerce-maintenance] Email queue claim failed:", error.message);
    } else {
      const claims = (data || []) as EmailDeliveryClaim[];
      emailSummary.claimed = claims.length;
      for (let offset = 0; offset < claims.length; offset += 4) {
        const results = await Promise.all(
          claims.slice(offset, offset + 4).map((claim) => sendClaimedEmail(service, claim)),
        );
        for (const result of results) {
          emailSummary[result.result] += 1;
          if (result.finishError) emailError = true;
        }
      }
    }
  }

  const { error: emailCleanupError } = await service.rpc(
    "service_cleanup_email_deliveries_v1",
  );
  if (emailCleanupError) {
    emailError = true;
    console.error("[commerce-maintenance] Email retention cleanup failed:", emailCleanupError.message);
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
    ok: !releaseError && !retentionError && !pushError && !emailError,
    inventoryReservationsReleased: Number(released || 0),
    retention: retention || null,
    pushBroadcasts: pushSummary,
    emails: emailSummary,
    media: { claimed, deleted, failed },
  }, releaseError || retentionError || pushError || emailError ? 500 : 200);
});
