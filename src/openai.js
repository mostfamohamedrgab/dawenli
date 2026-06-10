import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { config } from "./config.js";
import { recordAiUsage } from "./db.js";

export const client = new OpenAI({ apiKey: config.openaiKey });

/* ===================== تسعير OpenAI (تقريبي — بالدولار) =====================
   الأسعار بتتغيّر، فلو حصل تحديث من OpenAI عدّل الأرقام هنا.
   - الموديلات النصية: السعر لكل مليون توكن (إدخال/إخراج).
   - whisper-1: السعر للدقيقة الصوتية. */
const PRICING = {
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4o-mini-transcribe": { in: 3, out: 5, perMin: 0.003 },
  "gpt-4o-transcribe": { in: 6, out: 10, perMin: 0.006 },
  "whisper-1": { perMin: 0.006 },
};

function chatCost(model, usage = {}) {
  const p = PRICING[model] || PRICING["gpt-4o"];
  const inTok = usage.prompt_tokens || 0;
  const outTok = usage.completion_tokens || 0;
  const cost = (inTok / 1e6) * (p.in || 0) + (outTok / 1e6) * (p.out || 0);
  return { inTok, outTok, cost };
}

// نسجّل تكلفة نداء شات (agent/تحليل/تقرير...) — مايرميش لو فشل التسجيل
export function logChatUsage(kind, model, res, userId) {
  try {
    const { inTok, outTok, cost } = chatCost(model, res?.usage || {});
    recordAiUsage({ userId, kind, model, inputTokens: inTok, outputTokens: outTok, costUsd: cost });
  } catch {}
}

/* ===================== تفريغ الصوت ===================== */

export async function transcribe(buffer, filename = "voice.ogg", userId) {
  const model = config.transcribeModel;
  const file = await toFile(buffer, filename);
  // whisper-1 بس اللي بيدعم verbose_json (وبنحتاجه عشان مدة الصوت)
  const isWhisper = model.startsWith("whisper");
  const res = await client.audio.transcriptions.create({
    file,
    model,
    language: "ar",
    response_format: isWhisper ? "verbose_json" : "json",
  });
  try {
    const p = PRICING[model] || {};
    const seconds = Number(res.duration) || 0;
    let cost = 0;
    let inTok = 0;
    let outTok = 0;
    if (res.usage?.input_tokens != null) {
      // موديلات gpt-4o-transcribe بترجّع usage بالتوكنز
      inTok = res.usage.input_tokens || 0;
      outTok = res.usage.output_tokens || 0;
      cost = (inTok / 1e6) * (p.in || 0) + (outTok / 1e6) * (p.out || 0);
    } else if (p.perMin && seconds) {
      cost = (seconds / 60) * p.perMin;
    }
    recordAiUsage({
      userId,
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

/* ===================== تحليل اليوميات ===================== */

const ANALYSIS_PROMPT = `انت مساعد بيحلّل يوميات شخص بيكتبها بالعامي المصري.
هتتعرض عليك مجموعة تدوينات بتواريخها. اطلع بتحليل ودود ومفيد بالعامي المصري يشمل:
- المزاج العام عبر الفترة وأي تغيّرات
- الأنماط المتكررة (حاجات بتأثر عليه بالسلب أو الإيجاب)
- ملاحظات أو اقتراحات عملية بسيطة
خلّي الكلام إنساني ومختصر، مش تقرير جاف.`;

export async function analyzeEntries(entries, userId) {
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
  logChatUsage("analyze", config.analysisModel, res, userId);
  return res.choices[0].message.content.trim();
}

/* ===================== التقرير الشامل =====================
   تقرير واحد عن الفترة بناءً على كل كلام المستخدم:
   النفسية والمزاج + الصحة والأدوية والأعراض + العادات + الأهداف + الماليات. */

const REPORT_PROMPT = `انت محلّل شخصي لتطبيق تدوين اسمه "دوّنلي". المستخدم بيدوّن يومه بالعامي المصري،
والنظام بيستخرج من كلامه: يوميات، صحة (أعراض/أدوية/تمارين/نوم)، حالة نفسية ومزاج، عادات، أهداف، مصاريف ودخل، ومهام.
هتستلم البيانات دي كلها عن فترة معيّنة، ومطلوب منك **تقرير واحد شامل** بالعامي المصري البسيط، منظّم بالعناوين دي:

## 🧠 النفسية والمزاج
المزاج العام عبر الفترة، التقلبات، الحاجات اللي ظهرت إنها بتأثر عليه بالسلب أو الإيجاب.

## 🩺 الصحة
الأعراض المتكررة وأنماطها (امتى بتظهر، علاقتها بالأكل/النوم)، الأدوية والالتزام بيها، التمارين والنوم. من غير تشخيص أو وصف علاج.

## 🔁 العادات والأهداف
التزامه بعاداته (إيه اللي ماشي وإيه اللي واقع)، وتقدّمه في أهدافه بالأرقام والنسب.

## 💰 الفلوس
إجمالي الدخل والصرف، أكتر بنود الصرف، وأي ملاحظة على نمط الصرف.

## ✨ الخلاصة و٣ خطوات للأسبوع الجاي
ملخص في سطرين + ٣ اقتراحات عملية صغيرة ومحددة بناءً على بياناته هو.

قواعد: اتكلم معاه مباشرة بصيغة "انت". استشهد بأمثلة حقيقية من بياناته (تواريخ/أرقام). لو قسم مفيهوش بيانات قول "مفيش بيانات كفاية" في سطر واحد وعدّي. ممنوع نصايح طبية متخصصة أو تشخيص. خلّي التقرير دافي ومختصر — مش أكتر من صفحة.`;

export async function unifiedReport(data, userId) {
  const res = await client.chat.completions.create({
    model: config.analysisModel,
    messages: [
      { role: "system", content: REPORT_PROMPT },
      { role: "user", content: `الفترة: ${data.from} إلى ${data.to}\n\nالبيانات:\n${JSON.stringify(data, null, 1)}` },
    ],
  });
  logChatUsage("report", config.analysisModel, res, userId);
  return res.choices[0].message.content.trim();
}

/* ===================== تقرير الدكتور (متابعة حالة) ===================== */

const DOCTOR_PROMPT = `انت مساعد بيجهّز تقرير مختصر للطبيب من بيانات متابعة حالة صحية لمريض بيدوّن بالعامي المصري.
هتتعرض عليك: اسم الحالة، فترة المتابعة، وقايمة بالأعراض/الملاحظات الصحية بتواريخها.
اطلع تقرير منظّم وواضح بالعربي الفصحى البسيطة المناسبة للطبيب، يشمل:
- سطر تعريفي بالحالة وفترة المتابعة.
- ملخص للأعراض الأساسية وتكرارها وأي نمط واضح (وقت ظهورها، علاقتها بالأكل/النوم...).
- أي أدوية اتذكرت وإذا كان فيه تحسّن أو سوء.
خلّيه مختصر وموضوعي ومرتّب في نقاط. ممنوع تشخيص أو وصف علاج — ده شغل الدكتور. اكتب التقرير بس من غير مقدمات زيادة.`;

export async function doctorReport(condition, healthItems = [], userId) {
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
  logChatUsage("doctor", config.analysisModel, res, userId);
  return res.choices[0].message.content.trim();
}
