// Server-side transport. The storefront never receives bot credentials.
type WhatsAppTemplate = {
  name: string;
  parameters?: string[];
  language?: string;
  components?: Record<string, unknown>[];
};

export type WhatsAppMessage = {
  to: string;
  text: string;
  idempotencyKey: string;
  template?: WhatsAppTemplate;
};

export type WhatsAppResult = {
  sent: boolean;
  status: "sent" | "not_configured" | "invalid_message" | "failed";
  messageId?: string;
  reason?: string;
};

export function whatsAppProvider(): string {
  return (Deno.env.get("WHATSAPP_PROVIDER") || "baileys").trim().toLowerCase();
}

function bridgeUrl(): string | null {
  try {
    const url = new URL(Deno.env.get("WHATSAPP_BRIDGE_URL") || "");
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return url.href.replace(/\/$/, "");
  } catch { return null; }
}

export function isWhatsAppConfigured(): boolean {
  if (whatsAppProvider() === "baileys") {
    return !!bridgeUrl() && (Deno.env.get("WHATSAPP_BRIDGE_TOKEN") || "").length >= 32;
  }
  return whatsAppProvider() === "meta" && !!Deno.env.get("WHATSAPP_ACCESS_TOKEN") &&
    /^\d+$/.test(Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "");
}

export async function sendWhatsAppMessage(message: WhatsAppMessage): Promise<WhatsAppResult> {
  if (!isWhatsAppConfigured()) {
    return { sent: false, status: "not_configured", reason: "WhatsApp transport is not configured." };
  }
  const to = message.to.replace(/^\+/, "");
  if (!/^[1-9]\d{6,14}$/.test(to) || !message.text.trim() ||
      !/^[a-zA-Z0-9:_.-]{1,240}$/.test(message.idempotencyKey)) {
    return { sent: false, status: "invalid_message", reason: "Invalid WhatsApp message." };
  }

  const provider = whatsAppProvider();
  const text = message.text.slice(0, 4096);
  let url: string;
  let token: string;
  let body: Record<string, unknown>;
  if (provider === "baileys") {
    url = `${bridgeUrl()}/v1/messages`;
    token = Deno.env.get("WHATSAPP_BRIDGE_TOKEN")!;
    body = { to, text };
  } else {
    const version = Deno.env.get("WHATSAPP_GRAPH_VERSION") || "v23.0";
    url = `https://graph.facebook.com/${version}/${Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")}/messages`;
    token = Deno.env.get("WHATSAPP_ACCESS_TOKEN")!;
    const template = message.template;
    body = template ? {
      messaging_product: "whatsapp", recipient_type: "individual", to, type: "template",
      template: {
        name: template.name,
        language: { code: template.language || Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE") || "en" },
        components: template.components || [{
          type: "body",
          parameters: (template.parameters || []).map(value => ({ type: "text", text: value.slice(0, 1024) })),
        }],
      },
    } : {
      messaging_product: "whatsapp", recipient_type: "individual", to, type: "text",
      text: { preview_url: false, body: text },
    };
  }

  try {
    const response = await fetch(url, {
      method: "POST", redirect: "error",
      headers: {
        Authorization: `Bearer ${token}`, "Content-Type": "application/json",
        "Idempotency-Key": message.idempotencyKey,
      },
      body: JSON.stringify(body), signal: AbortSignal.timeout(12_000),
    });
    const result = await response.json().catch(() => null);
    const messageId = provider === "baileys" ? result?.messageId : result?.messages?.[0]?.id;
    if (!response.ok || (provider === "baileys" && result?.ok !== true) ||
        typeof messageId !== "string" || !messageId.trim()) {
      return { sent: false, status: "failed", reason: `WhatsApp delivery was not confirmed (${response.status}).` };
    }
    return { sent: true, status: "sent", messageId };
  } catch {
    // A timeout may follow an accepted send. Retrying uses the same delivery key.
    return { sent: false, status: "failed", reason: "WhatsApp delivery could not be confirmed." };
  }
}
