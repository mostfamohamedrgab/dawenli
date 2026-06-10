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
  openaiKey: required("OPENAI_API_KEY"),
  // لو متحدد: ده "صاحب" المنصة (الأدمن). لو OPEN_SIGNUP=true أي حد يكلم البوت بيتسجل له حساب.
  allowedChatId: process.env.ALLOWED_CHAT_ID
    ? String(process.env.ALLOWED_CHAT_ID).trim()
    : null,
  openSignup: String(process.env.OPEN_SIGNUP || "").toLowerCase() === "true",
  // موديل كويس للصوت العربي + موديل قوي للـ agent (tool calling)
  transcribeModel: process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-transcribe",
  agentModel: process.env.OPENAI_AGENT_MODEL || process.env.OPENAI_CHAT_MODEL || "gpt-4o",
  analysisModel: process.env.OPENAI_ANALYSIS_MODEL || "gpt-4o",
  port: Number(process.env.PORT || 3000),
  dashboardPassword: process.env.DASHBOARD_PASSWORD || "change-me",
  dbPath: process.env.DB_PATH || "./data/dawenli.db",
  // مواعيد المبادرة (بتوقيت القاهرة)
  timezone: process.env.TIMEZONE || "Africa/Cairo",
  checkinHour: Number(process.env.CHECKIN_HOUR ?? 21), // الـ agent بيسأل يوميًا 9 مساءً
  weeklyDay: Number(process.env.WEEKLY_DAY ?? 5), // 0=الأحد .. 5=الجمعة
  weeklyHour: Number(process.env.WEEKLY_HOUR ?? 20), // تأمّل أسبوعي 8 مساءً
};
