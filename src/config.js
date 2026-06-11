import "dotenv/config";

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`❌ متغيّر مطلوب ناقص: ${name} — راجع ملف .env`);
    process.exit(1);
  }
  return v;
}

export const config = {
  telegramToken: required("TELEGRAM_BOT_TOKEN"),
  // اسم البوت من غير @ — لزرار "اربط تيليجرام" في الداشبورد (deep link)
  botUsername: (process.env.TELEGRAM_BOT_USERNAME || "dawenli_bot").replace(/^@/, ""),
  openaiKey: required("OPENAI_API_KEY"),
  // لو متحدد: ده "صاحب" المنصة (الأدمن). لو OPEN_SIGNUP=true أي حد يكلم البوت بيتسجل له حساب.
  allowedChatId: process.env.ALLOWED_CHAT_ID
    ? String(process.env.ALLOWED_CHAT_ID).trim()
    : null,
  openSignup: String(process.env.OPEN_SIGNUP || "").toLowerCase() === "true",
  // موديل كويس للصوت العربي + موديل قوي للـ agent (tool calling)
  transcribeModel: process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-transcribe",
  // مهم: مفيش fallback على OPENAI_CHAT_MODEL القديم — كان بيخلي الـ agent يشتغل
  // بـ gpt-4o-mini من ملفات .env القديمة فميستخرجش حاجة من الكلام
  agentModel: process.env.OPENAI_AGENT_MODEL || "gpt-4o",
  analysisModel: process.env.OPENAI_ANALYSIS_MODEL || "gpt-4o",
  port: Number(process.env.PORT || 3000),
  dashboardPassword: process.env.DASHBOARD_PASSWORD || "change-me",
  dbPath: process.env.DB_PATH || "./data/dawenli.db",
  // مواعيد المبادرة (بتوقيت القاهرة)
  timezone: process.env.TIMEZONE || "Africa/Cairo",
  checkinHour: Number(process.env.CHECKIN_HOUR ?? 21), // الـ agent بيسأل يوميًا 9 مساءً
  weeklyDay: Number(process.env.WEEKLY_DAY ?? 5), // 0=الأحد .. 5=الجمعة
  weeklyHour: Number(process.env.WEEKLY_HOUR ?? 20), // تأمّل أسبوعي 8 مساءً
  // إشعارات PWA (Web Push) — اختياري؛ لو المفاتيح ناقصة الميزة بتتعطّل بهدوء.
  vapidPublic: process.env.VAPID_PUBLIC_KEY || "",
  vapidPrivate: process.env.VAPID_PRIVATE_KEY || "",
  vapidSubject: process.env.VAPID_SUBJECT || "mailto:admin@dawenli.app",
};
