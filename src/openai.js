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
المستخدم بيبعت كلام (صوت مفرّغ أو نص) عن يومه ومشاعره.
مهمتك تطلّع منه تدوينة يوميات منظّمة.

رجّع JSON بالشكل ده بالظبط:
{
  "entry_date": "YYYY-MM-DD",          // اليوم اللي بيتكلم عنه، لو مش واضح استخدم تاريخ النهاردة
  "mood": "كلمة واحدة عن مزاجه",        // مبسوط/متوتر/عادي/حزين/متحمّس
  "summary": "ملخص في جملة بالعامي",
  "tags": ["وسوم", "قصيرة"]
}

قواعد مهمة:
- التاريخ لازم بصيغة YYYY-MM-DD. لو مش متحدد، استخدم تاريخ النهاردة.
رجّع JSON بس من غير أي كلام تاني.`;

export async function classifyJournal(transcript, todayISO) {
  const res = await client.chat.completions.create({
    model: config.chatModel,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: CLASSIFY_PROMPT },
      {
        role: "user",
        content: `تاريخ النهاردة: ${todayISO}\n\nالكلام:\n${transcript}`,
      },
    ],
  });
  let parsed = {};
  try {
    parsed = JSON.parse(res.choices[0].message.content) || {};
  } catch {
    parsed = {};
  }
  return {
    entryDate: isValidDate(parsed.entry_date) ? parsed.entry_date : todayISO,
    mood: parsed.mood || null,
    summary: parsed.summary || transcript.slice(0, 140),
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
  };
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
- اقفل أحيانًا بسؤال خفيف يشجّعه يكمّل، مش كل مرة.
ممنوع تمامًا: نصايح طبية، إنك تدّعي إنك دكتور نفسي، كلام رسمي أو واعظ، أو إنك تكرّر اللي قاله بالنص. خليك دافي وقريّب وبسيط، كإنك صاحب بيسمعه.`;

export async function reflectOnEntry(currentText, recentEntries = []) {
  const history = recentEntries.length
    ? "تدوينات قديمة (للسياق، متكررهاش حرفيًا):\n" +
      recentEntries
        .map((e) => `- ${e.entry_date} (${e.mood || "?"}): ${e.summary || e.transcript}`)
        .join("\n")
    : "مفيش تدوينات قديمة لسه.";
  const res = await client.chat.completions.create({
    model: config.chatModel,
    messages: [
      { role: "system", content: REFLECT_PROMPT },
      { role: "user", content: `${history}\n\nاللي دوّنه دلوقتي:\n${currentText}` },
    ],
  });
  return res.choices[0].message.content.trim();
}

function isValidDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
