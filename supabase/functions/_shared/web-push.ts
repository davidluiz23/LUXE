/// <reference types="npm:@types/web-push@3.6.4" />
import webPush from "npm:web-push@3.6.7";

type ServiceClient = {
  from: (table: string) => any;
};

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
};

export type PushDelivery = {
  status: "sent" | "unavailable" | "not_configured" | "failed";
  configured: boolean;
  attempted: number;
  sent: number;
  failed: number;
  expired: number;
};

type StoredSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_secret: string;
  failure_count: number;
};

function vapidDetails() {
  const publicKey = Deno.env.get("WEB_PUSH_VAPID_PUBLIC_KEY")?.trim();
  const privateKey = Deno.env.get("WEB_PUSH_VAPID_PRIVATE_KEY")?.trim();
  const subject = (
    Deno.env.get("WEB_PUSH_VAPID_SUBJECT") ||
    Deno.env.get("LUXE_SITE_URL") ||
    "mailto:notifications@alkebulan.store"
  ).trim();

  if (!publicKey || !privateKey || !/^(mailto:|https:\/\/)/i.test(subject)) return null;
  return { publicKey, privateKey, subject };
}

function emptyDelivery(status: PushDelivery["status"], configured = false): PushDelivery {
  return { status, configured, attempted: 0, sent: 0, failed: 0, expired: 0 };
}

function safePayload(payload: PushPayload) {
  return JSON.stringify({
    title: String(payload.title || "ALKebulan").slice(0, 100),
    body: String(payload.body || "You have a new update.").slice(0, 500),
    tag: String(payload.tag || "alkebulan-update").slice(0, 120),
    icon: payload.icon || "assets/brand/alkebulan-mark.svg",
    badge: payload.badge || "assets/brand/alkebulan-mark.svg",
    data: {
      ...(payload.data || {}),
      url: String(payload.url || "dashboard.html?tab=notifications").slice(0, 1000),
    },
  });
}

export function webPushPublicKey(): string | null {
  return vapidDetails()?.publicKey || null;
}

export async function sendPushToUsers(
  service: ServiceClient,
  userIds: string[],
  payload: PushPayload,
): Promise<PushDelivery> {
  const vapid = vapidDetails();
  if (!vapid) return emptyDelivery("not_configured");

  const recipients = Array.from(new Set(userIds.filter(Boolean)));
  if (!recipients.length) return emptyDelivery("unavailable", true);

  const { data, error } = await service
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth_secret,failure_count")
    .in("user_id", recipients)
    .is("disabled_at", null);

  if (error) {
    console.error("[web-push] Could not load subscriptions:", error.message);
    return emptyDelivery("failed", true);
  }

  const subscriptions = (data || []) as StoredSubscription[];
  if (!subscriptions.length) return emptyDelivery("unavailable", true);

  const message = safePayload(payload);
  const results = await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webPush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth_secret },
      }, message, {
        TTL: 60 * 60 * 24,
        urgency: "normal",
        vapidDetails: vapid,
      });

      await service.from("push_subscriptions").update({
        failure_count: 0,
        disabled_at: null,
        last_success_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", subscription.id);
      return "sent" as const;
    } catch (error) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 0);
      if (statusCode === 404 || statusCode === 410) {
        await service.from("push_subscriptions").delete().eq("id", subscription.id);
        return "expired" as const;
      }

      console.error("[web-push] Delivery failed:", statusCode || "unknown");
      const nextFailures = Number(subscription.failure_count || 0) + 1;
      await service.from("push_subscriptions").update({
        failure_count: nextFailures,
        disabled_at: nextFailures >= 5 ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq("id", subscription.id);
      return "failed" as const;
    }
  }));

  const sent = results.filter((result) => result === "sent").length;
  const expired = results.filter((result) => result === "expired").length;
  const failed = results.filter((result) => result === "failed").length;
  return {
    status: sent > 0 ? "sent" : failed > 0 ? "failed" : "unavailable",
    configured: true,
    attempted: subscriptions.length,
    sent,
    failed,
    expired,
  };
}

export async function sendPushToAdmins(
  service: ServiceClient,
  payload: PushPayload,
): Promise<PushDelivery> {
  const { data, error } = await service
    .from("admin_users")
    .select("user_id")
    .in("role", ["owner", "admin"]);
  if (error) {
    console.error("[web-push] Could not load administrators:", error.message);
    return emptyDelivery("failed", Boolean(vapidDetails()));
  }
  return await sendPushToUsers(service, (data || []).map((row: { user_id: string }) => row.user_id), payload);
}

export async function sendPushToAllUsers(
  service: ServiceClient,
  payload: PushPayload,
): Promise<PushDelivery> {
  const { data, error } = await service
    .from("push_subscriptions")
    .select("user_id")
    .is("disabled_at", null)
    .limit(1000);
  if (error) {
    console.error("[web-push] Could not load push audience:", error.message);
    return emptyDelivery("failed", Boolean(vapidDetails()));
  }
  const userIds: string[] = Array.from(
    new Set<string>((data || []).map((row: { user_id: string }) => String(row.user_id))),
  );
  return await sendPushToUsers(service, userIds, payload);
}
