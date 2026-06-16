/* ===================== دوّنلي Agent =====================
   العقل الجديد: بدل نداء تصنيف واحد، ده agent بيلف بـ tool calling:
   - بيستخرج من كلام المستخدم (صوت أو نص): فلوس، صحة ونفسية، أهداف، عادات، مهام، أكل، يوميات.
   - عنده ذاكرة محادثة، فيقدر يسأل سؤال توضيحي ويكمّل التسجيل لما المستخدم يرد.
   - عنده أدوات استعلام فيجاوب على "صرفت كام الشهر ده؟" من البيانات الحقيقية.
   - بيبادر يوميًا ويسأل عن اللي ناقص (مصاريف؟ عادات؟ يومك عدى إزاي؟). */

import { client, logChatUsage } from "./openai.js";
import { config } from "./config.js";
import {
  localToday,
  upsertJournalForDay,
  correctJournal,
  listEntries,
  entriesSince,
  addFinance,
  financeSince,
  financeBetween,
  FINANCE_CATEGORIES,
  addHealth,
  healthSince,
  healthBetween,
  entriesBetween,
  mealsBetween,
  applyGoal,
  listGoals,
  addHabit,
  findHabitByTitle,
  logHabit,
  listHabits,
  addTask,
  completeTask,
  listTasks,
  pendingTasks,
  addCondition,
  activeConditions,
  addMeal,
  logConversation,
  recentConversations,
  upsertProfileFact,
  profileForAgent,
  addIdea,
  recentIdeas,
  addProblem,
  resolveProblem,
  activeProblems,
  PROBLEM_AREAS,
} from "./db.js";

/* ===================== الأدوات ===================== */

const REGIONS = ["راس", "صدر", "معدة", "بطن", "ذراعين", "ساقين", "عام"];
const HEALTH_CATS = ["تمرين", "دواء", "أكل", "عرض", "نوم", "نفسية", "ملاحظة"];

const TOOLS = [
  {
    type: "function",
    function: {
      name: "save_journal",
      description:
        "سجّل تدوينة يوميات من كلام المستخدم عن يومه. استخدمها كل مرة المستخدم يحكي عن يومه أو مشاعره — مش لما يسأل سؤال بس.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "ملخص في جملة بعربي بسيط محايد" },
          mood: { type: "string", description: "كلمة واحدة عن مزاجه: مبسوط/متوتر/عادي/حزين/متحمس/قلقان/تعبان" },
          tags: { type: "array", items: { type: "string" }, description: "وسوم قصيرة" },
          date: { type: "string", description: "اليوم اللي بيتكلم عنه YYYY-MM-DD" },
        },
        required: ["summary"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "correct_journal",
      description:
        "عدّل/صحّح كلمة أو جملة في يوميات يوم معيّن لما المستخدم يطلب التعديل صراحةً (مثلاً «عدّل في يوم الخميس كلمة كذا لكذا» أو «المبلغ غلط خليه كذا»). لو مش متأكد من النص الحالي بالظبط استخدم get_data الأول عشان تشوف نص اليوم.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "تاريخ اليوم المطلوب تعديله YYYY-MM-DD (من past_days)" },
          find: { type: "string", description: "النص/الكلمة الحالية بالظبط اللي هتتغير" },
          replace: { type: "string", description: "النص البديل" },
        },
        required: ["date", "find", "replace"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_finance",
      description: "سجّل عملية مالية: صرف أو دخل. لكل عملية نداء منفصل.",
      parameters: {
        type: "object",
        properties: {
          direction: { type: "string", enum: ["expense", "income"] },
          amount: { type: "number", description: "المبلغ — رقم موجب" },
          currency: { type: "string", description: "حطّها بس لو المستخدم ذكر عملة صراحةً (زي دولار، ريال، درهم). للمصاريف العادية سيبها فاضية." },
          category: { type: "string", enum: FINANCE_CATEGORIES, description: "بند الصرف" },
          note: { type: "string", description: "وصف قصير (مثلاً: غدا مع أصحابي)" },
          date: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["direction", "amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_idea",
      description:
        "سجّل فكرة أو حاجة المستخدم ناوي يعملها أو خاطر جه في باله — مش مهمة بمعاد محدد (دي للمهام). مثلاً «عندي فكرة مشروع»، «نفسي أعمل قناة»، «المفروض أجرّب كذا».",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "الفكرة في جملة قصيرة" },
          detail: { type: "string", description: "تفاصيل إضافية لو موجودة" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_problem",
      description:
        "سجّل مشكلة أو همّ أو حاجة مضايقة المستخدم وعايز يتخلص منها — مش عرض صحي لحظي (ده log_health). مثلاً «متضايق من شغلي»، «فيه مشكلة بيني وبين حد»، «حاسس إني مش مرتاح من كذا». استخرجها حتى لو ماطلبش صراحةً.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "المشكلة في جملة قصيرة" },
          detail: { type: "string", description: "تفاصيل إضافية لو موجودة" },
          area: { type: "string", enum: PROBLEM_AREAS, description: "مجال المشكلة" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "resolve_problem",
      description:
        "علّم مشكلة سابقة إنها اتحلّت لما المستخدم يقول إنها خلصت أو اتحسّنت خالص. استخدم نفس عنوان المشكلة من السياق (active_problems).",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "عنوان المشكلة اللي اتحلّت (زي ما هي في السياق)" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "upsert_goal",
      description:
        "أنشئ هدف جديد أو سجّل تقدّم في هدف موجود. لو الهدف موجود في السياق استخدم نفس عنوانه بالظبط. لو المستخدم حقق جزء قول add_amount، ولو قال الإجمالي بقى كذا قول set_current.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "اسم الهدف — قصير وثابت" },
          target: { type: "number", description: "الرقم المستهدف" },
          add_amount: { type: "number", description: "مبلغ يتضاف للتقدّم الحالي" },
          set_current: { type: "number", description: "قيمة التقدّم الإجمالية الجديدة" },
          unit: { type: "string", description: "الوحدة (جنيه، كيلو، صفحة...)" },
          note: { type: "string" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_habit",
      description:
        "عرّف عادة جديدة أو سجّل إن المستخدم عملها النهاردة. خلّي العنوان قصير وثابت (رياضة، قراءة، سجاير). kind: do = بيعملها، quit = بيبطّلها.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          kind: { type: "string", enum: ["do", "quit"] },
          action: {
            type: "string",
            enum: ["create", "done", "both"],
            description: "create = بيعرّفها بس، done = عملها/التزم بيها في اليوم ده، both = الاتنين",
          },
          emoji: { type: "string", description: "إيموجي مناسب" },
          date: { type: "string", description: "يوم التنفيذ YYYY-MM-DD" },
        },
        required: ["title", "action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_task",
      description:
        "ضيف مهمة للتقويم. لو المستخدم قال معاد (بكرة الساعة ٥، يوم الخميس...) حوّله لتاريخ ووقت. لو المعاد مش واضح خالص اسأله الأول.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "اسم المهمة" },
          date: { type: "string", description: "YYYY-MM-DD" },
          time: { type: "string", description: "HH:MM بنظام 24 ساعة، سيبها لو مهمة لليوم كله" },
          note: { type: "string" },
        },
        required: ["title", "date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_task",
      description: "علّم مهمة إنها خلصت لما المستخدم يقول إنه عملها.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "اسم المهمة أو جزء منه" },
          id: { type: "number", description: "رقم المهمة لو معروف من السياق" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_health",
      description:
        "سجّل حاجة صحية أو نفسية تخص المستخدم شخصيًا: عرَض، دواء، تمرين، نوم، حالة نفسية. صحة حد تاني ماتسجّلهاش. لكل حاجة نداء منفصل.",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", enum: HEALTH_CATS },
          detail: { type: "string", description: "وصف قصير بعربي بسيط" },
          body_region: {
            type: "string",
            enum: REGIONS,
            description:
              "جري/مشي → ساقين، كارديو/نفس → صدر، هضم/معدة → معدة، كلى/أملاح → بطن، صداع/نوم/نفسية → راس، عام لو مش محدد",
          },
          date: { type: "string", description: "YYYY-MM-DD" },
          time: { type: "string", description: "HH:MM لو ذكر وقت" },
        },
        required: ["category", "detail"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "track_condition",
      description:
        "افتح متابعة لحالة صحية لو المستخدم عايز يتابعها للأيام الجاية أو يجمّع أعراض للدكتور (مثلاً: ارتجاع مريئي). مش كل عرض عابر — لازم نية متابعة.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "اسم الحالة" },
          duration_days: { type: "number", description: "مدة المتابعة بالأيام، الافتراضي 30" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_meal",
      description: "سجّل أكل أو مشروب تناوله المستخدم.",
      parameters: {
        type: "object",
        properties: {
          items: { type: "string", description: "اللي أكله (رز وفراخ، شاي بسكر...)" },
          note: { type: "string", description: "الوقت أو الكمية" },
          date: { type: "string", description: "YYYY-MM-DD" },
          time: { type: "string", description: "HH:MM" },
        },
        required: ["items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remember",
      description:
        "احفظ معلومة **دائمة** ومهمة عن الشخص نفسه عشان تفضل فاكرها في أي محادثة جاية: مين هو، بيدرس/بيشتغل إيه، أمراض مزمنة، أدوية بياخدها بانتظام، حساسية، تفضيلات ثابتة، أهم العلاقات (مراته/أولاده...). دي حاجات ثابتة مش أحداث يوم. لو المعلومة بتتغير (زي الوزن) استخدم نفس الـ key وهتتحدّث. ماتحفظش أحداث عابرة هنا (دي بتتسجل في اليوميات/الصحة).",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["هوية", "دراسة_وشغل", "صحة", "تفضيلات", "علاقات", "أخرى"],
            description: "هوية=اسم/سن/مكان، دراسة_وشغل=تخصص/شغل، صحة=مرض مزمن/دواء/حساسية، تفضيلات، علاقات",
          },
          key: { type: "string", description: "مفتاح قصير ثابت (مثلاً: التخصص، مرض مزمن، حساسية، الوزن)" },
          value: { type: "string", description: "القيمة (مثلاً: طب بشري سنة تالتة)" },
        },
        required: ["category", "key", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_data",
      description:
        "هات بيانات المستخدم الحقيقية للإجابة على أسئلته — سواء عن دلوقتي أو عن الماضي (امبارح أكلت إيه؟ الأسبوع اللي فات عملت إيه؟ صرفت كام الشهر ده؟). استخدمها قبل أي إجابة عن بياناته. للأسئلة عن يوم أو فترة معيّنة استخدم topic='day' أو حدّد from/to بالتواريخ المحسوبة من سياق الأيام.",
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            enum: ["day", "finance", "goals", "habits", "tasks", "health", "journal", "meals"],
            description:
              "day = كل اللي حصل في يوم معيّن (يوميات+أكل+صحة+فلوس) — مثالي لـ«امبارح عملت إيه». غير كده اختار المحور المطلوب.",
          },
          date: { type: "string", description: "يوم محدد YYYY-MM-DD (لـ topic='day' أو سؤال عن يوم واحد)" },
          from: { type: "string", description: "بداية الفترة YYYY-MM-DD" },
          to: { type: "string", description: "نهاية الفترة YYYY-MM-DD" },
          days: { type: "number", description: "بدل from/to: عدد الأيام لورا من النهاردة، الافتراضي 30" },
        },
        required: ["topic"],
      },
    },
  },
];

/* ===================== تنفيذ الأدوات ===================== */

const fmtNum = (n) => Number(n).toLocaleString("en-US");

function daysAgo(n) {
  const d = new Date(`${localToday()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
function daysAhead(n) {
  return daysAgo(-n);
}

const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isTime = (s) => typeof s === "string" && /^\d{2}:\d{2}$/.test(s);

// بينفّذ أداة واحدة ويرجّع { result للموديل, receipt سطر للمستخدم }
// ctx: { userId, sourceText } — النص الأصلي بيتحفظ في اليوميات مش ملخص الموديل بس
function executeTool(ctx, name, args) {
  const { userId } = ctx;
  const today = localToday();
  const date = isDate(args.date) ? args.date : today;

  switch (name) {
    case "save_journal": {
      const r = upsertJournalForDay({
        userId,
        entryDate: date,
        mood: args.mood || null,
        summary: args.summary,
        tags: Array.isArray(args.tags) ? args.tags : [],
        transcript: ctx.sourceText || args.summary,
        raw: { via: "agent" },
      });
      return {
        result: { ok: true, merged: r.merged },
        receipt: `📝 يوميات (${date})${args.mood ? " — " + args.mood : ""}`,
      };
    }
    case "correct_journal": {
      if (!isDate(args.date)) return { result: { ok: false, error: "date لازم YYYY-MM-DD" } };
      const r = correctJournal(userId, args.date, String(args.find || ""), String(args.replace ?? ""));
      return {
        result: { ok: r.changed, ...r },
        receipt: r.changed
          ? `✏️ تعديل يوميات (${args.date}): «${args.find}» → «${args.replace}»`
          : `⚠️ ملقيتش «${args.find}» في يوميات ${args.date}`,
      };
    }
    case "log_finance": {
      const amount = Number(args.amount);
      if (!(amount > 0)) return { result: { ok: false, error: "amount لازم رقم موجب" } };
      addFinance({
        userId,
        entryDate: date,
        direction: args.direction,
        amount,
        currency: args.currency || null,
        category: args.category || "أخرى",
        note: args.note || null,
      });
      const sign = args.direction === "income" ? "➕ دخل" : "➖ صرف";
      return {
        result: { ok: true },
        receipt: `💰 ${sign}: ${fmtNum(amount)} ${args.currency || "جنيه"}${args.category ? " · " + args.category : ""}${args.note ? " · " + args.note : ""}`,
      };
    }
    case "log_idea": {
      if (!args.title) return { result: { ok: false, error: "محتاج عنوان للفكرة" } };
      const idea = addIdea({ userId, title: args.title, detail: args.detail || null });
      return { result: { ok: !!idea }, receipt: `💡 فكرة: ${args.title}` };
    }
    case "log_problem": {
      if (!args.title) return { result: { ok: false, error: "محتاج عنوان للمشكلة" } };
      const p = addProblem({ userId, title: args.title, detail: args.detail || null, area: args.area });
      return {
        result: { ok: !!p, created: p?.created },
        receipt: `🧩 مشكلة: ${args.title}${args.area ? " · " + args.area : ""}`,
      };
    }
    case "resolve_problem": {
      const r = resolveProblem(userId, { title: args.title });
      return { result: { ok: !!r }, receipt: r ? `🧩 اتحلّت: ${r.title}` : `⚠️ ملقيتش المشكلة دي` };
    }
    case "upsert_goal": {
      const applied = applyGoal({
        userId,
        title: args.title,
        target: args.target ?? null,
        addAmount: args.add_amount ?? null,
        setCurrent: args.set_current ?? null,
        unit: args.unit || null,
        note: args.note || null,
      });
      if (!applied) return { result: { ok: false, error: "title مطلوب" } };
      const pct = applied.target
        ? Math.min(100, Math.round((applied.current / applied.target) * 100))
        : null;
      const tgt = applied.target ? `/${fmtNum(applied.target)}` : "";
      const unit = applied.unit ? " " + applied.unit : "";
      return {
        result: { ok: true, created: applied.created, current: applied.current, target: applied.target, percent: pct },
        receipt: `🎯 ${applied.created ? "هدف جديد" : "تقدّم في هدف"}: ${applied.title} — ${fmtNum(applied.current)}${tgt}${unit}${pct != null ? ` (${pct}%)` : ""}`,
      };
    }
    case "log_habit": {
      const receipts = [];
      let habit = findHabitByTitle(userId, args.title);
      if (!habit) {
        habit = addHabit({ userId, title: args.title, kind: args.kind || "do", emoji: args.emoji || null });
        if (habit?.created)
          receipts.push(`${args.emoji || (args.kind === "quit" ? "🚭" : "🔁")} عادة جديدة: ${habit.title}`);
      }
      let logged = false;
      if (habit && (args.action === "done" || args.action === "both")) {
        const r = logHabit(habit.id, date);
        logged = r.logged;
        if (r.logged) receipts.push(`✅ عادة اتعملت: ${habit.title} (${r.date})`);
      }
      return { result: { ok: true, habit: habit?.title, logged }, receipt: receipts.join("\n") || null };
    }
    case "add_task": {
      if (!isDate(args.date)) return { result: { ok: false, error: "date لازم YYYY-MM-DD" } };
      const task = addTask({
        userId,
        title: args.title,
        dueDate: args.date,
        dueTime: isTime(args.time) ? args.time : null,
        note: args.note || null,
      });
      return {
        result: { ok: true, id: task.id },
        receipt: `📅 مهمة في التقويم: ${task.title} — ${task.due_date}${task.due_time ? " ⏰ " + task.due_time : ""}`,
      };
    }
    case "complete_task": {
      const task = completeTask(userId, { id: args.id, title: args.title });
      if (!task) return { result: { ok: false, error: "ملقتش المهمة" } };
      return { result: { ok: true, title: task.title }, receipt: `☑️ مهمة خلصت: ${task.title}` };
    }
    case "log_health": {
      addHealth({
        userId,
        entryDate: date,
        atTime: isTime(args.time) ? args.time : null,
        category: HEALTH_CATS.includes(args.category) ? args.category : "ملاحظة",
        detail: args.detail,
        bodyRegion: REGIONS.includes(args.body_region) ? args.body_region : "عام",
      });
      const ico = args.category === "نفسية" ? "🧠" : "🩺";
      return {
        result: { ok: true },
        receipt: `${ico} ${args.category || "ملاحظة"}${args.body_region && args.body_region !== "عام" ? " · " + args.body_region : ""}: ${args.detail}`,
      };
    }
    case "track_condition": {
      const c = addCondition({
        userId,
        title: args.title,
        startDate: today,
        durationDays: args.duration_days || 30,
      });
      if (!c) return { result: { ok: false, error: "title مطلوب" } };
      return {
        result: { ok: true, created: c.created, end_date: c.end_date },
        receipt: c.created
          ? `🩹 متابعة جديدة: ${c.title} — لحد ${c.end_date}`
          : `🩹 متابعة شغّالة بالفعل: ${c.title} (لـ ${c.end_date})`,
      };
    }
    case "log_meal": {
      addMeal({
        userId,
        entryDate: date,
        atTime: isTime(args.time) ? args.time : null,
        items: args.items,
        note: args.note || null,
      });
      return { result: { ok: true }, receipt: `🍽️ أكل (${date}): ${args.items}` };
    }
    case "remember": {
      const f = upsertProfileFact({
        userId,
        category: args.category,
        key: args.key,
        value: args.value,
      });
      if (!f) return { result: { ok: false, error: "key و value مطلوبين" } };
      return {
        result: { ok: true, created: f.created },
        receipt: `🧠 ${f.created ? "افتكرت عنك" : "حدّثت معلومة"}: ${f.key} — ${f.value}`,
      };
    }
    case "get_data": {
      // نحدّد نافذة التاريخ: date واحد، أو from/to، أو days لورا (افتراضي 30)
      const days = Number(args.days) > 0 ? Number(args.days) : 30;
      let from, to;
      if (isDate(args.date)) {
        from = to = args.date;
      } else {
        from = isDate(args.from) ? args.from : daysAgo(days - 1);
        to = isDate(args.to) ? args.to : today;
      }

      switch (args.topic) {
        case "day": {
          // كل اللي حصل في يوم (أو فترة) — للأسئلة زي "امبارح عملت إيه"
          const journal = entriesBetween(userId, from, to);
          const meals = mealsBetween(userId, from, to);
          const health = healthBetween(userId, from, to);
          const fin = financeBetween(userId, from, to);
          return {
            result: {
              from, to,
              journal: journal.map((e) => ({ date: e.entry_date, mood: e.mood, text: e.summary || (e.transcript || "").slice(0, 200) })),
              meals: meals.map((m) => ({ date: m.entry_date, items: m.items, time: m.at_time, note: m.note })),
              health: health.map((h) => ({ date: h.entry_date, category: h.category, detail: h.detail })),
              finance: fin.map((f) => ({ date: f.entry_date, dir: f.direction, amount: f.amount, category: f.category, note: f.note })),
              empty: !journal.length && !meals.length && !health.length && !fin.length,
            },
          };
        }
        case "finance": {
          const rows = financeBetween(userId, from, to);
          const income = rows.filter((r) => r.direction === "income").reduce((a, r) => a + r.amount, 0);
          const expense = rows.filter((r) => r.direction === "expense").reduce((a, r) => a + r.amount, 0);
          const byCat = {};
          for (const r of rows.filter((r) => r.direction === "expense"))
            byCat[r.category || "أخرى"] = (byCat[r.category || "أخرى"] || 0) + r.amount;
          return {
            result: {
              from, to, income, expense, net: income - expense,
              expense_by_category: byCat,
              items: rows.slice(-25).map((r) => ({ date: r.entry_date, dir: r.direction, amount: r.amount, category: r.category, note: r.note })),
            },
          };
        }
        case "meals":
          return {
            result: mealsBetween(userId, from, to).map((m) => ({
              date: m.entry_date, items: m.items, time: m.at_time, note: m.note,
            })),
          };
        case "goals":
          return {
            result: listGoals(userId).map((g) => ({
              title: g.title, current: g.current, target: g.target, unit: g.unit,
              percent: g.target ? Math.round((g.current / g.target) * 100) : null,
            })),
          };
        case "habits":
          return {
            result: listHabits(userId).map((h) => ({
              title: h.title, kind: h.kind, streak: h.streak, total: h.total, done_today: h.doneToday,
            })),
          };
        case "tasks":
          return {
            result: listTasks(userId, daysAgo(7), daysAhead(days)).map((t) => ({
              id: t.id, title: t.title, date: t.due_date, time: t.due_time, status: t.status,
            })),
          };
        case "health":
          return {
            result: healthBetween(userId, from, to).map((h) => ({
              date: h.entry_date, category: h.category, detail: h.detail, region: h.body_region,
            })),
          };
        case "journal":
          return {
            result: entriesBetween(userId, from, to).map((e) => ({
              date: e.entry_date, mood: e.mood, summary: e.summary,
            })),
          };
        default:
          return { result: { ok: false, error: "topic مش معروف" } };
      }
    }
    default:
      return { result: { ok: false, error: `أداة مش معروفة: ${name}` } };
  }
}

/* ===================== سياق الـ agent ===================== */

const AR_WEEKDAYS = ["الأحد", "الإتنين", "التلات", "الأربع", "الخميس", "الجمعة", "السبت"];
function weekdayOf(dateStr) {
  return AR_WEEKDAYS[new Date(`${dateStr}T00:00:00Z`).getUTCDay()];
}

// لقطة سريعة من بيانات المستخدم — بتتبني مع كل رسالة عشان الـ agent يكون فاهم وضعه
function buildSnapshot(userId) {
  const today = localToday();
  const todayFinance = financeSince(userId, today);
  const spentToday = todayFinance.filter((f) => f.direction === "expense").reduce((a, f) => a + f.amount, 0);
  const goals = listGoals(userId).slice(0, 10);
  const habits = listHabits(userId);
  const tasks = pendingTasks(userId, 12).filter((t) => t.due_date <= daysAhead(7));
  const conditions = activeConditions(userId);
  const ideas = recentIdeas(userId, 12);
  const problems = activeProblems(userId);
  const recentJournal = listEntries(userId, 3);
  const profile = profileForAgent(userId); // الذاكرة الدائمة عن الشخص

  // الأسبوع الجاي بالتواريخ عشان "الخميس الجاي" تتحول صح
  const week = [];
  for (let i = 0; i < 7; i++) {
    const d = daysAhead(i);
    week.push(`${weekdayOf(d)} = ${d}`);
  }
  // الأيام اللي فاتت بالتواريخ — عشان "امبارح"، "أول امبارح"، "الأسبوع اللي فات" تتحسب صح
  const past = [];
  for (let i = 1; i <= 8; i++) {
    const d = daysAgo(i);
    const label = i === 1 ? "امبارح" : i === 2 ? "أول امبارح" : `من ${i} أيام`;
    past.push(`${label} (${weekdayOf(d)}) = ${d}`);
  }

  return {
    today: `${today} (${weekdayOf(today)})`,
    profile, // مين هو، بيدرس/بيشتغل إيه، أمراضه المزمنة، تفضيلاته
    next_days: week.join("، "),
    past_days: past.join("، "),
    spent_today: spentToday,
    // قائمة مصاريف/دخل النهاردة المسجّلة فعلًا — عشان الـ agent يقارن ومايكرّرش نفس القيد
    finance_today: todayFinance.map(
      (f) => `${f.direction === "income" ? "دخل" : "صرف"} ${f.amount} ${f.currency || "جنيه"}${f.category ? " · " + f.category : ""}${f.note ? " · " + f.note : ""}`
    ),
    goals: goals.map((g) => `${g.title}: ${g.current}${g.unit ? " " + g.unit : ""}${g.target ? ` من ${g.target}` : ""}`),
    habits: habits.map((h) => `${h.title} (${h.kind === "quit" ? "بيبطّلها" : "بيعملها"})${h.doneToday ? " ✓ اتعملت النهاردة" : ""} — ستريك ${h.streak}`),
    pending_tasks: tasks.map((t) => `#${t.id} ${t.title} — ${t.due_date}${t.due_time ? " " + t.due_time : ""}`),
    active_conditions: conditions.map((c) => `${c.title} (متابعة لحد ${c.end_date})`),
    recent_ideas: ideas.map((i) => `${i.title}${i.status === "done" ? " ✓" : ""}`),
    active_problems: problems.map(
      (p) => `${p.title}${p.area ? " (" + p.area + ")" : ""}${p.status === "working" ? " — بنشتغل عليها" : ""}`
    ),
    recent_journal: recentJournal.map((e) => `${e.entry_date} (${e.mood || "?"}): ${e.summary || ""}`),
  };
}

const SYSTEM_PROMPT = `انت "دوّنلي" — رفيق تدوين شخصي ذكي بتتكلم عربي بسيط محايد (مش لهجة بلد معيّن، عشان كل العرب يفهموك). المستخدم بيبعتلك صوت (مفرّغ) أو نص عن يومه،
وانت شغلتك تسمعه كصاحب قريّب، وتسجّل كل حاجة مفيدة من كلامه بالأدوات المتاحة.

# قواعد الاستخراج
- استخرج **كل** اللي في الكلام: مصاريف ودخل (بالبند)، صحة ونفسية، أكل، عادات، أهداف، مهام بمواعيدها، وتدوينة اليوميات.
- **اليوم الصح لكل حاجة (مهم):** المستخدم ساعات بيحكي عن يوم فات — "امبارح عملت كذا"، "أول امبارح"، "يوم التلات اللي فات"، "من ٣ أيام"، أو حتى وسط الكلام. لو الحدث حصل في يوم فات → سجّله **بتاريخ اليوم ده مش النهاردة**: حِط \`date\` على أداة التسجيل (save_journal / log_finance / log_health / log_meal / log_habit) بالتاريخ المحسوب من **past_days** اللي في السياق (مثلاً لو النهاردة الجمعة و"امبارح" يبقى الخميس بتاريخه). لو ماذكرش يوم → النهاردة. الرسالة الواحدة ممكن تبقى فيها حاجات لأيام مختلفة — **كل واحدة بتاريخها هي**.
- لما المستخدم يحكي عن يومه أو مشاعره → لازم تسجّل save_journal. لو بيسأل سؤال بس من غير حكي → ماتسجّلش يوميات.
- **التعديل والتصحيح:** لو المستخدم طلب يعدّل/يصحّح حاجة في يوم فات («عدّل في يوم كذا الكلمة الفلانية»، «دي غلط خليها كذا») → استخدم correct_journal بتاريخ اليوم (من past_days) مع find = النص الحالي بالظبط و replace = البديل. لو مش متأكد من صيغة النص الحالي، اقرا اليوم بـ get_data الأول وبعدين عدّل.
- الأهداف: لو بيتكلم عن تقدّم في هدف موجود في السياق، استخدم **نفس عنوان الهدف بالظبط**.
- **اربط الدخل بالهدف:** لو المستخدم كسب أو وفّر فلوس وعنده في السياق هدف نشط بنفس العملة/الفكرة (مثلاً هدف ادخار «أوصل ١٠ آلاف دولار» وهو كسب دولار) → بالإضافة لـ log_finance، زوّد تقدّم الهدف بـ upsert_goal action=add_amount بنفس عنوان الهدف وبالمبلغ بعملته. خلّي بالك من العملة: ماتخلطش دخل بالدولار في هدف بالجنيه.
- العادات: عنوان قصير ثابت ("رياضة" مش "لعبت رياضة في الجيم"). لو عملها من غير ما تكون معرّفة → action="both".
- المهام: أي حاجة ليها معاد ("عندي ميتنج بكرة الساعة ٥") → add_task بتاريخ محسوب صح من جدول الأيام اللي في السياق.
- **الأفكار (log_idea):** لو قال فكرة أو حاجة ناوي/نفسه يعملها من غير معاد محدد ("عندي فكرة…"، "نفسي أعمل قناة"، "المفروض أجرّب كذا") → سجّلها بـ log_idea. لو ليها معاد واضح فهي مهمة (add_task) مش فكرة. شوف \`recent_ideas\` في السياق ومتكرّرش فكرة موجودة.
- **المشاكل والهموم (log_problem):** لو حسّيت إن في حاجة مضايقة المستخدم أو بتقلقه أو عايز يتخلص منها ("متضايق من شغلي"، "تعبان نفسيًا بسبب…"، "في مشكلة بيني وبين حد") → سجّلها بـ log_problem بالمجال المناسب، **حتى لو ماطلبش صراحةً**. ده غير العرض الصحي اللحظي (log_health). شوف \`active_problems\` في السياق: لو نفس الهمّ متسجّل بلاش تكرار؛ ولو قال إنه اتحسّن/خلص → resolve_problem.
- الصحة النفسية: قلق، توتر، حزن، ضغط نفسي → log_health بـ category="نفسية" و body_region="راس".
- صحة حد تاني غير المستخدم ماتسجّلهاش خالص.
- **متسجّلش نفس الحاجة مرتين (مهم جدًا في الفلوس):** في سياقك \`finance_today\` فيها كل المصاريف/الدخل المسجّلة النهاردة. **قبل** أي نداء \`log_finance\`، بُص عليها كويس: لو نفس المبلغ (أو قريب منه) ووصف مشابه أو نفس البند اتسجّل خلاص — حتى لو المستخدم قاله بصيغة تانية أو في تسجيل صوتي منفصل (مثلاً «موزع واي فاي للبي سي ٤٠٠» و«موزع واي فاي ٤٠٠»، أو «أبو طارق ٩٥» و«أبو طارق كشري ٩٥») → **ماتسجّلوش تاني**. المستخدم بيدردش وبيكرّر نفس الحاجة بكلام مختلف، والتكرار ده بيبوّظ مجموع مصاريفه. لو عندك شك حقيقي إنهم عمليتين مختلفتين بنفس المبلغ، اسأله سؤال قصير («ده غير الـ ٤٠٠ اللي سجّلتهم قبل كده؟») بدل ما تسجّل تكرار. نفس المبدأ لباقي المحاور (أكل، صحة، مهام): لو واضح إنه متسجّل، بلاش تكرار.

# الذاكرة الدائمة عن الشخص (remember)
- في سياقك "profile" فيه أهم المعلومات الثابتة عن الشخص — اقراها واتعامل معاه على أساسها (مثلاً لو عنده مرض مزمن، خد باله في كلامك).
- لو ظهرت في الكلام معلومة **ثابتة ومهمة** عن الشخص نفسه (تخصصه/شغله، مرض مزمن، دواء بياخده بانتظام، حساسية، مكان سكنه، أهم علاقاته، تفضيل ثابت) ومش موجودة في الـ profile → احفظها بـ remember.
- فرّق بين الدائم والعابر: "عندي ارتجاع مزمن" → remember (صحة). "حاسس بصداع النهاردة" → log_health مش remember. "بدرس طب" → remember. "ذاكرت النهاردة ساعتين" → يوميات.
- ماتسألش عن معلومات للذاكرة بشكل استجوابي — احفظ بس اللي بيجي طبيعي في الكلام.

# الأسئلة التوضيحية
- لو في لبس حقيقي يمنع التسجيل الصح (قال "صرفت فلوس" من غير مبلغ، أو مهمة من غير معاد واضح، أو هدف غامض) → سجّل اللي واضح، واسأل **سؤال واحد قصير ومحدد** عن الناقص.
- **الأرقام المش متأكد منها:** لو رقم ممكن يكون اتفهم غلط من تفريغ الصوت (مثلاً «٥» ممكن تكون ٥ أو ٥٠٠، أو مبلغ شكله غريب/مش منطقي) → اسأله تأكيد قصير («قصدك ٥ ولا ٥٠٠؟») قبل ما تثبّت الرقم. سجّل باقي الكلام عادي، ولما يرد بالصح عدّل القيمة (بـ correct_journal أو سجّلها).
- لو المستخدم بيرد على سؤال سألته قبل كده (شوف المحادثة) → كمّل التسجيل بناءً على رده.
- ماتسألش لو الموضوع واضح أو الناقص مش مهم.

# الإجابة على الأسئلة (دلوقتي والماضي)
- لو سأل عن بياناته الحالية (صرف كام؟ باقي إيه في المهام؟ وصل لفين في هدفه؟) → استخدم get_data وجاوب من الأرقام الحقيقية.
- لو سأل عن الماضي ("امبارح أكلت إيه؟"، "الأسبوع اللي فات عملت إيه؟"، "إمتى آخر مرة جريت؟"، "صرفت كام الشهر اللي فات؟") → استخدم get_data بالتواريخ المضبوطة من "past_days" في السياق: لسؤال عن يوم استخدم topic="day" مع date، ولفترة استخدم from/to أو المحور المطلوب.
- لو السؤال عن يوم بعينه وعايز كل اللي حصل فيه → topic="day". لو محور واحد بس (أكل/فلوس/صحة) استخدم الـ topic المناسب.
- جاوب من النتيجة بس — لو رجعت فاضية (empty) قول بصراحة إنه ماسجّلش حاجة في اليوم/الفترة دي، متخترعش.

# أسلوب الرد النهائي
- قصير ودافئ بعربي بسيط محايد (مش لهجة بلد معيّن) — من سطرين لأربعة، كأنك صديق بيسمعه. حتى لو المستخدم كتب بلهجته، خلّي ردّك بعربي مبسّط محايد يفهمه كل العرب (مثلاً قول «اليوم» مش «النهاردة»، «أتمنى» مش «نفسي»).
- اعترف بمشاعره من غير مبالغة، واربط بتدويناته القديمة لو ليها علاقة.
- لو فيه تقدّم في هدف، هنّيه بالأرقام (وصل لكام من كام والنسبة).
- ممنوع: نصايح طبية أو إنك تدّعي إنك دكتور، كلام واعظ أو رسمي، تكرار كلامه بالنص.
- متقولش "سجلت كذا وكذا" بالتفصيل — في رسالة تأكيد منفصلة بتتبعت تلقائيًا. ركّز انت على الرد الإنساني.`;

/* ===================== حلقة الـ agent ===================== */

const MAX_TURNS = 6;
const HISTORY_LIMIT = 8;

export async function runAgent({ user, text, kind = "text" }) {
  const userId = user.id;
  const snapshot = buildSnapshot(userId);
  const history = recentConversations(userId, HISTORY_LIMIT);

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "system",
      content: `# سياق المستخدم دلوقتي\n${JSON.stringify(snapshot, null, 1)}`,
    },
  ];
  for (const c of history) {
    if (c.user_text) messages.push({ role: "user", content: c.user_text });
    if (c.ai_reply) messages.push({ role: "assistant", content: c.ai_reply });
  }
  messages.push({ role: "user", content: text });

  const receipts = [];
  const toolLog = [];
  let reply = "";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await client.chat.completions.create({
      model: config.agentModel,
      messages,
      tools: TOOLS,
      // أول لفة الموديل لازم ينده أداة على الأقل (يسجّل أو يجيب بيانات) —
      // من غيرها الموديلات الصغيرة بترد كلام وخلاص ومفيش حاجة بتتسجل
      tool_choice: turn === 0 ? "required" : "auto",
    });
    logChatUsage("agent", config.agentModel, res, userId);
    const msg = res.choices[0].message;
    messages.push(msg);
    console.log(
      `🧠 agent[${config.agentModel}] لفة ${turn + 1}: ${msg.tool_calls?.length || 0} أداة` +
        (msg.tool_calls?.length ? ` (${msg.tool_calls.map((t) => t.function.name).join("، ")})` : "")
    );

    if (!msg.tool_calls?.length) {
      reply = (msg.content || "").trim();
      break;
    }

    for (const tc of msg.tool_calls) {
      let args = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}");
      } catch {}
      let out;
      try {
        out = executeTool({ userId, sourceText: text }, tc.function.name, args);
      } catch (err) {
        // اللوج ده بيطلع في pm2 logs — أهم حاجة للتشخيص على السيرفر
        console.error(`❌ tool ${tc.function.name} failed with args ${JSON.stringify(args)}:`, err);
        out = { result: { ok: false, error: "حصل خطأ داخلي في الأداة" } };
      }
      if (out.receipt) receipts.push(out.receipt);
      toolLog.push({ tool: tc.function.name, args });
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(out.result ?? { ok: true }),
      });
    }
  }

  if (!reply) reply = "تمام، سجّلتلك كل حاجة ✅";

  logConversation({
    userId,
    chatId: user.chat_id,
    kind,
    userText: text,
    aiReply: reply,
    meta: toolLog.length ? { tools: toolLog } : null,
  });

  return { reply, receipts };
}

/* ===================== الـ check-in اليومي =====================
   الـ agent بيبص على يوم المستخدم ويشوف إيه الناقص، ويسأله عليه بالتحديد. */

export async function composeCheckin(user) {
  const userId = user.id;
  const today = localToday();

  const missing = [];
  const todayEntries = listEntries(userId, 8).filter((e) => e.entry_date === today);
  if (!todayEntries.length) missing.push("لسه ماحكاش عن يومه النهاردة (يومياته فاضية)");
  else if (!todayEntries.some((e) => e.mood)) missing.push("حكى عن يومه بس مذكرش مزاجه/إحساسه النهاردة");
  const financeToday = financeSince(userId, today);
  if (!financeToday.length) missing.push("ماسجّلش أي مصاريف النهاردة (اسأله صرف كام؟)");
  const habits = listHabits(userId);
  const notDone = habits.filter((h) => !h.doneToday).map((h) => h.title);
  if (notDone.length) missing.push(`عادات لسه ماتعلّمتش النهاردة: ${notDone.join("، ")}`);
  const healthToday = healthSince(userId, today);
  if (!healthToday.length) missing.push("مفيش أي تسجيل صحي أو نفسي النهاردة");
  const tomorrowTasks = listTasks(userId, daysAhead(1), daysAhead(1)).filter((t) => t.status === "pending");
  if (tomorrowTasks.length)
    missing.push(`مهام بكرة: ${tomorrowTasks.map((t) => t.title + (t.due_time ? " " + t.due_time : "")).join("، ")}`);

  const goals = listGoals(userId).slice(0, 5);

  const prompt = `انت "دوّنلي". دلوقتي معاد الـ check-in اليومي بتاعك مع المستخدم${user.name ? " (" + user.name + ")" : ""}.
اكتب رسالة قصيرة (سطرين لتلاتة) بعربي بسيط محايد (مش لهجة بلد معيّن) تسأله عن يومه وتركّز على ١-٢ من الحاجات الناقصة دي بالتحديد:
${missing.length ? missing.map((m) => "- " + m).join("\n") : "- كله متسجّل النهاردة — اسأله سؤال خفيف عن إحساسه بيومه."}
${goals.length ? "\nأهدافه الحالية (لو حبيت تفكّره بواحد منهم بلطف):\n" + goals.map((g) => `- ${g.title}: ${g.current}${g.unit ? " " + g.unit : ""}${g.target ? ` من ${g.target}` : ""}`).join("\n") : ""}

خليها دافية وشخصية ومش رسمية، وبسؤال واحد واضح يسهل يرد عليه. من غير مقدمات — الرسالة نفسها بس.`;

  const res = await client.chat.completions.create({
    model: config.agentModel,
    messages: [{ role: "user", content: prompt }],
  });
  logChatUsage("agent", config.agentModel, res, userId);
  const message = res.choices[0].message.content.trim();

  // بنسجّلها في المحادثة عشان لما يرد، الـ agent يبقى فاكر هو سأل إيه
  logConversation({ userId, chatId: user.chat_id, kind: "checkin", userText: null, aiReply: message });
  return message;
}
