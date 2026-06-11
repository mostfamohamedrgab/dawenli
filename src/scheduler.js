// المبادرة — بتشتغل من غير أي اعتماد خارجي (مفيش تيليجرام).
// القناة الوحيدة للتنبيه هي notifyUser: بيتخزّن في الجرس داخل التطبيق + push للموبايل (PWA).
//   ١) تذكير بالمهام في معادها (لحظي).
//   ٢) check-in يومي — الـ agent بيسأل كل مستخدم نشط عن اللي ناقص في عوالمه.
//   ٣) تأمّل أسبوعي على آخر ٧ أيام.
import { config } from "./config.js";
import { analyzeEntries } from "./openai.js";
import { composeCheckin } from "./agent.js";
import { entriesSince, dueTaskReminders, markTaskReminded, activeUsers } from "./db.js";
import { notifyUser } from "./push.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function startScheduler() {
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
          await notifyUser(t.user_id, {
            title: "⏰ تذكير بمهمة",
            body: `${t.title}${t.due_time ? " — الساعة " + t.due_time : ""}${t.note ? "\n📝 " + t.note : ""}`,
            url: "/",
            icon: "⏰",
          }).catch(() => {});
        }
      } catch (err) {
        console.error("task reminder error:", err);
      }
    }

    // الـ check-in اليومي — بيسأل كل مستخدم نشط (آخر ظهور خلال ١٤ يوم) عن الناقص في عوالمه الأربعة.
    // بنبعت للنشطين بس عشان منهدرش نداءات OpenAI على حسابات نايمة، وبستاجر بسيط بين الرسايل.
    if (c.hour === config.checkinHour && c.minute === 0 && lastCheckin !== c.date) {
      lastCheckin = c.date;
      const targets = activeUsers(14);
      console.log(`🌙 check-in اليومي — ${targets.length} مستخدم نشط`);
      for (const user of targets) {
        try {
          const msg = await composeCheckin(user);
          await notifyUser(user.id, {
            title: "🌙 check-in اليومي",
            body: msg,
            url: "/",
            icon: "🌙",
          }).catch(() => {});
        } catch (err) {
          console.error(`checkin error (user ${user.id}):`, err);
        }
        await sleep(500); // ستاجر لطيف
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
      for (const user of activeUsers(30)) {
        await sendWeeklyReflection(user);
        await sleep(500);
      }
    }
  }, 30 * 1000);

  console.log(
    `⏰ المبادرة شغّالة — check-in يومي ${config.checkinHour}:00، تأمّل أسبوعي يوم ${config.weeklyDay} الساعة ${config.weeklyHour}:00، وتذكير مهام لحظي (${config.timezone})`
  );
}

async function sendWeeklyReflection(user) {
  const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const entries = entriesSince(user.id, since);
  if (!entries.length) return; // مفيش تدوين الأسبوع ده — مفيش داعي نزعّجه
  try {
    const analysis = await analyzeEntries(entries, user.id);
    await notifyUser(user.id, {
      title: "🪞 تأمّل الأسبوع",
      body: analysis,
      url: "/",
      icon: "🪞",
    }).catch(() => {});
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
