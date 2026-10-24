// GPS Link: avisos en la computadora (panel admin y plataforma de rastreo).
self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: "GPS Link", body: event.data ? event.data.text() : "" }; }
  event.waitUntil(self.registration.showNotification(d.title || "GPS Link", { body: d.body || "", icon: d.icon || "/pwa-192.png", tag: d.tag, data: { url: d.url || "/admin" } }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if (c.url.startsWith(url) && "focus" in c) return c.focus();
      return self.clients.openWindow(url);
    }),
  );
});
