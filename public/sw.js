/* دوّنلي — Service Worker (PWA: تثبيت + أوفلاين خفيف + إشعارات) */
const CACHE = "dawenli-v43";
// أصول ثابتة آمنة للتخزين (مش بيانات مستخدم).
const SHELL = [
  "/style.css",
  "/assets/logo/dawwenli-logo.svg",
  "/assets/logo/dawwenli-mark.svg",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // التنقّل (الصفحات) + الكود/الستايل (app.js, style.css): الشبكة الأول عشان أي
  // deploy يظهر فورًا، ولو النت قاطع نرجع آخر نسخة متخزّنة. (الـ stale-while-revalidate
  // كان بيعرض ستايل قديم بعد كل نشر.)
  if (req.mode === "navigate" || url.pathname === "/style.css" || url.pathname === "/app.js") {
    const isNav = req.mode === "navigate";
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        })
        // أوفلاين: نرجّع آخر نسخة متخزّنة؛ للتنقّل بس نرجّع الـ shell، أما css/js
        // فلو مش متخزّنين نسيبه يفشل نظيف (منرجّعش HTML مكان ملف ستايل/كود).
        .catch(() => caches.match(req).then((r) => r || (isNav ? caches.match("/") : undefined)))
    );
    return;
  }

  // الأصول الثابتة (أيقونات/لوجو نادرًا بتتغيّر): stale-while-revalidate. مابنخزّنش نداءات الـ API.
  const isAsset = url.pathname.startsWith("/assets/");
  if (isAsset) {
    e.respondWith(
      caches.match(req).then((cached) => {
        const fresh = fetch(req)
          .then((res) => {
            if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
            return res;
          })
          .catch(() => cached);
        return cached || fresh;
      })
    );
  }
});

/* ===================== الإشعارات (Web Push) ===================== */
self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { body: e.data && e.data.text() }; }
  const title = data.title || "دوّنلي";
  const options = {
    body: data.body || "تعالى دوّن يومك ✍️",
    icon: "/assets/icons/icon-192.png",
    badge: "/assets/icons/icon-192.png",
    dir: "rtl",
    lang: "ar",
    data: { url: data.url || "/" },
    tag: data.tag || "dawenli",
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(target) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
