// Web Push (PWA notifications) — اختياري. لو مفاتيح VAPID ناقصة، الميزة بتتعطّل بهدوء
// من غير ما تكسر أي حاجة تانية.
import webpush from "web-push";
import { config } from "./config.js";
import { listPushSubscriptions, deletePushSubscription } from "./db.js";

export const pushEnabled = Boolean(config.vapidPublic && config.vapidPrivate);

if (pushEnabled) {
  webpush.setVapidDetails(config.vapidSubject, config.vapidPublic, config.vapidPrivate);
  console.log("🔔 إشعارات PWA مفعّلة (Web Push)");
} else {
  console.log("🔕 إشعارات PWA متعطّلة — VAPID keys ناقصة في .env");
}

export const vapidPublicKey = config.vapidPublic;

// بيبعت إشعار لكل أجهزة مستخدم واحد. بيشيل أي اشتراك بقى منتهي (404/410).
export async function sendPushToUser(userId, payload) {
  if (!pushEnabled || !userId) return 0;
  const subs = listPushSubscriptions(userId);
  if (!subs.length) return 0;
  const body = JSON.stringify(payload || {});
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      const sub = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
      try {
        await webpush.sendNotification(sub, body);
        sent++;
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          deletePushSubscription(s.endpoint); // الاشتراك مات
        } else {
          console.error("push send error:", err?.statusCode || err?.message);
        }
      }
    })
  );
  return sent;
}
