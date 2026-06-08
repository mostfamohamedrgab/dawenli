import { Telegraf } from "telegraf";
import { config } from "./config.js";
import {
  transcribe,
  classifyMessage,
  analyzeEntries,
  reflectOnEntry,
} from "./openai.js";
import {
  upsertJournalForDay,
  entriesSince,
  listEntries,
  listGoals,
  applyGoal,
  addHealth,
  addCondition,
  addMeal,
  addHabit,
  findHabitByTitle,
  logHabit,
  addFinance,
  logConversation,
} from "./db.js";

export function startBot() {
  const bot = new Telegraf(config.telegramToken);

  // أمان: البوت يرد على صاحبه بس
  bot.use(async (ctx, next) => {
    const chatId = String(ctx.chat?.id ?? "");
    if (!config.allowedChatId) {
      await ctx.reply(
        `👋 أهلاً! الـ chat_id بتاعك هو: ${chatId}\nحطّه في ALLOWED_CHAT_ID في ملف .env وأعد التشغيل عشان نقفل البوت عليك.`
      );
      return;
    }
    if (chatId !== config.allowedChatId) return; // تجاهل أي حد تاني
    return next();
  });

  bot.start((ctx) =>
    ctx.reply(
      "أهلاً بيك في دوّنلي ✍️\nابعتلي voice أو اكتبلي نص عن يومك وأنا هدوّنه.\nوهفكّرك كل يوم وأبعتلك تأمّل أسبوعي عن أيامك.\n\nأوامر:\n/analyze — حلّلي آخر ٧ أيام\n/reflect — تأمّل الأسبوع دلوقتي"
    )
  );

  bot.command("analyze", async (ctx) => {
    const parts = ctx.message.text.split(/\s+/);
    const days = Number(parts[1]) > 0 ? Number(parts[1]) : 7;
    const since = new Date(Date.now() - days * 86400000)
      .toISOString()
      .slice(0, 10);
    const entries = entriesSince(since);
    if (!entries.length) {
      return ctx.reply(`مفيش تدوينات في آخر ${days} يوم.`);
    }
    await ctx.reply(`بحلّل آخر ${days} يوم (${entries.length} تدوينة)... ⏳`);
    try {
      const analysis = await analyzeEntries(entries);
      await ctx.reply(analysis);
    } catch (err) {
      console.error("analyze error:", err);
      await ctx.reply("حصل خطأ في التحليل، جرّب تاني.");
    }
  });

  bot.command("reflect", async (ctx) => {
    await ctx.reply("بحضّرلك تأمّل آخر أسبوع... 🪞");
    await sendWeeklyReflection(bot, ctx.chat.id);
  });

  bot.on("voice", (ctx) => handleVoice(ctx, ctx.message.voice.file_id));
  bot.on("audio", (ctx) => handleVoice(ctx, ctx.message.audio.file_id));

  bot.on("text", (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) {
      return ctx.reply("أمر مش معروف. ابعت voice أو اكتب نص عن يومك، أو /analyze.");
    }
    return processEntry(ctx, text, "text");
  });

  bot.launch().catch((err) => console.error("bot launch error:", err));
  console.log("🤖 بوت تليجرام شغّال (polling) — @dawenli_bot");

  startSchedulers(bot);

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

/* ===================== المبادرة (تذكير يومي + تأمّل أسبوعي) ===================== */

const CHECKIN_PROMPTS = [
  "إزيك النهاردة؟ 🌙 احكيلي عن يومك — ابعت voice أو اكتب.",
  "يومك عدّى إزاي؟ 🙂 دوّنّي أي حاجة حصلت، حلوة أو وحشة.",
  "وقت التدوين 📝 إيه اللي شاغل دماغك دلوقتي؟",
  "خد دقيقة لنفسك — إيه أكتر حاجة أثّرت فيك النهاردة؟",
  "إزي الحال؟ ✨ احكيلي إنجاز صغير عملته النهاردة.",
];

function startSchedulers(bot) {
  if (!config.allowedChatId) return; // مينفعش نبادر من غير ما نعرف نبعت لمين
  let lastCheckin = "";
  let lastWeekly = "";

  setInterval(async () => {
    const c = cairoParts();
    if (c.hour === config.checkinHour && c.minute === 0 && lastCheckin !== c.date) {
      lastCheckin = c.date;
      const msg = CHECKIN_PROMPTS[Math.floor(Math.random() * CHECKIN_PROMPTS.length)];
      try {
        await bot.telegram.sendMessage(config.allowedChatId, msg);
      } catch (err) {
        console.error("checkin send error:", err);
      }
    }
    if (
      c.weekday === config.weeklyDay &&
      c.hour === config.weeklyHour &&
      c.minute === 0 &&
      lastWeekly !== c.date
    ) {
      lastWeekly = c.date;
      await sendWeeklyReflection(bot, config.allowedChatId);
    }
  }, 60 * 1000);

  console.log(
    `⏰ المبادرة شغّالة — تذكير يومي ${config.checkinHour}:00، تأمّل أسبوعي يوم ${config.weeklyDay} الساعة ${config.weeklyHour}:00 (${config.timezone})`
  );
}

async function sendWeeklyReflection(bot, chatId) {
  const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const entries = entriesSince(since);
  try {
    if (!entries.length) {
      await bot.telegram.sendMessage(
        chatId,
        "مرّ أسبوع من غير تدوين 🙃 تعالى نبدأ من النهاردة — احكيلي يومك."
      );
      return;
    }
    await bot.telegram.sendMessage(chatId, "🪞 تأمّل الأسبوع — بص على أيامك اللي فاتت:");
    const analysis = await analyzeEntries(entries);
    await bot.telegram.sendMessage(chatId, analysis);
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
  const p = Object.fromEntries(
    fmt.formatToParts(new Date()).map((x) => [x.type, x.value])
  );
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    weekday: wd,
  };
}

async function handleVoice(ctx, fileId) {
  try {
    await ctx.reply("استلمت الصوت، بفرّغه وأدوّنه... ⏳");
    const link = await ctx.telegram.getFileLink(fileId);
    const res = await fetch(link.href);
    const buffer = Buffer.from(await res.arrayBuffer());

    const transcript = await transcribe(buffer);
    if (!transcript) return ctx.reply("مقدرتش أفهم الصوت، جرّب تاني.");

    await processEntry(ctx, transcript, "voice");
  } catch (err) {
    console.error("voice error:", err);
    await ctx.reply("حصل خطأ أثناء المعالجة، جرّب تاني.");
  }
}

async function processEntry(ctx, text, kind = "text") {
  if (!text) return ctx.reply("مفيش حاجة أدوّنها، جرّب تاني.");
  const chatId = ctx.chat?.id;
  try {
    const today = new Date().toISOString().slice(0, 10);
    // سياق الذاكرة: آخر تدوينات قبل ما نحفظ الجديدة
    const memoryContext = listEntries(6).filter((e) => e.entry_date !== today);
    const existingGoals = listGoals();
    const { journal, goals, health, condition, meals, habits, finance } = await classifyMessage(text, today, existingGoals);

    const r = upsertJournalForDay({ ...journal, transcript: text });
    const tags = journal.tags?.length ? " · 🏷️ " + journal.tags.join("، ") : "";
    const lines = [
      `📝 ${r.merged ? "اتضافت لنفس اليوم" : "تدوينة"} (${journal.entryDate}) — ${journal.mood || "—"}${tags}`,
    ];

    // الأهداف: نطبّقها (إنشاء أو زيادة تقدّم) ونجمّع التحديثات للرد التأمّلي
    const goalUpdates = [];
    for (const g of goals) {
      const applied = applyGoal(g);
      if (!applied) continue;
      goalUpdates.push({ ...applied, unit: g.unit });
      const pct = applied.target
        ? ` (${Math.min(100, Math.round((applied.current / applied.target) * 100))}%)`
        : "";
      const tgt = applied.target ? `/${fmtNum(applied.target)}` : "";
      const unit = g.unit ? " " + g.unit : "";
      lines.push(
        `🎯 ${applied.created ? "هدف جديد" : "تقدّم في هدف"}: ${applied.title} — ${fmtNum(applied.current)}${tgt}${unit}${pct}`
      );
    }

    // الصحة: نسجّل كل عنصر صحي يخص المستخدم ونعرضه في "الصفحة"
    const savedHealth = [];
    for (const h of health ?? []) {
      addHealth(h);
      savedHealth.push(h);
      lines.push(`🩺 صحة (${h.category}${h.bodyRegion ? " · " + h.bodyRegion : ""}): ${h.detail}`);
    }

    // متابعة حالة صحية: نفتح متابعة لمدة (٣٠ يوم افتراضي) لو طلبها
    let savedCondition = null;
    if (condition) {
      const c = addCondition({
        title: condition.title,
        startDate: today,
        durationDays: condition.durationDays || 30,
      });
      if (c) {
        savedCondition = c;
        if (c.created) {
          lines.push(`🩹 متابعة جديدة: ${c.title} — من ${c.start_date} لـ ${c.end_date}`);
        } else {
          lines.push(`🩹 متابعة شغّالة بالفعل: ${c.title} (لـ ${c.end_date})`);
        }
      }
    }

    // الأكل: بند مستقل نسجّل فيه كل أكلة
    const savedMeals = [];
    for (const m of meals ?? []) {
      addMeal(m);
      savedMeals.push(m);
      lines.push(`🍽️ أكل (${m.entryDate}): ${m.items}`);
    }

    // العادات: نعرّف العادة أو نسجّل إنها اتعملت النهاردة
    const savedHabits = [];
    for (const h of habits ?? []) {
      let habit = findHabitByTitle(h.title);
      if (!habit && (h.action === "create" || h.action === "both")) {
        habit = addHabit({ title: h.title, kind: h.kind, emoji: h.emoji });
        if (habit?.created) {
          lines.push(`${h.emoji || (h.kind === "quit" ? "🚭" : "🔁")} عادة جديدة: ${habit.title}`);
        }
      } else if (!habit) {
        // قال إنه عملها من غير ما تكون معرّفة → نعرّفها ونسجّلها
        habit = addHabit({ title: h.title, kind: h.kind, emoji: h.emoji });
        lines.push(`${h.emoji || (h.kind === "quit" ? "🚭" : "🔁")} عادة جديدة: ${habit.title}`);
      }
      if (habit && (h.action === "done" || h.action === "both")) {
        const res = logHabit(habit.id, h.date);
        if (res.logged) lines.push(`✅ عادة اتعملت: ${habit.title} (${res.date})`);
      }
      savedHabits.push({ title: h.title, kind: h.kind, action: h.action, date: h.date });
    }

    // الماليات: كسب/صرف بالبند
    const savedFinance = [];
    for (const f of finance ?? []) {
      addFinance(f);
      savedFinance.push(f);
      const sign = f.direction === "income" ? "➕ دخل" : "➖ صرف";
      lines.push(`💰 ${sign}: ${fmtNum(f.amount)} ${f.currency}${f.note ? " · " + f.note : ""}`);
    }

    const confirm = `اتسجّلت ✅\n${lines.join("\n")}`;
    await ctx.reply(confirm);

    // الرد التأمّلي الفوري (بيهنّي على الأهداف كمان)
    let reflection = "";
    try {
      await ctx.sendChatAction("typing");
      reflection = await reflectOnEntry(text, memoryContext, goalUpdates);
      if (reflection) await ctx.reply(reflection);
    } catch (err) {
      console.error("reflect error:", err); // مش هنوقّف الحفظ لو التأمّل فشل
    }

    // سجل المحادثة للمراجعة والتحسين بعدين
    try {
      logConversation({
        chatId,
        kind,
        userText: text,
        aiReply: reflection || confirm,
        meta: { journal, goals: goalUpdates, health: savedHealth, condition: savedCondition, meals: savedMeals, habits: savedHabits, finance: savedFinance },
      });
    } catch (err) {
      console.error("log conversation error:", err);
    }
  } catch (err) {
    console.error("process error:", err);
    await ctx.reply("حصل خطأ أثناء المعالجة، جرّب تاني.");
  }
}

function fmtNum(n) {
  return Number(n).toLocaleString("en-US");
}
