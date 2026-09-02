export type BrevoEmailRequest = {
  toEmail: string;
  toName?: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  tag: string;
  idempotencyKey?: string;
  logContext?: string;
};

export type BrevoEmailResult = {
  sent: boolean;
  status: "sent" | "not_configured" | "invalid_recipient" | "failed";
  messageId?: string;
  reason?: string;
  retryable: boolean;
  providerStatus?: number;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function escapeEmailHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] || character);
}

export async function stableEmailIdempotencyKey(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function sendBrevoEmail(
  request: BrevoEmailRequest,
): Promise<BrevoEmailResult> {
  const apiKey = (Deno.env.get("BREVO_API_KEY") || "").trim();
  const senderEmail = (Deno.env.get("BREVO_SENDER_EMAIL") || "").trim().toLowerCase();
  const brand = (Deno.env.get("BRAND_NAME") || "ALKEBULAN").trim().slice(0, 80) || "ALKEBULAN";
  const senderName = (Deno.env.get("BREVO_SENDER_NAME") || brand).trim().slice(0, 80) || brand;
  const toEmail = String(request.toEmail || "").trim().toLowerCase();
  const context = String(request.logContext || "email").replace(/[^a-z0-9_-]/gi, "").slice(0, 50) || "email";

  if (!apiKey || !EMAIL_PATTERN.test(senderEmail)) {
    return {
      sent: false,
      status: "not_configured",
      reason: "Brevo API key or verified sender is not configured.",
      retryable: true,
    };
  }
  if (!EMAIL_PATTERN.test(toEmail) || toEmail.length > 254) {
    return {
      sent: false,
      status: "invalid_recipient",
      reason: "Recipient email is invalid.",
      retryable: false,
    };
  }

  const tag = String(request.tag || "transactional")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 64) || "transactional";
  const body: Record<string, unknown> = {
    sender: { name: senderName, email: senderEmail },
    to: [{
      name: String(request.toName || "Customer").trim().slice(0, 120) || "Customer",
      email: toEmail,
    }],
    subject: String(request.subject || "Account update").trim().slice(0, 200),
    htmlContent: request.htmlContent,
    textContent: request.textContent,
    tags: [tag],
  };
  if (request.idempotencyKey && UUID_PATTERN.test(request.idempotencyKey)) {
    body.headers = { "Idempotency-Key": request.idempotencyKey };
  }

  let response: Response;
  try {
    response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    console.error(`[${context}] Brevo request failed:`, error);
    return {
      sent: false,
      status: "failed",
      reason: "Brevo request failed.",
      retryable: true,
    };
  }

  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    console.error(`[${context}] Brevo returned ${response.status}:`, payload);
    return {
      sent: false,
      status: "failed",
      reason: `Brevo returned ${response.status}.`,
      retryable: [402, 408, 425, 429].includes(response.status) || response.status >= 500,
      providerStatus: response.status,
    };
  }

  return {
    sent: true,
    status: "sent",
    messageId: String(payload.messageId || ""),
    retryable: false,
    providerStatus: response.status,
  };
}
