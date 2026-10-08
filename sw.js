/* Service Worker — إشعارات الويب للطلاب (لا يخزّن ملفات ولا يغيّر سلوك الموقع) */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// الضغط على الإشعار: لو الموقع مفتوح نركّز عليه ونبعتله رسالة (من غير Reload عشان ما يضيعش امتحان شغّال)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const url = data.url || "./";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if ("focus" in c) {
          await c.focus();
          c.postMessage({ type: "open-exam", examId: data.examId || null });
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(url);
    })(),
  );
});

// جاهز لاستقبال Push حقيقي (FCM / Web Push) لو تم ربط خادم لاحقاً
self.addEventListener("push", (event) => {
  let p = {};
  try {
    p = event.data ? event.data.json() : {};
  } catch {}
  event.waitUntil(
    self.registration.showNotification(p.title || "تم نشر امتحان جديد", {
      body: p.body || "",
      icon: "./img/app.png",
      badge: "./img/app.png",
      dir: "rtl",
      lang: "ar",
      tag: p.tag || "exam",
      data: { url: p.url || "./", examId: p.examId || null },
    }),
  );
});
