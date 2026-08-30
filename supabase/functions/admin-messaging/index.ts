import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { sendPushToUsers } from "../_shared/web-push.ts";
import { getSupabaseServiceKey } from "../_shared/supabase-server.ts";

type DeliveryResult = { status: string; reference?: string };

function allowedOrigin(request: Request): string | null {
  const configured = (Deno.env.get("LUXE_ALLOWED_ORIGINS") || Deno.env.get("LUXE_SITE_URL") || "")
    .split(",").map((value) => value.trim()).filter(Boolean)
    .map((value) => { try { return new URL(value).origin; } catch { return ""; } })
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

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character] || character);
}

async function sendEmail(
  deliveryId: string,
  email: string | null,
  optedIn: boolean,
  name: string,
  title: string,
  message: string,
): Promise<DeliveryResult> {
  if (!optedIn) return { status: "not_opted_in" };
  if (!email) return { status: "unavailable" };
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("EMAIL_FROM");
  if (!apiKey || !from) return { status: "not_configured" };

  const brand = (Deno.env.get("BRAND_NAME") || "ALKEBULAN").trim().slice(0, 80) || "ALKEBULAN";
  const safeBrand = escapeHtml(brand);
  const safeName = escapeHtml(name);
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message).replace(/\n/g, "<br>");
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `luxe-admin-message-${deliveryId}`,
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: `${brand}: ${title}`,
        text: `Hello ${name},\n\n${message}\n\n${brand} Customer Care`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.65;color:#1b1b1b"><p>Hello ${safeName},</p><h2 style="font-size:20px">${safeTitle}</h2><p>${safeMessage}</p><p style="color:#777">${safeBrand} Customer Care</p></div>`,
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    console.error("[admin-messaging] Resend request failed:", error);
    return { status: "failed" };
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("[admin-messaging] Resend failed:", response.status, payload);
    return { status: "failed" };
  }
  return { status: "sent", reference: String(payload.id || "") };
}

async function sendWhatsApp(
  phone: string | null,
  optedIn: boolean,
  name: string,
  title: string,
  message: string,
): Promise<DeliveryResult> {
  if (!optedIn) return { status: "not_opted_in" };
  if (!phone) return { status: "unavailable" };
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const templateName = Deno.env.get("WHATSAPP_ADMIN_CUSTOMER_MESSAGE_TEMPLATE");
  if (!token || !phoneNumberId || !templateName) return { status: "not_configured" };

  const digits = phone.replace(/\D/g, "");
  const version = Deno.env.get("WHATSAPP_GRAPH_VERSION") || "v23.0";
  let response: Response;
  try {
    response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: digits,
        type: "template",
        template: {
          name: templateName,
          language: { code: Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE") || "en" },
          components: [{
            type: "body",
            parameters: [name, title, message].map((text) => ({
              type: "text",
              text: text.slice(0, 1024),
            })),
          }],
        },
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    console.error("[admin-messaging] WhatsApp request failed:", error);
    return { status: "failed" };
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("[admin-messaging] WhatsApp failed:", response.status, payload);
    return { status: "failed" };
  }
  return { status: "sent", reference: String(payload.messages?.[0]?.id || "") };
}

Deno.serve(async (request) => {
  const origin = allowedOrigin(request);
  if (!origin) return new Response("Origin not allowed", { status: 403 });
  if (request.method === "OPTIONS") return json({ ok: true }, 200, origin);
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = getSupabaseServiceKey();
  if (!supabaseUrl || !serviceKey) return json({ error: "server_not_configured" }, 500, origin);
  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: authData, error: authError } = await service.auth.getUser(token);
  const admin = authData.user;
  if (authError || !admin) return json({ error: "authentication_required" }, 401, origin);
  const { data: adminRole } = await service.from("admin_users")
    .select("role").eq("user_id", admin.id).maybeSingle();
  if (!adminRole || !["owner", "admin"].includes(adminRole.role)) {
    return json({ error: "admin_permission_required" }, 403, origin);
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return json({ error: "invalid_json" }, 400, origin); }
  if (body.action !== "send") return json({ error: "invalid_action" }, 400, origin);

  const userId = String(body.userId || "");
  const title = String(body.title || "").trim().replace(/\s+/g, " ");
  const message = String(body.message || "").trim();
  const requested = Array.isArray(body.channels) ? body.channels.map(String) : [];
  const channels = Array.from(new Set(["in_app", ...requested]))
    .filter((channel) => ["in_app", "email", "whatsapp"].includes(channel));
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ error: "invalid_customer" }, 400, origin);
  if (title.length < 3 || title.length > 100) return json({ error: "invalid_title" }, 400, origin);
  if (message.length < 3 || message.length > 1000) return json({ error: "invalid_message" }, 400, origin);

  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count, error: rateLimitError } = await service.from("admin_message_deliveries")
    .select("id", { count: "exact", head: true })
    .eq("admin_user_id", admin.id).gte("created_at", tenMinutesAgo);
  if (rateLimitError) return json({ error: "rate_limit_check_failed" }, 503, origin);
  if ((count || 0) >= 20) return json({ error: "message_rate_limit" }, 429, origin);

  const [{ data: profile }, userResult] = await Promise.all([
    service.from("profiles")
      .select("full_name,whatsapp_phone,whatsapp_verified_at,email_updates_opt_in_at,whatsapp_updates_opt_in_at")
      .eq("id", userId).maybeSingle(),
    service.auth.admin.getUserById(userId),
  ]);
  const customer = userResult.data.user;
  if (!customer) return json({ error: "customer_not_found" }, 404, origin);
  const name = String(profile?.full_name || customer.user_metadata?.full_name || "Customer").trim();

  const { data: delivery, error: deliveryError } = await service
    .from("admin_message_deliveries")
    .insert({
      admin_user_id: admin.id,
      user_id: userId,
      title,
      message,
      requested_channels: channels,
      email_status: channels.includes("email") ? "pending" : "not_requested",
      whatsapp_status: channels.includes("whatsapp") ? "pending" : "not_requested",
    })
    .select("id")
    .single();
  if (deliveryError || !delivery) return json({ error: "delivery_log_failed" }, 500, origin);

  const { error: notificationError } = await service.from("user_notifications").insert({
    user_id: userId,
    kind: "admin_message",
    title,
    message,
  });
  if (notificationError) {
    await service.from("admin_message_deliveries")
      .update({ in_app_status: "failed" }).eq("id", delivery.id);
    return json({ error: "notification_failed" }, 500, origin);
  }

  const [emailResult, whatsappResult, pushResult] = await Promise.all([
    channels.includes("email")
      ? sendEmail(delivery.id, customer.email || null, !!profile?.email_updates_opt_in_at, name, title, message)
      : Promise.resolve<DeliveryResult>({ status: "not_requested" }),
    channels.includes("whatsapp")
      ? sendWhatsApp(
        profile?.whatsapp_verified_at ? profile.whatsapp_phone : null,
        !!profile?.whatsapp_updates_opt_in_at,
        name,
        title,
        message,
      )
      : Promise.resolve<DeliveryResult>({ status: "not_requested" }),
    sendPushToUsers(service, [userId], {
      title,
      body: message,
      url: "dashboard.html?tab=notifications",
      tag: `admin-message-${delivery.id}`,
      data: { notificationKind: "admin_message", deliveryId: delivery.id },
    }),
  ]);

  const references: Record<string, string> = {};
  if (emailResult.reference) references.email = emailResult.reference;
  if (whatsappResult.reference) references.whatsapp = whatsappResult.reference;
  await Promise.all([
    service.from("admin_message_deliveries").update({
      in_app_status: "sent",
      email_status: emailResult.status,
      whatsapp_status: whatsappResult.status,
      push_status: pushResult.status,
      provider_references: references,
    }).eq("id", delivery.id),
    service.from("admin_action_log").insert({
      admin_user_id: admin.id,
      action: "customer_message_sent",
      target_type: "customer",
      target_id: userId,
      details: {
        title,
        channels,
        emailStatus: emailResult.status,
        whatsappStatus: whatsappResult.status,
        pushStatus: pushResult.status,
      },
    }),
  ]);

  return json({
    ok: true,
    deliveryId: delivery.id,
    inApp: "sent",
    email: emailResult.status,
    whatsapp: whatsappResult.status,
    push: pushResult.status,
  }, 200, origin);
});
