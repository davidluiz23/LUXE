import {
  escapeEmailHtml,
  sendBrevoEmail,
  stableEmailIdempotencyKey,
  type BrevoEmailResult,
} from "./brevo-email.ts";

export type OrderEmailRecord = {
  id: string;
  user_id?: string;
  order_number: string;
  status: string;
  contact_name: string;
  contact_email: string;
  total: number | string;
  currency: string;
  estimated_delivery_min_days?: number | null;
  estimated_delivery_max_days?: number | null;
  waybill_url?: string | null;
  order_items?: Array<{
    product_name: string;
    quantity: number;
  }>;
};

function money(value: unknown, currency: unknown): string {
  const code = String(currency || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: code })
      .format(Number(value) || 0);
  } catch {
    return `${code} ${(Number(value) || 0).toFixed(2)}`;
  }
}

function eventStatus(eventKey: string, currentStatus: string): string {
  if (eventKey.startsWith("created:")) return "received";
  const match = eventKey.match(/^status:\d+:([a-z_]+)$/);
  return match?.[1] || currentStatus;
}

function statusCopy(status: string) {
  const copy: Record<string, { heading: string; subject: string; summary: string }> = {
    received: {
      heading: "We received your order",
      subject: "Order received",
      summary: "Your order is safely recorded and will move into processing after confirmation.",
    },
    pending_confirmation: {
      heading: "Your order is awaiting confirmation",
      subject: "Order awaiting confirmation",
      summary: "We have your order and will confirm it before fulfilment begins.",
    },
    awaiting_payment: {
      heading: "Your order is awaiting payment",
      subject: "Order awaiting payment",
      summary: "We have your order. Processing will begin after payment is confirmed.",
    },
    processing: {
      heading: "Your order is being processed",
      subject: "Order processing",
      summary: "Your items are now being prepared for courier handoff.",
    },
    confirmed: {
      heading: "Your order is ready for the courier",
      subject: "Order ready for courier",
      summary: "Your package has been prepared and is waiting to be handed to the courier.",
    },
    shipped: {
      heading: "Your order is on the way",
      subject: "Order shipping",
      summary: "Your package has been handed to the courier and is travelling to you.",
    },
    delivered: {
      heading: "Your order was delivered",
      subject: "Order delivered",
      summary: "The delivery has been marked complete. Thank you for shopping with us.",
    },
    cancelled: {
      heading: "Your order was cancelled",
      subject: "Order cancelled",
      summary: "This order has been cancelled. Contact customer care if you need assistance.",
    },
  };
  return copy[status] || {
    heading: "Your order was updated",
    subject: "Order update",
    summary: `Your order status is now ${status.replaceAll("_", " ")}.`,
  };
}

function dashboardUrl(orderNumber: string): string | null {
  const siteUrl = (Deno.env.get("LUXE_SITE_URL") || "").trim();
  if (!siteUrl) return null;
  try {
    const base = siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`;
    const url = new URL("dashboard.html", base);
    url.searchParams.set("tab", "orders");
    url.searchParams.set("order", orderNumber);
    return url.toString();
  } catch {
    return null;
  }
}

function safeHttpsUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function sendOrderStatusEmail(
  order: OrderEmailRecord,
  eventKey: string,
  options: { idempotencyKey?: string; logContext?: string } = {},
): Promise<BrevoEmailResult> {
  const brand = (Deno.env.get("BRAND_NAME") || "ALKEBULAN").trim().slice(0, 80) || "ALKEBULAN";
  const status = eventStatus(eventKey, String(order.status || "updated"));
  const copy = statusCopy(status);
  const itemSummary = (order.order_items || [])
    .map((item) => `${item.product_name} ×${Number(item.quantity) || 0}`)
    .join(", ") || "Your order items";
  const total = money(order.total, order.currency);
  const eta = order.estimated_delivery_min_days
    ? `${order.estimated_delivery_min_days}${
      order.estimated_delivery_max_days &&
        order.estimated_delivery_max_days !== order.estimated_delivery_min_days
        ? `–${order.estimated_delivery_max_days}`
        : ""
    } days`
    : null;
  const trackingUrl = ["shipped", "delivered"].includes(status) && order.waybill_url
    ? safeHttpsUrl(order.waybill_url)
    : null;
  const accountUrl = dashboardUrl(order.order_number);
  const safeName = escapeEmailHtml(order.contact_name || "Customer");
  const safeBrand = escapeEmailHtml(brand);
  const safeHeading = escapeEmailHtml(copy.heading);
  const safeSummary = escapeEmailHtml(copy.summary);
  const safeOrderNumber = escapeEmailHtml(order.order_number);
  const safeItems = escapeEmailHtml(itemSummary);
  const safeTotal = escapeEmailHtml(total);
  const safeEta = eta ? escapeEmailHtml(eta) : "";
  const safeTrackingUrl = trackingUrl ? escapeEmailHtml(trackingUrl) : "";
  const safeAccountUrl = accountUrl ? escapeEmailHtml(accountUrl) : "";
  const idempotencyKey = options.idempotencyKey || await stableEmailIdempotencyKey(
    `${order.id}:${eventKey}:customer_email`,
  );

  const textLines = [
    `Hello ${order.contact_name || "Customer"},`,
    "",
    copy.heading,
    copy.summary,
    `Order: ${order.order_number}`,
    `Items: ${itemSummary}`,
    `Total: ${total}`,
    eta ? `Estimated arrival: ${eta}` : null,
    trackingUrl ? `Courier tracking: ${trackingUrl}` : null,
    accountUrl ? `View your order: ${accountUrl}` : null,
    "",
    `${brand} Customer Care`,
  ].filter((line) => line !== null).join("\n");

  const htmlContent = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px;color:#171717;line-height:1.65">
      <p style="font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#777">${safeBrand}</p>
      <p>Hello ${safeName},</p>
      <h1 style="font-size:24px;margin:18px 0 8px">${safeHeading}</h1>
      <p>${safeSummary}</p>
      <div style="margin:22px 0;padding:16px;background:#f7f7f7;border-radius:8px">
        <p style="margin:0 0 7px"><strong>Order:</strong> ${safeOrderNumber}</p>
        <p style="margin:0 0 7px"><strong>Items:</strong> ${safeItems}</p>
        <p style="margin:0"><strong>Total:</strong> ${safeTotal}</p>
        ${eta ? `<p style="margin:7px 0 0"><strong>Estimated arrival:</strong> ${safeEta}</p>` : ""}
      </div>
      ${trackingUrl ? `<p><a href="${safeTrackingUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px">Track with courier</a></p>` : ""}
      ${accountUrl ? `<p><a href="${safeAccountUrl}">View order in your account</a></p>` : ""}
      <p style="color:#777">${safeBrand} Customer Care</p>
    </div>`;

  return await sendBrevoEmail({
    toEmail: order.contact_email,
    toName: order.contact_name,
    subject: `${brand}: ${copy.subject} ${order.order_number}`,
    htmlContent,
    textContent: textLines,
    tag: `luxe-order-${status}`,
    idempotencyKey,
    logContext: options.logContext || "order-notifications",
  });
}
