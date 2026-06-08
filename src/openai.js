import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { config } from "./config.js";
import { recordAiUsage } from "./db.js";

const client = new OpenAI({ apiKey: config.openaiKey });

/* ===================== تسعير OpenAI (تقريبي — بالدولار) =====================
   الأسعار بتتغيّر، فلو حصل تحديث من OpenAI عدّل الأرقام هنا.
   - الموديلات النصية: السعر لكل مليون توكن (إدخال/إخراج).
   - Whisper: السعر للدقيقة الصوتية. */
const PRICING = {
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4o-mini-transcribe": { in: 1.25, out: 5 },
  "gpt-4o-transcribe": { in: 2.5, out: 10 },
  "whisper-1": { perMin: 0.006 },
};

function chatCost(model, usage = {}) {
  const p = PRICING[model] || PRICING["gpt-4o-mini"];
  const inTok = usage.prompt_tokens || 0;
  const outTok = usage.completion_tokens || 0;
  const cost = (inTok / 1e6) * (p.in || 0) + (outTok / 1e6) * (p.out || 0);
  return { inTok, outTok, cost };
}

// نسجّل تكلفة نداء شات (تصنيف/تحليل/رد...) — مايرميش لو فشل التسجيل
function logChatUsage(kind, model, res) {
  try {
    const { inTok, outTok, cost } = chatCost(model, res?.usage || {});
    recordAiUsage({ kind, model, inputTokens: inTok, outputTokens: outTok, costUsd: cost });
  } catch {}
}

export async function transcribe(buffer, filename = "voice.ogg") {
  const file = await toFile(buffer, filename);
  const res = await client.audio.transcriptions.create({
    file,
    model: config.transcribeModel,
    language: "ar",
    response_format: "verbose_json", // عشان نجيب مدة الصوت ونحسب التكلفة
  });
  try {
    const model = config.transcribeModel;
    const p = PRICING[model];
    const seconds = Number(res.duration) || 0;
    let cost = 0;
    let inTok = 0;
    let outTok = 0;
    if (p?.perMin) {
      cost = (seconds / 60) * p.perMin;
    } else if (res.usage) {
      const c = chatCost(model, {
        prompt_tokens: res.usage.input_tokens,
        completion_tokens: res.usage.output_tokens,
      });
      cost = c.cost;
      inTok = c.inTok;
      outTok = c.outTok;
    }
    recordAiUsage({
      kind: "transcribe",
      model,
      inputTokens: inTok,
      outputTokens: outTok,
      audioSeconds: seconds,
      costUsd: cost,
    });
  } catch {}
  return (res.text || "").trim();
}

const CLASSIFY_PROMPT = `انت مساعد لتطبيق تدوين شخصي بالعامي المصري اسمه "دوّنلي".
المستخدم بيبعت كلام (صوت مفرّغ أو نص) عن يومه. النظام بيركّز على ٤ محاور: الصحة، العادات، الأهداف، والماليات — جنب التدوين العادي. مهمتك:
1) تطلّع تدوينة يوميات (journal) من الكلام.
2) لو فيه كلام عن هدف برقم، تطلّعه كـ goal — سواء بيعرّف هدف جديد ("عايز أوصل ٥٠٠ ألف") أو بيحقّق تقدّم في هدف ("النهاردة عملت ١٠ آلاف").
3) لو فيه أي كلام عن صحته أو علاجه هو شخصيًا، تطلّعه كـ health items (تمرين، دواء، أكل، عرض/شكوى، نوم، ملاحظة صحية).
4) لو بيقول إن عنده حالة صحية عايز يتابعها للأيام الجاية ("عندي ارتجاع مريئي"، "عايز أتابع حالتي"، "نفسي أتابع الأعراض وأروح بيها للدكتور") → طلّعها كـ condition (متابعة حالة).
5) لو بيقول إنه أكل حاجة، طلّع الأكل كـ meals.
6) العادات (habits): لو بيتكلم عن عادة عايز يبدأها أو يلتزم بيها ("عايز ألعب رياضة كل يوم"، "هبطل سجاير")، أو إنه عمل عادة النهاردة ("النهاردة لعبت رياضة"، "مدخّنتش انهاردة") → طلّعها كـ habit. العادة نوعين: "do" (حاجة بيعملها زي الرياضة/القراءة) و "quit" (حاجة بيبطّلها زي السجاير). و action: "create" لو بس بيعرّف العادة، "done" لو بيقول إنه عملها/التزم بيها النهاردة، "both" لو الاتنين.
7) الماليات (finance): لو بيقول إنه كسب أو صرف فلوس ("صرفت ٢٠٠ جنيه على أكل"، "كسبت ٥٠٠٠ من شغل") → طلّعها كـ finance مع المبلغ والاتجاه والبند.

هيتبعتلك قايمة بالأهداف الموجودة حاليًا. لو المستخدم بيتكلم عن تقدّم في هدف موجود، استخدم نفس عنوان الهدف الموجود بالظبط عشان نعرف نزوّد عليه.

رجّع JSON بالشكل ده بالظبط:
{
  "journal": {
    "entry_date": "YYYY-MM-DD",        // اليوم اللي بيتكلم عنه، لو مش واضح استخدم النهاردة
    "mood": "كلمة واحدة عن مزاجه",      // مبسوط/متوتر/عادي/حزين/متحمّس
    "summary": "ملخص في جملة بالعامي",
    "tags": ["وسوم", "قصيرة"]
  },
  "goals": [
    {
      "title": "اسم الهدف",             // لو موجود استخدم نفس الاسم بالظبط
      "target": رقم أو null,            // الرقم المستهدف (لو بيعرّف هدف جديد أو بيحدّده)
      "add_amount": رقم أو null,        // المبلغ اللي حقّقه دلوقتي ويتضاف للحالي
      "set_current": رقم أو null,       // لو قال الإجمالي الحالي بقى كذا
      "unit": "الوحدة (جنيه مثلاً)" أو null
    }
  ],
  "health": [
    {
      "entry_date": "YYYY-MM-DD",       // يوم الحاجة دي، لو مش واضح استخدم النهاردة
      "category": "تمرين | دواء | أكل | عرض | نوم | ملاحظة",
      "detail": "وصف قصير بالعامي للحاجة الصحية",
      "body_region": "راس | صدر | معدة | بطن | ذراعين | ساقين | عام"
    }
  ],
  "condition": {                        // أو null لو مفيش طلب متابعة حالة
    "title": "اسم الحالة (مثلاً: ارتجاع مريئي)",
    "duration_days": رقم أو null        // مدة المتابعة لو حدّدها، لو مش واضح سيبها null
  },
  "meals": [
    {
      "entry_date": "YYYY-MM-DD",       // يوم الأكلة، لو مش واضح استخدم النهاردة
      "items": "اللي أكله (مثلاً: رز وفراخ، شاي بسكر)",
      "note": "ملاحظة زي الوقت أو الكمية" أو null
    }
  ],
  "habits": [
    {
      "title": "اسم العادة (مثلاً: رياضة، قراءة، بطّلت سجاير)",
      "kind": "do | quit",              // do = بيعملها، quit = بيبطّلها
      "action": "create | done | both", // create=بيعرّفها بس، done=عملها النهاردة، both=الاتنين
      "date": "YYYY-MM-DD",             // يوم تنفيذ العادة لو action فيها done، غير كده النهاردة
      "emoji": "إيموجي مناسب للعادة" أو null
    }
  ],
  "finance": [
    {
      "entry_date": "YYYY-MM-DD",       // يوم العملية، لو مش واضح استخدم النهاردة
      "direction": "income | expense",  // income=كسب/دخل، expense=صرف
      "amount": رقم,                     // المبلغ
      "currency": "العملة (جنيه افتراضيًا)",
      "note": "البند/السبب (مثلاً: أكل، مواصلات، شغل)"
    }
  ]
}

قواعد مهمة:
- لازم يكون فيه journal دايمًا.
- "goals" و "health" و "meals" ممكن يكونوا [] فاضيين، و "condition" ممكن يكون null، لو مفيش كلام يخصهم.
- condition: بس لما يبان إنه عايز يتابع حالة صحية للأيام الجاية أو يجمّع أعراض عشان الدكتور. مش كل عرض عابر يبقى متابعة — لازم يكون فيه نية متابعة/تشخيص. صحة حد تاني ماتطلّعهاش خالص.
- meals: أي أكل أو مشروب قاله إنه تناوله. لو نفس الأكلة اتقالت كـ health (أكل) كمان، طلّعها في meals بردو عادي.
- habits: خلي عنوان العادة قصير وثابت (مثلاً "رياضة" مش "لعبت رياضة النهاردة في الجيم") عشان نقدر نطابقها لما يكلّمنا تاني. لو بيبطّل حاجة استخدم kind="quit" والعنوان حاجة زي "سجاير" أو "سكر". لو قال إنه عملها النهاردة من غير ما يكون عرّفها قبل كده، استخدم action="both".
- finance: amount لازم يكون رقم موجب. direction إما income أو expense حسب الكلام. لو مش متأكد إنها معاملة مالية حقيقية، ماتطلّعهاش.
- "habits" و "finance" ممكن يكونوا [] فاضيين.
- لو بيقول "عملت/كسبت/وصلت/حقّقت كذا" عن هدف موجود → استخدم add_amount مع نفس عنوان الهدف الموجود.
- لو بيقول "الإجمالي بقى كذا" → set_current.
- لو بيعرّف هدف جديد → املأ target، ولو قال إنه عمل منه كذا املأ add_amount كمان.
- health: سجّل بس صحة المستخدم هو شخصيًا. لو بيتكلم عن صحة حد تاني (ماما، حد من العيلة...) ماتسجّلهاش في health خالص.
- اختار body_region المناسب: تمرين جري/مشي → "ساقين"، كارديو/نَفَس → "صدر"، أكل/هضم/معدة → "معدة"، حرقان بول/كلى/أملاح → "بطن"، صداع/نوم/مزاج → "راس"، دواء/فيتامين عام → "عام".
- التواريخ لازم بصيغة YYYY-MM-DD. لو مش متحدد، استخدم تاريخ النهاردة.
رجّع JSON بس من غير أي كلام تاني.`;

export async function classifyMessage(transcript, todayISO, existingGoals = []) {
  const goalsList = existingGoals.length
    ? existingGoals
        .map(
          (g) =>
            `- ${g.title} (الحالي: ${g.current}${g.unit ? " " + g.unit : ""}${
              g.target ? "، المستهدف: " + g.target : ""
            })`
        )
        .join("\n")
    : "مفيش أهداف متسجّلة حاليًا.";
  const res = await client.chat.completions.create({
    model: config.chatModel,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: CLASSIFY_PROMPT },
      {
        role: "user",
        content: `تاريخ النهاردة: ${todayISO}\n\nالأهداف الموجودة:\n${goalsList}\n\nالكلام:\n${transcript}`,
      },
    ],
  });
  logChatUsage("classify", config.chatModel, res);
  let parsed = {};
  try {
    parsed = JSON.parse(res.choices[0].message.content) || {};
  } catch {
    parsed = {};
  }
  const j = parsed.journal || {};
  const journal = {
    entryDate: isValidDate(j.entry_date) ? j.entry_date : todayISO,
    mood: j.mood || null,
    summary: j.summary || transcript.slice(0, 140),
    tags: Array.isArray(j.tags) ? j.tags : [],
  };
  const num = (v) => (v != null && v !== "" && !isNaN(Number(v)) ? Number(v) : null);
  const goals = Array.isArray(parsed.goals)
    ? parsed.goals
        .filter((g) => g && g.title)
        .map((g) => ({
          title: String(g.title).trim(),
          target: num(g.target),
          addAmount: num(g.add_amount),
          setCurrent: num(g.set_current),
          unit: g.unit || null,
        }))
    : [];
  const REGIONS = ["راس", "صدر", "معدة", "بطن", "ذراعين", "ساقين", "عام"];
  const health = Array.isArray(parsed.health)
    ? parsed.health
        .filter((h) => h && h.detail)
        .map((h) => ({
          entryDate: isValidDate(h.entry_date) ? h.entry_date : todayISO,
          category: h.category ? String(h.category).trim() : "ملاحظة",
          detail: String(h.detail).trim(),
          bodyRegion: REGIONS.includes(h.body_region) ? h.body_region : "عام",
        }))
    : [];
  const c = parsed.condition;
  const condition =
    c && c.title && String(c.title).trim()
      ? { title: String(c.title).trim(), durationDays: num(c.duration_days) }
      : null;
  const meals = Array.isArray(parsed.meals)
    ? parsed.meals
        .filter((m) => m && m.items && String(m.items).trim())
        .map((m) => ({
          entryDate: isValidDate(m.entry_date) ? m.entry_date : todayISO,
          items: String(m.items).trim(),
          note: m.note ? String(m.note).trim() : null,
        }))
    : [];
  const habits = Array.isArray(parsed.habits)
    ? parsed.habits
        .filter((h) => h && h.title && String(h.title).trim())
        .map((h) => ({
          title: String(h.title).trim(),
          kind: h.kind === "quit" ? "quit" : "do",
          action: ["create", "done", "both"].includes(h.action) ? h.action : "done",
          date: isValidDate(h.date) ? h.date : todayISO,
          emoji: h.emoji ? String(h.emoji).trim() : null,
        }))
    : [];
  const finance = Array.isArray(parsed.finance)
    ? parsed.finance
        .filter((f) => f && num(f.amount) != null && num(f.amount) > 0)
        .map((f) => ({
          entryDate: isValidDate(f.entry_date) ? f.entry_date : todayISO,
          direction: f.direction === "income" ? "income" : "expense",
          amount: num(f.amount),
          currency: f.currency ? String(f.currency).trim() : "جنيه",
          note: f.note ? String(f.note).trim() : null,
        }))
    : [];
  return { journal, goals, health, condition, meals, habits, finance };
}

const ANALYSIS_PROMPT = `انت مساعد بيحلّل يوميات شخص بيكتبها بالعامي المصري.
هتتعرض عليك مجموعة تدوينات بتواريخها. اطلع بتحليل ودود ومفيد بالعامي المصري يشمل:
- المزاج العام عبر الفترة وأي تغيّرات
- الأنماط المتكررة (حاجات بتأثر عليه بالسلب أو الإيجاب)
- ملاحظات أو اقتراحات عملية بسيطة
خلّي الكلام إنساني ومختصر، مش تقرير جاف.`;

export async function analyzeEntries(entries) {
  const text = entries
    .map((e) => `📅 ${e.entry_date} (${e.mood || "?"}): ${e.transcript}`)
    .join("\n\n");
  const res = await client.chat.completions.create({
    model: config.analysisModel,
    messages: [
      { role: "system", content: ANALYSIS_PROMPT },
      { role: "user", content: `التدوينات:\n\n${text}` },
    ],
  });
  logChatUsage("analyze", config.analysisModel, res);
  return res.choices[0].message.content.trim();
}

const DOCTOR_PROMPT = `انت مساعد بيجهّز تقرير مختصر للطبيب من بيانات متابعة حالة صحية لمريض بيدوّن بالعامي المصري.
هتتعرض عليك: اسم الحالة، فترة المتابعة، وقايمة بالأعراض/الملاحظات الصحية بتواريخها.
اطلع تقرير منظّم وواضح بالعربي الفصحى البسيطة المناسبة للطبيب، يشمل:
- سطر تعريفي بالحالة وفترة المتابعة.
- ملخص للأعراض الأساسية وتكرارها وأي نمط واضح (وقت ظهورها، علاقتها بالأكل/النوم...).
- أي أدوية اتذكرت وإذا كان فيه تحسّن أو سوء.
خلّيه مختصر وموضوعي ومرتّب في نقاط. ممنوع تشخيص أو وصف علاج — ده شغل الدكتور. اكتب التقرير بس من غير مقدمات زيادة.`;

export async function doctorReport(condition, healthItems = []) {
  const lines = healthItems.length
    ? healthItems
        .map(
          (h) =>
            `- ${h.entry_date}${h.at_time ? " " + h.at_time : ""} [${h.category || "ملاحظة"}]: ${h.detail}`
        )
        .join("\n")
    : "لا توجد أعراض مسجّلة خلال الفترة.";
  const res = await client.chat.completions.create({
    model: config.analysisModel,
    messages: [
      { role: "system", content: DOCTOR_PROMPT },
      {
        role: "user",
        content: `الحالة: ${condition.title}\nفترة المتابعة: من ${condition.start_date} إلى ${condition.end_date}\n\nالأعراض والملاحظات المسجّلة:\n${lines}`,
      },
    ],
  });
  logChatUsage("doctor", config.analysisModel, res);
  return res.choices[0].message.content.trim();
}

const REFLECT_PROMPT = `انت رفيق ودود في تطبيق تدوين شخصي بالعامي المصري اسمه "دوّنلي".
المستخدم لسه دوّن حاجة عن يومه. ردّ عليه برد قصير إنساني (جملتين تلاتة بالكتير) بالعامي المصري:
- اسمع مشاعره واعترف بيها بصدق ومن غير مبالغة.
- لو في تدوينات قديمة ليها علاقة بكلامه دلوقتي، اربط بيها بلُطف ("زي ما حكيت قبل كده..." / "آخر مرة كنت...").
- لو فيه تحديثات أهداف، هنّيه عليها بصدق: فكّره إنه كان عايز يوصل لكام، وإنه دلوقتي وصل لكام (والنسبة لو فيها هدف برقم)، وشجّعه يكمّل. لو حقّق الهدف بالكامل احتفل بيه.
- اقفل أحيانًا بسؤال خفيف يشجّعه يكمّل، مش كل مرة.
ممنوع تمامًا: نصايح طبية، إنك تدّعي إنك دكتور نفسي، كلام رسمي أو واعظ، أو إنك تكرّر اللي قاله بالنص. خليك دافي وقريّب وبسيط، كإنك صاحب بيسمعه.`;

export async function reflectOnEntry(currentText, recentEntries = [], goalUpdates = []) {
  const history = recentEntries.length
    ? "تدوينات قديمة (للسياق، متكررهاش حرفيًا):\n" +
      recentEntries
        .map((e) => `- ${e.entry_date} (${e.mood || "?"}): ${e.summary || e.transcript}`)
        .join("\n")
    : "مفيش تدوينات قديمة لسه.";
  const goalsBlock = goalUpdates.length
    ? "\n\nتحديثات أهداف حصلت دلوقتي (هنّيه عليها واربطها بكلامه):\n" +
      goalUpdates
        .map((g) => {
          const unit = g.unit ? " " + g.unit : "";
          const pct = g.target ? ` (${Math.min(100, Math.round((g.current / g.target) * 100))}%)` : "";
          const goal = g.target ? ` من هدف ${g.target}${unit}${pct}` : "";
          return `- ${g.title}: ${g.created ? "هدف جديد، " : ""}وصل دلوقتي لـ ${g.current}${unit}${goal}`;
        })
        .join("\n")
    : "";
  const res = await client.chat.completions.create({
    model: config.chatModel,
    messages: [
      { role: "system", content: REFLECT_PROMPT },
      { role: "user", content: `${history}${goalsBlock}\n\nاللي دوّنه دلوقتي:\n${currentText}` },
    ],
  });
  logChatUsage("reflect", config.chatModel, res);
  return res.choices[0].message.content.trim();
}

function isValidDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
