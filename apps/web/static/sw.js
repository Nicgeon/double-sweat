// @ts-nocheck
// Service Worker: nur für Push-Benachrichtigungen. Er speichert nichts zwischen und fängt keine Anfragen ab.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Nur ein Pfad innerhalb der App ist als Ziel erlaubt (kein "//", kein Schema): sonst bleibt es bei "/"
const safePath = (value) =>
  typeof value === 'string' && /^\/(?!\/)[A-Za-z0-9/_\-.?=&%]{0,200}$/.test(value) ? value : '/';

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = typeof data.title === 'string' && data.title ? data.title : 'Double Sweat';
  const body = typeof data.body === 'string' ? data.body : '';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/favicon-32.png',
      tag: typeof data.type === 'string' ? data.type : 'double-sweat',
      data: { url: safePath(data.url) },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = safePath(event.notification.data && event.notification.data.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows[0];
      if (existing) {
        await existing.focus();
        // Offenes Fenster auf das Ziel der Mitteilung lenken (kann fehlen oder scheitern: dann bleibt es stehen)
        if (typeof existing.navigate === 'function') await existing.navigate(url).catch(() => {});
        return undefined;
      }
      return self.clients.openWindow(url);
    })(),
  );
});
