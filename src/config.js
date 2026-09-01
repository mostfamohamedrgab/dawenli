import "dotenv/config";

export const config = {
  // مش إجباري: لو مش موجود، التطبيق بيشتغل عادي ويطلب إعداد مزود الذكاء من لوحة الأدمن
  openaiKey: process.env.OPENAI_API_KEY || "",
  // موديل كويس للصوت العربي + موديل قوي للـ agent (tool calling)
  transcribeModel: process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-transcribe",
  // مهم: مفيش fallback على OPENAI_CHAT_MODEL القديم — كان بيخلي الـ agent يشتغل
  // بـ gpt-4o-mini من ملفات .env القديمة فميستخرجش حاجة من الكلام
  agentModel: process.env.OPENAI_AGENT_MODEL || "gpt-4o",
  analysisModel: process.env.OPENAI_ANALYSIS_MODEL || "gpt-4o",
  // تحويل النص لصوت (رد صوتي في الشات) — tts-1 متاح للكل ويدعم العربي.
  // لو الحساب عنده access لـ gpt-4o-mini-tts (أحسن للعربي) فعّله من OPENAI_TTS_MODEL.
  ttsModel: process.env.OPENAI_TTS_MODEL || "tts-1",
  ttsVoice: process.env.OPENAI_TTS_VOICE || "alloy",
  port: Number(process.env.PORT || 3000),
  dashboardPassword: process.env.DASHBOARD_PASSWORD || "change-me",
  dbPath: process.env.DB_PATH || "./data/dawenli.db",
  // مواعيد المبادرة (بتوقيت القاهرة)
  timezone: process.env.TIMEZONE || "Africa/Cairo",
  checkinHour: Number(process.env.CHECKIN_HOUR ?? 21), // الـ agent بيسأل يوميًا 9 مساءً
  // تذكير 10م لكل مستخدم نشط مسجّلش يوميات النهاردة
  journalReminderHour: Number(process.env.JOURNAL_REMINDER_HOUR ?? 22),
  weeklyDay: Number(process.env.WEEKLY_DAY ?? 5), // 0=الأحد .. 5=الجمعة
  weeklyHour: Number(process.env.WEEKLY_HOUR ?? 20), // تأمّل أسبوعي 8 مساءً
  // إشعارات PWA (Web Push) — اختياري؛ لو المفاتيح ناقصة الميزة بتتعطّل بهدوء.
  vapidPublic: process.env.VAPID_PUBLIC_KEY || "",
  vapidPrivate: process.env.VAPID_PRIVATE_KEY || "",
  vapidSubject: process.env.VAPID_SUBJECT || "mailto:admin@dawenli.app",
};
