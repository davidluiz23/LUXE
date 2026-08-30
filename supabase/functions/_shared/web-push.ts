/// <reference types="npm:@types/web-push@3.6.4" />
import webPush from "npm:web-push@3.6.7";
import type { SupabaseServiceClient } from "./supabase-server.ts";

type ServiceClient = SupabaseServiceClient;

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
  status: "sent" | "unavailable" | "not_configured" | "failed" | "partial";
  configured: boolean;
  complete: boolean;
  attempted: number;
  sent: number;
  failed: number;
  expired: number;
};

export type StoredPushSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_secret: string;
  failure_count: number;
};

export type PushSubscriptionResult = {
  id: string;
  result: "sent" | "expired" | "failed" | "invalid";
  error?: string;
};

const PUSH_QUERY_PAGE = 500;
const PUSH_USER_QUERY_BATCH = 100;
const PUSH_CONCURRENCY = 20;

export function isAllowedPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 20 || value.length > 2048) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    const hostname = url.hostname.toLowerCase();
    const configured = (Deno.env.get("WEB_PUSH_ALLOWED_HOSTS") || "")
      .split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
    const defaults = [
      "fcm.googleapis.com",
      "updates.push.services.mozilla.com",
      "web.push.apple.com",
    ];
    const exactHosts = new Set([...defaults, ...configured]);
    return exactHosts.has(hostname) || hostname.endsWith(".notify.windows.com");
  } catch {
    return false;
  }
}

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
  return { status, configured, complete: true, attempted: 0, sent: 0, failed: 0, expired: 0 };
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

function mergeDeliveries(parts: PushDelivery[], complete = true): PushDelivery {
  const summary = parts.reduce((result, part) => ({
    attempted: result.attempted + part.attempted,
    sent: result.sent + part.sent,
    failed: result.failed + part.failed,
    expired: result.expired + part.expired,
  }), { attempted: 0, sent: 0, failed: 0, expired: 0 });
  const isComplete = complete && parts.every((part) => part.complete);
  return {
    status: !isComplete
      ? (summary.attempted > 0 ? "partial" : "failed")
      : summary.sent > 0 ? "sent" : summary.failed > 0 ? "failed" : "unavailable",
    configured: true,
    complete: isComplete,
    ...summary,
  };
}

async function deliverSubscriptionResults(
  service: ServiceClient,
  subscriptions: StoredPushSubscription[],
  payload: PushPayload,
  vapid: NonNullable<ReturnType<typeof vapidDetails>>,
): Promise<PushSubscriptionResult[]> {
  const message = safePayload(payload);
  const deliver = async (subscription: StoredPushSubscription): Promise<PushSubscriptionResult> => {
    if (!isAllowedPushEndpoint(subscription.endpoint)) {
      await service.from("push_subscriptions").delete().eq("id", subscription.id);
      return {
        id: subscription.id,
        result: "invalid",
        error: "Push endpoint is outside the configured provider allowlist.",
      };
    }

    try {
      await webPush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth_secret },
      }, message, {
        TTL: 60 * 60 * 24,
        urgency: "normal",
        vapidDetails: vapid,
      });

      const now = new Date().toISOString();
      await service.from("push_subscriptions").update({
        failure_count: 0,
        disabled_at: null,
        last_success_at: now,
        updated_at: now,
      }).eq("id", subscription.id);
      return { id: subscription.id, result: "sent" };
    } catch (error) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 0);
      if (statusCode === 404 || statusCode === 410) {
        await service.from("push_subscriptions").delete().eq("id", subscription.id);
        return { id: subscription.id, result: "expired" };
      }

      console.error("[web-push] Delivery failed:", statusCode || "unknown");
      const nextFailures = Number(subscription.failure_count || 0) + 1;
      await service.from("push_subscriptions").update({
        failure_count: nextFailures,
        disabled_at: nextFailures >= 5 ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq("id", subscription.id);
      return {
        id: subscription.id,
        result: "failed",
        error: statusCode ? `Push provider returned ${statusCode}.` : "Push delivery failed.",
      };
    }
  };

  const results: PushSubscriptionResult[] = [];
  for (let index = 0; index < subscriptions.length; index += PUSH_CONCURRENCY) {
    results.push(...await Promise.all(
      subscriptions.slice(index, index + PUSH_CONCURRENCY).map(deliver),
    ));
  }
  return results;
}

export async function deliverPushSubscriptionBatch(
  service: ServiceClient,
  subscriptions: StoredPushSubscription[],
  payload: PushPayload,
): Promise<{ configured: boolean; results: PushSubscriptionResult[] }> {
  const vapid = vapidDetails();
  if (!vapid) return { configured: false, results: [] };
  return {
    configured: true,
    results: await deliverSubscriptionResults(service, subscriptions, payload, vapid),
  };
}

async function deliverSubscriptions(
  service: ServiceClient,
  subscriptions: StoredPushSubscription[],
  payload: PushPayload,
  vapid: NonNullable<ReturnType<typeof vapidDetails>>,
): Promise<PushDelivery> {
  if (!subscriptions.length) return emptyDelivery("unavailable", true);
  const results = await deliverSubscriptionResults(service, subscriptions, payload, vapid);

  const sent = results.filter((item) => item.result === "sent").length;
  const expired = results.filter((item) => item.result === "expired").length;
  const failed = results.filter((item) => item.result === "failed" || item.result === "invalid").length;
  return {
    status: sent > 0 ? "sent" : failed > 0 ? "failed" : "unavailable",
    configured: true,
    complete: true,
    attempted: subscriptions.length,
    sent,
    failed,
    expired,
  };
}

async function deliverSubscriptionPages(
  service: ServiceClient,
  payload: PushPayload,
  vapid: NonNullable<ReturnType<typeof vapidDetails>>,
  userIds: string[],
): Promise<PushDelivery> {
  const deliveries: PushDelivery[] = [];
  let lastId: string | null = null;

  while (true) {
    let query = service
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth_secret,failure_count")
      .is("disabled_at", null)
      .order("id", { ascending: true })
      .limit(PUSH_QUERY_PAGE);
    query = query.in("user_id", userIds);
    if (lastId) query = query.gt("id", lastId);

    const { data, error } = await query;
    if (error) {
      console.error("[web-push] Could not load subscriptions:", error.message);
      return mergeDeliveries(deliveries, false);
    }

    const page = (data || []) as StoredPushSubscription[];
    if (!page.length) break;
    deliveries.push(await deliverSubscriptions(service, page, payload, vapid));
    lastId = page[page.length - 1].id;
    if (page.length < PUSH_QUERY_PAGE) break;
  }

  return mergeDeliveries(deliveries);
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

  const deliveries: PushDelivery[] = [];
  for (let index = 0; index < recipients.length; index += PUSH_USER_QUERY_BATCH) {
    const delivery = await deliverSubscriptionPages(
      service,
      payload,
      vapid,
      recipients.slice(index, index + PUSH_USER_QUERY_BATCH),
    );
    deliveries.push(delivery);
    if (!delivery.complete) return mergeDeliveries(deliveries, false);
  }
  return mergeDeliveries(deliveries);
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
