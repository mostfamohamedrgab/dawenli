import { Telegraf } from "telegraf";
import { config } from "./config.js";
import { transcribe, analyzeEntries, unifiedReport } from "./openai.js";
import { runAgent, composeCheckin } from "./agent.js";
import { buildReportData } from "./report.js";
import {
  ensureUser,
  getUserByChatId,
  linkTelegram,
  listUsers,
  entriesSince,
  dueTaskReminders,
  markTaskReminded,
} from "./db.js";
import { issueLoginCode, redeemLinkToken } from "./server.js";

export function startBot() {
  const bot = new Telegraf(config.telegramToken);

  // التسجيل والأمان:
  // - /start بتوكن ربط (من زرار "اربط تيليجرام" في الداشبورد): مسموح دايمًا.
  // - حساب مربوط قبل كده (إيميل + تيليجرام): مسموح دايمًا.
  // - لو OPEN_SIGNUP=true: أي حد يكلم البوت بيتعمله حساب تلقائي.
  // - غير كده و ALLOWED_CHAT_ID متحدد: البوت لصاحبه بس (الوضع الشخصي).
  bot.use(async (ctx, next) => {
    const chatId = String(ctx.chat?.id ?? "");
    if (!chatId) return;

    const linkMatch = (ctx.message?.text || "").match(/^\/start\s+(lk[a-f0-9]+)$/);
    if (linkMatch) {
      ctx.state.linkToken = linkMatch[1];
      return next(); // الربط بيتعامل معاه في bot.start من غير إنشاء حساب جديد
    }

    const knownUser = getUserByChatId(chatId);
    if (!config.openSignup && !knownUser) {
      if (!config.allowedChatId) {
        await ctx.reply(
          `👋 أهلاً! الـ chat_id بتاعك هو: ${chatId}\nحطّه في ALLOWED_CHAT_ID في ملف .env وأعد التشغيل — أو فعّل OPEN_SIGNUP=true لفتح التسجيل للكل.`
        );
        return;
      }
      if (chatId !== config.allowedChatId) {
        // مش معروف: اقترح عليه يعمل حساب من الموقع ويربط
        await ctx.reply("أهلاً 👋 اعمل حساب من الموقع الأول، وبعدين دوس «اربط تيليجرام» من الداشبورد وهنبقى جاهزين.");
        return;
      }
    }
    const name = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ") || ctx.from?.username;
    ctx.state.user = ensureUser(chatId, name);
    return next();
  });

  bot.start(async (ctx) => {
    // جاي من زرار "اربط تيليجرام" في الداشبورد
    if (ctx.state.linkToken) {
      const userId = redeemLinkToken(ctx.state.linkToken);
      if (!userId) {
        return ctx.reply("اللينك ده خلصت صلاحيته 🙈 افتح الداشبورد ودوس «اربط تيليجرام» تاني.");
      }
      const name = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ") || ctx.from?.username;
      const r = linkTelegram(userId, String(ctx.chat.id), name);
      if (!r.ok) {
        return ctx.reply("رقم التيليجرام ده مرتبط بحساب تاني — سجّل دخول بالحساب القديم أو كلمني من هناك.");
      }
      return ctx.reply(
        "اتربط حسابك ✅🎉\nمن دلوقتي ابعتلي voice أو اكتبلي عن يومك — مصاريفك وصحتك وعاداتك وأهدافك ومهامك كلها هتتسجل وتظهر في داشبوردك.\nجرّب دلوقتي: احكيلي يومك عدى إزاي؟"
      );
    }
    return ctx.reply(
      "أهلاً بيك في دوّنلي ✍️\nابعتلي voice أو اكتبلي عن يومك — هفهم كلامك وأسجّل منه: مصاريفك 💰، صحتك ونفسيتك 🩺، عاداتك وأهدافك 🎯، ومهامك في التقويم 📅.\nولو سألتك حاجة مش واضحة، رد عليّا وهكمّل التسجيل.\n\nأوامر:\n/report — تقرير شامل عن آخر ٣٠ يوم\n/analyze — تحليل يومياتك آخر ٧ أيام\n/code — كود دخول للوحة التحكم\n/checkin — اسألني عن يومي دلوقتي"
    );
  });

  bot.command("analyze", async (ctx) => {
    const user = ctx.state.user;
    const parts = ctx.message.text.split(/\s+/);
    const days = Number(parts[1]) > 0 ? Number(parts[1]) : 7;
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const entries = entriesSince(user.id, since);
    if (!entries.length) return ctx.reply(`مفيش تدوينات في آخر ${days} يوم.`);
    await ctx.reply(`بحلّل آخر ${days} يوم (${entries.length} تدوينة)... ⏳`);
    try {
      const analysis = await analyzeEntries(entries, user.id);
      await ctx.reply(analysis);
    } catch (err) {
      console.error("analyze error:", err);
      await ctx.reply("حصل خطأ في التحليل، جرّب تاني.");
    }
  });

  // التقرير الشامل: نفسية + صحة + عادات + أهداف + فلوس — من كل كلامه
  bot.command("report", async (ctx) => {
    const user = ctx.state.user;
    const parts = ctx.message.text.split(/\s+/);
    const days = Number(parts[1]) > 0 ? Number(parts[1]) : 30;
    await ctx.reply(`بجهّزلك التقرير الشامل عن آخر ${days} يوم... ⏳`);
    try {
      const data = buildReportData(user.id, days);
      const report = await unifiedReport(data, user.id);
      await ctx.reply(report);
    } catch (err) {
      console.error("report error:", err);
      await ctx.reply("حصل خطأ في توليد التقرير، جرّب تاني.");
    }
  });

  // كود دخول الداشبورد — صالح ١٠ دقايق
  bot.command("code", async (ctx) => {
    const code = issueLoginCode(ctx.state.user.id);
    await ctx.reply(
      `🔑 كود الدخول بتاعك: ${code}\nادخل على لوحة التحكم واختار "دخول بكود" واكتبه. الكود صالح ١٠ دقايق.`
    );
  });

  bot.command("checkin", async (ctx) => {
    try {
      const msg = await composeCheckin(ctx.state.user);
      await ctx.reply(msg);
    } catch (err) {
      console.error("checkin error:", err);
      await ctx.reply("إزيك النهاردة؟ احكيلي عن يومك 🙂");
    }
  });

  // الصوت بكل أشكاله — مباشر أو forward من أي شات:
  // voice عادي، ملف صوتي، دايرة فيديو، أو صوت متبعت كـ"ملف" (زي فويسات واتساب المتشيّرة)
  bot.on("voice", (ctx) => handleVoice(ctx, ctx.message.voice, "voice.ogg"));
  bot.on("audio", (ctx) => handleVoice(ctx, ctx.message.audio, audioFilename(ctx.message.audio.file_name, "audio.mp3")));
  bot.on("video_note", (ctx) => handleVoice(ctx, ctx.message.video_note, "note.mp4"));
  bot.on("document", (ctx) => {
    const doc = ctx.message.document || {};
    const mime = doc.mime_type || "";
    if (mime.startsWith("audio/") || mime.startsWith("video/")) {
      return handleVoice(ctx, doc, audioFilename(doc.file_name, mime.startsWith("audio/") ? "audio.ogg" : "video.mp4"));
    }
    return ctx.reply("ابعتلي صوت أو نص عن يومك — الملفات التانية لسه مش بفهمها 🙏");
  });

  bot.on("text", (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) {
      return ctx.reply("أمر مش معروف. ابعت voice أو اكتب عن يومك، أو /report للتقرير الشامل.");
    }
    return processMessage(ctx, text, "text");
  });

  bot.launch().catch((err) => console.error("bot launch error:", err));
  console.log("🤖 بوت تليجرام شغّال (polling)");

  startSchedulers(bot);

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

/* ===================== المعالجة بالـ agent ===================== */

// الامتدادات اللي whisper بيقبلها — أي حاجة تانية بنرجع للاسم الافتراضي
const AUDIO_EXTS = ["mp3", "mp4", "mpeg", "mpga", "m4a", "ogg", "oga", "wav", "webm", "flac"];
function audioFilename(name, fallback) {
  const ext = String(name || "").split(".").pop()?.toLowerCase();
  return AUDIO_EXTS.includes(ext) ? `audio.${ext}` : fallback;
}

async function handleVoice(ctx, media, filename = "voice.ogg") {
  try {
    // بوتات تيليجرام مبتعرفش تنزّل ملفات أكبر من ~20MB
    if (media.file_size && media.file_size > 19 * 1024 * 1024) {
      return ctx.reply("الملف ده كبير أوي عليّا (أكتر من ٢٠ ميجا) 🙈 ابعت مقطع أقصر.");
    }
    await ctx.sendChatAction("typing");
    const link = await ctx.telegram.getFileLink(media.file_id);
    const res = await fetch(link.href);
    const buffer = Buffer.from(await res.arrayBuffer());

    const transcript = await transcribe(buffer, filename, ctx.state.user.id);
    if (!transcript) return ctx.reply("مقدرتش أفهم الصوت، جرّب تاني.");

    await processMessage(ctx, transcript, "voice");
  } catch (err) {
    console.error("voice error:", err);
    await ctx.reply("حصل خطأ أثناء المعالجة، جرّب تاني.");
  }
}

async function processMessage(ctx, text, kind) {
  if (!text) return ctx.reply("مفيش حاجة أسجّلها، جرّب تاني.");
  try {
    await ctx.sendChatAction("typing");
    const { reply, receipts } = await runAgent({ user: ctx.state.user, text, kind });
    await ctx.reply(reply);
    if (receipts.length) {
      await ctx.reply(`اتسجّلت ✅\n${receipts.join("\n")}`);
    }
  } catch (err) {
    console.error("agent error:", err);
    await ctx.reply("حصل خطأ أثناء المعالجة، جرّب تاني.");
  }
}

/* ===================== المبادرة =====================
   ١) check-in يومي لكل مستخدم — الـ agent بيسأل عن اللي ناقص بالتحديد.
   ٢) تأمّل أسبوعي.
   ٣) تذكير بالمهام في معادها. */

function startSchedulers(bot) {
  let lastCheckin = "";
  let lastWeekly = "";
  let lastReminderMinute = "";

  setInterval(async () => {
    const c = cairoParts();

    // تذكير المهام: كل دقيقة نشوف فيه مهام معادها وصل
    const minuteKey = `${c.date} ${c.hhmm}`;
    if (minuteKey !== lastReminderMinute) {
      lastReminderMinute = minuteKey;
      try {
        for (const t of dueTaskReminders(c.date, c.hhmm)) {
          markTaskReminded(t.id);
          await bot.telegram.sendMessage(
            t.chat_id,
            `⏰ تذكير: ${t.title}${t.due_time ? " — الساعة " + t.due_time : ""}${t.note ? "\n📝 " + t.note : ""}\nلما تخلصها قولي "خلصت ${t.title}" وهعلّمها ✅`
          );
        }
      } catch (err) {
        console.error("task reminder error:", err);
      }
    }

    // الـ check-in اليومي لكل المستخدمين
    if (c.hour === config.checkinHour && c.minute === 0 && lastCheckin !== c.date) {
      lastCheckin = c.date;
      for (const user of usersWithChat()) {
        try {
          const msg = await composeCheckin(user);
          await bot.telegram.sendMessage(user.chat_id, msg);
        } catch (err) {
          console.error(`checkin send error (user ${user.id}):`, err);
        }
      }
    }

    // التأمّل الأسبوعي
    if (
      c.weekday === config.weeklyDay &&
      c.hour === config.weeklyHour &&
      c.minute === 0 &&
      lastWeekly !== c.date
    ) {
      lastWeekly = c.date;
      for (const user of usersWithChat()) {
        await sendWeeklyReflection(bot, user);
      }
    }
  }, 30 * 1000);

  console.log(
    `⏰ المبادرة شغّالة — check-in يومي ${config.checkinHour}:00، تأمّل أسبوعي يوم ${config.weeklyDay} الساعة ${config.weeklyHour}:00، وتذكير مهام لحظي (${config.timezone})`
  );
}

function usersWithChat() {
  return listUsers().filter((u) => u.chat_id && u.chat_id !== "owner");
}

async function sendWeeklyReflection(bot, user) {
  const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const entries = entriesSince(user.id, since);
  try {
    if (!entries.length) {
      await bot.telegram.sendMessage(
        user.chat_id,
        "مرّ أسبوع من غير تدوين 🙃 تعالى نبدأ من النهاردة — احكيلي يومك."
      );
      return;
    }
    await bot.telegram.sendMessage(user.chat_id, "🪞 تأمّل الأسبوع — بص على أيامك اللي فاتت:");
    const analysis = await analyzeEntries(entries, user.id);
    await bot.telegram.sendMessage(user.chat_id, analysis);
  } catch (err) {
    console.error("weekly reflection error:", err);
  }
}

// أجزاء الوقت بتوقيت القاهرة بدون مكتبات
function cairoParts() {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map((x) => [x.type, x.value]));
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    hhmm: `${String(Number(p.hour) % 24).padStart(2, "0")}:${p.minute}`,
    weekday: wd,
  };
}
