const DEFAULT_URL = "dashboard.html?tab=notifications";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data?.json() || {}; }
  catch { payload = { body: event.data?.text() || "You have a new update." }; }

  const data = payload.data && typeof payload.data === "object" ? payload.data : {};
  event.waitUntil(self.registration.showNotification(payload.title || "ALKEBULAN", {
    body: payload.body || "You have a new update.",
    icon: new URL(payload.icon || "assets/brand/alkebulan-mark.svg", self.registration.scope).href,
    badge: new URL(payload.badge || "assets/brand/alkebulan-mark.svg", self.registration.scope).href,
    tag: payload.tag || "alkebulan-update",
    renotify: true,
    data: { ...data, url: data.url || DEFAULT_URL },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let target = new URL(DEFAULT_URL, self.registration.scope);
  try {
    const requested = new URL(event.notification.data?.url || DEFAULT_URL, self.registration.scope);
    if (requested.origin === self.location.origin) target = requested;
  } catch { /* Keep the safe account-notifications fallback. */ }

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      if ("navigate" in client) await client.navigate(target.href);
      return await client.focus();
    }
    return await self.clients.openWindow(target.href);
  })());
});
