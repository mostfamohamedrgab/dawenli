import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { config } from "./config.js";

const client = new OpenAI({ apiKey: config.openaiKey });

export async function transcribe(buffer, filename = "voice.ogg") {
  const file = await toFile(buffer, filename);
  const res = await client.audio.transcriptions.create({
    file,
    model: config.transcribeModel,
    language: "ar",
  });
  return res.text.trim();
}

const CLASSIFY_PROMPT = `انت مساعد لتطبيق تدوين شخصي بالعامي المصري اسمه "دوّنلي".
المستخدم بيبعت كلام (صوت مفرّغ أو نص) عن يومه. مهمتك حاجتين:
1) تطلّع تدوينة يوميات (journal) من الكلام.
2) لو فيه كلام عن هدف برقم، تطلّعه كـ goal — سواء بيعرّف هدف جديد ("عايز أوصل ٥٠٠ ألف") أو بيحقّق تقدّم في هدف ("النهاردة عملت ١٠ آلاف").

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
  ]
}

قواعد مهمة:
- لازم يكون فيه journal دايمًا.
- "goals" ممكن تكون [] فاضية لو مفيش أي كلام عن أهداف بأرقام.
- لو بيقول "عملت/كسبت/وصلت/حقّقت كذا" عن هدف موجود → استخدم add_amount مع نفس عنوان الهدف الموجود.
- لو بيقول "الإجمالي بقى كذا" → set_current.
- لو بيعرّف هدف جديد → املأ target، ولو قال إنه عمل منه كذا املأ add_amount كمان.
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
  return { journal, goals };
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
  return res.choices[0].message.content.trim();
}

function isValidDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
