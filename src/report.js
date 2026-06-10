/* بيانات التقرير الشامل: بنجمّع كل اللي اتسجل عن المستخدم في الفترة
   ونبعته للموديل يطلع تقرير واحد (نفسية + صحة + عادات + أهداف + فلوس). */

import {
  localToday,
  entriesSince,
  healthSince,
  financeSince,
  listGoals,
  listHabits,
  listTasks,
  activeConditions,
} from "./db.js";

export function buildReportData(userId, days = 30) {
  const to = localToday();
  const d = new Date(`${to}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (Number(days) - 1));
  const from = d.toISOString().slice(0, 10);

  const finance = financeSince(userId, from);
  const income = finance.filter((f) => f.direction === "income").reduce((a, f) => a + f.amount, 0);
  const expense = finance.filter((f) => f.direction === "expense").reduce((a, f) => a + f.amount, 0);
  const byCategory = {};
  for (const f of finance.filter((f) => f.direction === "expense")) {
    const c = f.category || "أخرى";
    byCategory[c] = (byCategory[c] || 0) + f.amount;
  }

  const health = healthSince(userId, from);
  const tasks = listTasks(userId, from, to);

  return {
    from,
    to,
    journal: entriesSince(userId, from).map((e) => ({
      date: e.entry_date,
      mood: e.mood,
      text: (e.transcript || e.summary || "").slice(0, 600),
    })),
    health: health
      .filter((h) => h.category !== "نفسية")
      .map((h) => ({ date: h.entry_date, category: h.category, detail: h.detail, region: h.body_region })),
    mental: health
      .filter((h) => h.category === "نفسية")
      .map((h) => ({ date: h.entry_date, detail: h.detail })),
    conditions: activeConditions(userId).map((c) => ({ title: c.title, since: c.start_date })),
    finance: {
      income,
      expense,
      net: income - expense,
      expense_by_category: byCategory,
      count: finance.length,
    },
    goals: listGoals(userId).map((g) => ({
      title: g.title,
      current: g.current,
      target: g.target,
      unit: g.unit,
      percent: g.target ? Math.round((g.current / g.target) * 100) : null,
    })),
    habits: listHabits(userId).map((h) => ({
      title: h.title,
      kind: h.kind,
      streak: h.streak,
      done_in_period: (h.logs || []).filter((d) => d >= from).length,
      period_days: Number(days),
    })),
    tasks: {
      total: tasks.length,
      done: tasks.filter((t) => t.status === "done").length,
      pending: tasks.filter((t) => t.status === "pending").map((t) => t.title),
    },
  };
}
