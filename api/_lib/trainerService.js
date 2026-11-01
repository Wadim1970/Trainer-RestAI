// Тренажёр: главный экран, выдача сессии, приём ответов. Ввод-вывод; вся логика —
// в *Core.js (чистые функции с тестами).
//
// Данные об официанте — trn_*; меню и подтверждённые факты — общая БД
// (menu_items, trn_dish_facts из контент-студии в Admin-restai).

import { deps, selectAll, must } from './db.js'
import { httpError } from './http.js'
import { mergeSettings } from './settingsCore.js'
import { trainableDishes, attachIngredients, readyByLevel, levelMap, isUnlocked } from './levelsCore.js'
import { composeCards, todaySummary } from './composeCore.js'
import { buildQuestion, gradeQuestion, scoreAnswers } from './exerciseCore.js'
import { ratingFor, review } from './fsrsCore.js'
import { dayIn, nextStreak, visibleStreak, addPoints, totalPoints, DEFAULT_TZ } from './progressCore.js'

const MAX_ANSWERS = 100

// ── Загрузка данных ──
async function loadContext(member) {
  const rid = member.restaurant_id
  const one = async (builder) => must(await builder)
  const [restaurant, settingsRow, menu, facts, states, state] = await Promise.all([
    one(deps.db.from('restaurants').select('id, name, timezone').eq('id', rid).maybeSingle()),
    one(deps.db.from('trn_settings').select('value').eq('restaurant_id', rid).maybeSingle()),
    selectAll(() => deps.db.from('menu_items').select('id, dish_name, menu_section, section_order, product_type, is_hidden, course_role').eq('restaurant_id', rid)),
    selectAll(() => deps.db.from('trn_dish_facts').select('dish_id, fact_type, status, value').eq('restaurant_id', rid).eq('fact_type', 'ingredients').eq('status', 'confirmed')),
    selectAll(() => deps.db.from('trn_card_states').select('*').eq('member_id', member.id)),
    one(deps.db.from('trn_member_state').select('*').eq('member_id', member.id).maybeSingle()),
  ])
  const settings = mergeSettings(settingsRow?.value)
  const dishes = attachIngredients(trainableDishes(menu), facts)
  const ready = readyByLevel(dishes)
  const tz = restaurant?.timezone || DEFAULT_TZ
  const now = deps.now()
  const today = dayIn(now, tz)
  const levelPoints = state?.level_points || {}
  const map = levelMap(ready, levelPoints, settings)
  return { restaurant, settings, dishes, ready, states, state, tz, now, today, levelPoints, map }
}

const openLevelsOf = (map) => map.filter((m) => m.status === 'open').map((m) => m.level)
const newTodayOf = (ctx) => ctx.states.filter((s) => dayIn(s.created_at, ctx.tz) === ctx.today).length

function publicState(ctx) {
  const total = totalPoints(ctx.levelPoints)
  return {
    points: total,
    levelPoints: ctx.levelPoints,
    streak: visibleStreak(ctx.state?.last_active_date || null, ctx.state?.streak_days || 0, ctx.today),
    levels: ctx.map,
  }
}

// ── Главный экран ──
export async function getMe(member) {
  const ctx = await loadContext(member)
  const open = openLevelsOf(ctx.map)
  return {
    member: { id: member.id, name: member.name },
    restaurant: { id: member.restaurant_id, name: ctx.restaurant?.name || 'Ресторан' },
    ...publicState(ctx),
    today: todaySummary({ ready: ctx.ready, states: ctx.states, openLevels: open, settings: ctx.settings, now: ctx.now, newToday: newTodayOf(ctx) }),
    settings: { sessionCards: ctx.settings.session_cards, unlockPoints: ctx.settings.unlock_points },
  }
}

// ── Выдача сессии ──
export async function createSession(member) {
  const ctx = await loadContext(member)
  const open = openLevelsOf(ctx.map)
  const plan = composeCards({ ready: ctx.ready, states: ctx.states, openLevels: open, settings: ctx.settings, now: ctx.now, newToday: newTodayOf(ctx) })
  if (plan.kind === 'empty') return { kind: 'empty', questions: [], reason: ctx.ready[1].length === 0 ? 'no_content' : 'nothing_to_do' }

  const bctx = {
    dishes: ctx.ready[1].map((d) => ({ ...d, ingredients: ctx.dishes.find((x) => x.id === d.id)?.ingredients || null })),
    sections: [...new Set(ctx.ready[1].map((d) => d.section))],
    settings: ctx.settings,
    rng: deps.rng,
  }
  const questions = []
  for (const card of plan.cards) {
    const q = buildQuestion(card, bctx)
    if (q) questions.push({ qid: `q${questions.length + 1}`, source: card.source, ...q })
  }
  if (questions.length === 0) return { kind: 'empty', questions: [], reason: 'nothing_to_do' }

  const session = must(await deps.db.from('trn_sessions').insert({
    restaurant_id: member.restaurant_id, member_id: member.id, mode: 'training', kind: plan.kind, questions,
  }).select('id').single())

  // Названия блюд для подписи результатов (по карточкам).
  const dishNames = Object.fromEntries(ctx.dishes.map((d) => [d.id, d.name]))
  return { sessionId: session.id, kind: plan.kind, total: questions.length, questions, dishNames }
}

// ── Приём ответов ──
// answers: [{ qid, selected:[id], confident, latencyMs }]. Верность и баллы считает сервер;
// повторная отправка тех же ответов не меняет ни баллы, ни расписание повторений.
export async function submitAnswers(member, { sessionId, answers }) {
  if (!Array.isArray(answers) || answers.length === 0) throw httpError(400, 'Нет ответов')
  if (answers.length > MAX_ANSWERS) throw httpError(400, 'Слишком много ответов за раз')

  const session = must(await deps.db.from('trn_sessions').select('*').eq('id', String(sessionId || '')).eq('member_id', member.id).maybeSingle())
  if (!session) throw httpError(404, 'Сессия не найдена')

  const ctx = await loadContext(member)
  const stateByKey = new Map(ctx.states.map((s) => [s.card_key, s]))
  const done = new Map((await selectAll(() => deps.db.from('trn_attempts').select('qid, is_correct, points').eq('session_id', session.id))).map((a) => [a.qid, a]))
  const questions = new Map(session.questions.map((q, i) => [q.qid, { q, i }]))

  // Порядок как в сессии: от него зависит комбо.
  const todo = []
  const seen = new Set()
  for (const a of answers) {
    const hit = questions.get(String(a?.qid))
    if (!hit || seen.has(hit.q.qid) || done.has(hit.q.qid)) continue
    seen.add(hit.q.qid)
    todo.push({ ...hit, a })
  }
  todo.sort((x, y) => x.i - y.i)

  const graded = todo.map(({ q, a }) => {
    const g = gradeQuestion(q, a.selected)
    return { q, a, g, confident: a.confident !== false }
  })
  const { points } = scoreAnswers(graded.map((x) => ({ correct: x.g.correct, confident: x.confident })), ctx.settings)

  let levelPoints = ctx.levelPoints
  const results = []
  const weak = new Set()
  for (const [n, item] of graded.entries()) {
    const { q, a, g, confident } = item
    const latencyMs = Number.isFinite(Number(a.latencyMs)) ? Math.min(600000, Math.max(0, Math.round(Number(a.latencyMs)))) : null
    const rating = ratingFor({ correct: g.primaryCorrect, confident, latencyMs }, ctx.settings.fast_ms)

    // Сначала ответ (уникален по сессии+вопросу — защита от повторной отправки), потом расписание.
    const { error: attemptError } = await deps.db.from('trn_attempts').insert({
      restaurant_id: member.restaurant_id, member_id: member.id, session_id: session.id, qid: q.qid,
      card_key: q.cardKey, dish_id: q.dishId, level: q.level, exercise: q.kind, selected: Array.isArray(a.selected) ? a.selected : [],
      is_correct: g.correct, confident, latency_ms: latencyMs, points: points[n],
    })
    if (attemptError) {
      if (attemptError.code === '23505') continue
      throw attemptError
    }
    const prev = stateByKey.get(q.cardKey)
    const next = review(prev?.fsrs || null, rating, ctx.now)
    const row = { fsrs: next.fsrs, due_at: next.due_at, reps: next.reps, lapses: next.lapses, last_review_at: ctx.now.toISOString() }
    if (prev) must(await deps.db.from('trn_card_states').update(row).eq('id', prev.id).select('id'))
    else {
      const created = must(await deps.db.from('trn_card_states').insert({
        restaurant_id: member.restaurant_id, member_id: member.id, card_key: q.cardKey, dish_id: q.dishId, level: q.level, ...row,
      }).select('*').single())
      stateByKey.set(q.cardKey, created)
    }
    levelPoints = addPoints(levelPoints, q.level, points[n])
    if (!g.primaryCorrect) weak.add(q.dishId)
    results.push({ qid: q.qid, correct: g.correct, points: points[n] })
  }

  // Прогресс и серия.
  const last = ctx.state?.last_active_date || null
  const streak = results.length ? nextStreak(last, ctx.state?.streak_days || 0, ctx.today) : (ctx.state?.streak_days || 0)
  if (results.length) {
    const fields = { level_points: levelPoints, streak_days: streak, last_active_date: ctx.today, updated_at: ctx.now.toISOString() }
    if (ctx.state) must(await deps.db.from('trn_member_state').update(fields).eq('member_id', member.id).select('member_id'))
    else must(await deps.db.from('trn_member_state').insert({ member_id: member.id, restaurant_id: member.restaurant_id, ...fields }).select('member_id'))
  }

  const total = session.questions.length
  const answered = done.size + results.length
  if (answered >= total && !session.completed_at) {
    await deps.db.from('trn_sessions').update({ completed_at: ctx.now.toISOString() }).eq('id', session.id)
  }

  // Итог с учётом ранее принятых ответов этой сессии (повторная отправка возвращает то же).
  const all = [...[...done.values()].map((d) => ({ qid: d.qid, correct: d.is_correct, points: d.points })), ...results]
  const after = { ...ctx, levelPoints, state: { ...(ctx.state || {}), level_points: levelPoints, streak_days: streak, last_active_date: results.length ? ctx.today : (ctx.state?.last_active_date || null) } }
  after.map = levelMap(ctx.ready, levelPoints, ctx.settings)
  const dishNames = Object.fromEntries(ctx.dishes.map((d) => [d.id, d.name]))
  return {
    results: all,
    totals: { answered: all.length, total, correct: all.filter((r) => r.correct).length, points: all.reduce((s, r) => s + r.points, 0) },
    weak: [...weak].map((id) => ({ dishId: id, name: dishNames[id] || '' })),
    ...publicState(after),
    unlocked: after.map.filter((m) => m.status === 'open').map((m) => m.level).filter((lv) => !isUnlocked(ctx.map, lv)),
  }
}
