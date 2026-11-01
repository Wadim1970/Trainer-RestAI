// node --test api/_lib/core.test.js — чистая логика тренажёра.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Rating } from 'ts-fsrs'
import { mergeSettings, DEFAULT_SETTINGS } from './settingsCore.js'
import { ratingFor, review } from './fsrsCore.js'
import { nearMisses, distractorsFor, roleOf, seeded, norm, CATALOG } from './distractorCore.js'
import { buildQuestion, gradeQuestion, scoreAnswers } from './exerciseCore.js'
import { trainableDishes, attachIngredients, readyByLevel, levelMap } from './levelsCore.js'
import { composeCards, cardKey, todaySummary } from './composeCore.js'
import { dayIn, prevDay, nextStreak, visibleStreak, addPoints, totalPoints } from './progressCore.js'
import { generateCode, normalizeCode, formatCode, inviteState, cleanEmail, cleanName, CODE_ALPHABET } from './inviteCore.js'

const S = mergeSettings({})

// ── настройки ──
test('настройки: умолчания и защита от мусора', () => {
  assert.deepEqual(mergeSettings(null), mergeSettings(undefined))
  assert.equal(S.unlock_points[2], DEFAULT_SETTINGS.unlock_points[2])
  const m = mergeSettings({ session_cards: 9999, new_cards_per_day: 'abc', unlock_points: { 2: 10 }, points: { wrong_confident: 5 } })
  assert.equal(m.session_cards, 60)
  assert.equal(m.new_cards_per_day, 20)
  assert.equal(m.unlock_points[2], 10)
  assert.equal(m.points.wrong_confident, 0) // штраф не может быть положительным
})

// ── FSRS ──
test('рейтинг: неверно → Again, не уверен → Hard, уверен → Good, быстро → Easy', () => {
  assert.equal(ratingFor({ correct: false, confident: true, latencyMs: 100 }, 6000), Rating.Again)
  assert.equal(ratingFor({ correct: true, confident: false, latencyMs: 100 }, 6000), Rating.Hard)
  assert.equal(ratingFor({ correct: true, confident: true, latencyMs: 9000 }, 6000), Rating.Good)
  assert.equal(ratingFor({ correct: true, confident: true, latencyMs: 2000 }, 6000), Rating.Easy)
  assert.equal(ratingFor({ correct: true, confident: true, latencyMs: null }, 6000), Rating.Good)
})

test('FSRS: карточка с ошибкой возвращается раньше карточки с верным ответом; состояние переживает JSON', () => {
  const now = new Date('2026-11-01T10:00:00Z')
  const good = review(null, Rating.Good, now)
  const again = review(null, Rating.Again, now)
  assert.ok(new Date(again.due_at) < new Date(good.due_at))
  // второй раз «Good» через сутки: интервал растёт
  const stored = JSON.parse(JSON.stringify(good.fsrs))
  const later = new Date('2026-11-02T10:00:00Z')
  const next = review(stored, Rating.Good, later)
  assert.ok(new Date(next.due_at) > later)
  assert.equal(next.reps, 2)
  const lapsed = review(JSON.parse(JSON.stringify(next.fsrs)), Rating.Again, new Date(next.due_at))
  assert.equal(lapsed.lapses, 1)
})

// ── дистракторы ──
test('«почти правильные» названия: подмена основного продукта', () => {
  assert.deepEqual(nearMisses('Цезарь с курицей'), ['Цезарь с креветками'])
  assert.deepEqual(nearMisses('Грибной крем-суп'), ['Овощной крем-суп'])
  assert.deepEqual(nearMisses('Борщ'), [])
})

test('дистракторы: не совпадают с настоящими блюдами меню и не повторяются', () => {
  const real = ['Цезарь с курицей', 'Греческий салат', 'Нисуаз', 'Салат Оливье']
  const d = distractorsFor({ name: 'Цезарь с курицей', role: 'salad' }, real, 8, seeded(1))
  assert.equal(d.length, 8)
  assert.equal(d[0], 'Цезарь с креветками')
  assert.equal(new Set(d.map(norm)).size, 8)
  for (const x of d) assert.ok(!real.map(norm).includes(norm(x)), x)
})

test('роль блюда: из меню или по названию раздела', () => {
  assert.equal(roleOf({ course_role: 'dessert' }), 'dessert')
  assert.equal(roleOf({ menu_section: 'Горячие блюда' }), 'main')
  assert.equal(roleOf({ menu_section: 'Салаты' }), 'salad')
  assert.equal(roleOf({ menu_section: 'Что-то своё' }), 'other')
  assert.ok(Object.keys(CATALOG).length >= 8)
})

// ── данные меню ──
const row = (id, name, section, extra = {}) => ({ id, dish_name: name, menu_section: section, section_order: 1, product_type: 'food', is_hidden: false, ...extra })
const MENU = [
  row('p1', 'Цезарь с курицей', 'Популярное'),
  row('a1', 'Цезарь с курицей', 'Салаты'),
  row('a2', 'Греческий', 'Салаты'),
  row('a3', 'Оливье', 'Салаты'),
  row('s1', 'Борщ', 'Супы'),
  row('s2', 'Солянка', 'Супы'),
  row('h1', 'Рибай', 'Горячее'),
  row('x1', 'Скрытое', 'Супы', { is_hidden: true }),
  row('w1', 'Мальбек', 'Вино', { product_type: 'alcohol' }),
]
const ing = (...names) => names.map((n, i) => ({ name: n, is_key: i < 3 }))
const fact = (dish_id, items, extra = {}) => ({ dish_id, fact_type: 'ingredients', status: 'confirmed', value: { items }, ...extra })
const FACTS = [
  fact('a1', ing('Курица', 'Пармезан', 'Романо', 'Соус цезарь')),
  fact('a2', ing('Огурцы', 'Томаты', 'Фета', 'Маслины')),
  fact('a3', ing('Картофель', 'Горошек', 'Колбаса', 'Майонез')),
  fact('s1', ing('Свёкла', 'Говядина', 'Капуста', 'Сметана')),
  fact('s2', ing('Колбаса', 'Маслины', 'Огурцы солёные', 'Лимон'), { status: 'draft' }), // не подтверждён
  fact('h1', ing('Говядина', 'Розмарин', 'Масло', 'Соль'), { value: { na: true } }), // na не считается
]

test('блюда для обучения: без скрытых и без копии в «Популярном»', () => {
  const d = trainableDishes(MENU)
  assert.deepEqual(d.map((x) => x.id).sort(), ['a1', 'a2', 'a3', 'h1', 's1', 's2', 'w1'])
})

test('уровень 2 — только блюда с ПОДТВЕРЖДЁННЫМ составом и ключевым ингредиентом; напитки не учим', () => {
  const dishes = attachIngredients(trainableDishes(MENU), FACTS)
  const ready = readyByLevel(dishes)
  assert.equal(ready[1].length, 7)
  assert.deepEqual(ready[2].map((d) => d.id).sort(), ['a1', 'a2', 'a3', 's1'])
  const noKey = attachIngredients(trainableDishes(MENU), [fact('a1', [{ name: 'Курица', is_key: false }])])
  assert.equal(readyByLevel(noKey)[2].length, 0)
})

test('карта уровней: уровень 2 открывается по баллам, 3 — «скоро»', () => {
  const ready = readyByLevel(attachIngredients(trainableDishes(MENU), FACTS))
  let m = levelMap(ready, { 1: 10 }, S)
  assert.deepEqual(m.map((x) => x.status), ['open', 'locked', 'soon'])
  assert.equal(m[1].need, 50)
  m = levelMap(ready, { 1: 50 }, S)
  assert.equal(m[1].status, 'open')
  m = levelMap(readyByLevel(attachIngredients(trainableDishes(MENU), [])), { 1: 80 }, S)
  assert.equal(m[1].status, 'empty') // баллы есть, но шеф не подтвердил составы
})

// ── упражнения ──
const dishes = attachIngredients(trainableDishes(MENU), FACTS)
const ctx = (seed = 3) => ({ dishes, sections: [...new Set(dishes.map((d) => d.section))], settings: S, rng: seeded(seed) })
const card = (level, id) => ({ cardKey: cardKey(level, id), dishId: id, level })

function assertWellFormed(q) {
  const ids = q.options.map((o) => o.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(new Set(q.options.map((o) => norm(o.label))).size, q.options.length, 'варианты не должны повторяться')
  for (const a of q.answer) assert.ok(ids.includes(a))
  assert.ok(q.answer.length >= 1)
  if (!q.multi) assert.equal(q.answer.length, 1)
}

test('все виды упражнений собираются и корректны на разных зёрнах', () => {
  const kinds = new Set()
  for (let seed = 1; seed <= 40; seed++) {
    for (const [lv, id] of [[1, 'a1'], [1, 'h1'], [2, 'a1'], [2, 's1']]) {
      const q = buildQuestion(card(lv, id), ctx(seed))
      if (!q) continue
      kinds.add(q.kind)
      assertWellFormed(q)
      assert.equal(q.level, lv)
      assert.equal(q.dishId, id)
    }
  }
  assert.deepEqual([...kinds].sort(), ['build_dish', 'guess_dish', 'menu_grid', 'odd_one', 'which_section'])
})

test('сетка «Найди своё»: настоящие блюда в ответе, целевое отмечено, дистракторы — нет', () => {
  let q
  for (let seed = 1; seed < 50 && !q; seed++) { const c = buildQuestion(card(1, 'a1'), ctx(seed)); if (c?.kind === 'menu_grid') q = c }
  assert.ok(q)
  assert.equal(q.options.length <= S.grid_size, true)
  const realNames = new Set(dishes.map((d) => norm(d.name)))
  const labelOf = (id) => q.options.find((o) => o.id === id).label
  assert.ok(q.answer.every((id) => realNames.has(norm(labelOf(id)))))
  assert.equal(labelOf(q.primaryOptionId), 'Цезарь с курицей')
  const fake = q.options.filter((o) => !q.answer.includes(o.id))
  assert.ok(fake.length >= 2)
  assert.ok(fake.every((o) => !realNames.has(norm(o.label))))
})

test('«Собери блюдо»: верные — только ключевые ингредиенты, дистракторы из других блюд', () => {
  let q
  for (let seed = 1; seed < 80 && !q; seed++) { const c = buildQuestion(card(2, 'a1'), ctx(seed)); if (c?.kind === 'build_dish') q = c }
  assert.ok(q)
  const labels = q.answer.map((id) => q.options.find((o) => o.id === id).label).sort()
  assert.deepEqual(labels, ['Курица', 'Пармезан', 'Романо'])
  const own = new Set(['Курица', 'Пармезан', 'Романо', 'Соус цезарь'].map(norm))
  for (const o of q.options.filter((x) => !q.answer.includes(x.id))) assert.ok(!own.has(norm(o.label)), `${o.label} есть в блюде`)
})

test('проверка ответа: множественный и одиночный выбор', () => {
  const multi = { options: [{ id: 'o0' }, { id: 'o1' }, { id: 'o2' }], multi: true, answer: ['o0', 'o1'] }
  assert.deepEqual(gradeQuestion(multi, ['o1', 'o0']).correct, true)
  const miss = gradeQuestion(multi, ['o0'])
  assert.deepEqual([miss.correct, miss.missed, miss.wrong], [false, ['o1'], []])
  const extra = gradeQuestion(multi, ['o0', 'o1', 'o2'])
  assert.deepEqual([extra.correct, extra.wrong], [false, ['o2']])
  assert.equal(gradeQuestion(multi, []).correct, false)
  assert.equal(gradeQuestion(multi, ['zzz']).correct, false) // чужой id игнорируется
  const single = { options: [{ id: 'o0' }, { id: 'o1' }], multi: false, answer: ['o1'] }
  assert.equal(gradeQuestion(single, ['o1']).correct, true)
  assert.equal(gradeQuestion(single, ['o0']).correct, false)
  assert.equal(gradeQuestion(single, ['o0', 'o1']).correct, false)
})

test('сетка: карточка отвечена верно, если целевое блюдо отмечено, даже при ошибке в соседях', () => {
  const q = { options: [{ id: 'o0' }, { id: 'o1' }, { id: 'o2' }], multi: true, answer: ['o0', 'o1'], primaryOptionId: 'o0' }
  const g = gradeQuestion(q, ['o0', 'o2'])
  assert.deepEqual([g.correct, g.primaryCorrect], [false, true])
  assert.equal(gradeQuestion(q, ['o1']).primaryCorrect, false)
})

// ── баллы ──
test('баллы: уверенность и комбо', () => {
  const { points, combo } = scoreAnswers([
    { correct: true, confident: true }, { correct: true, confident: true }, { correct: true, confident: false },
    { correct: false, confident: true }, { correct: false, confident: false }, { correct: true, confident: true },
  ], S)
  assert.deepEqual(points, [2, 2, 1, -2, 0, 2]) // 2·1.0, 2·1.1→2, 1·1.2→1, -2, 0, комбо сброшено
  assert.equal(combo, 1)
  // длинная серия: множитель растёт, но ограничен combo_max
  const long = scoreAnswers(Array(12).fill({ correct: true, confident: true }), mergeSettings({ points: { correct_confident: 10 }, combo_step: 0.1, combo_max: 5 })).points
  assert.deepEqual([long[0], long[1], long[5], long[11]], [10, 11, 15, 15])
})

// ── состав сессии ──
const READY = readyByLevel(dishes)
const NOW = new Date('2026-11-01T10:00:00Z')
const st = (level, id, due, extra = {}) => ({ card_key: cardKey(level, id), dish_id: id, level, due_at: due, ...extra })

test('сессия: сначала просроченные (самые просроченные первыми), затем новые', () => {
  const states = [st(1, 'a2', '2026-10-31T10:00:00Z'), st(1, 'a3', '2026-10-30T10:00:00Z'), st(1, 's1', '2026-11-05T10:00:00Z')]
  const plan = composeCards({ ready: READY, states, openLevels: [1], settings: S, now: NOW, newToday: 0 })
  assert.equal(plan.kind, 'regular')
  assert.deepEqual(plan.cards.slice(0, 2).map((c) => c.dishId), ['a3', 'a2'])
  assert.ok(plan.cards.slice(2).every((c) => c.source === 'new'))
  assert.ok(!plan.cards.some((c) => c.dishId === 's1'), 'не наступивший срок не берём')
})

test('сессия: дневной лимит новых карточек и длина сессии', () => {
  const small = mergeSettings({ new_cards_per_day: 3, session_cards: 25 })
  let plan = composeCards({ ready: READY, states: [], openLevels: [1], settings: small, now: NOW, newToday: 1 })
  assert.equal(plan.cards.length, 2)
  plan = composeCards({ ready: READY, states: [], openLevels: [1], settings: mergeSettings({ session_cards: 5 }), now: NOW, newToday: 0 })
  assert.equal(plan.cards.length, 5)
})

test('сессия: закрытый уровень не попадает; пустая очередь → свободная практика; нет контента → пусто', () => {
  const l2 = [st(2, 'a1', '2026-10-31T10:00:00Z')]
  assert.equal(composeCards({ ready: READY, states: l2, openLevels: [1], settings: S, now: NOW, newToday: 20 }).kind, 'empty')
  const future = Array.from(['a1', 'a2', 'a3', 'h1', 's1', 's2', 'w1'], (id) => st(1, id, '2026-12-01T10:00:00Z'))
  const p = composeCards({ ready: READY, states: future, openLevels: [1], settings: S, now: NOW, newToday: 0 })
  assert.equal(p.kind, 'practice')
  assert.ok(p.cards.every((c) => c.source === 'practice'))
  assert.equal(composeCards({ ready: { 1: [], 2: [] }, states: [], openLevels: [1], settings: S, now: NOW, newToday: 0 }).kind, 'empty')
  const t = todaySummary({ ready: READY, states: [st(1, 'a2', '2026-10-31T10:00:00Z')], openLevels: [1], settings: S, now: NOW, newToday: 0 })
  assert.deepEqual([t.kind, t.due, t.fresh > 0, t.minutes >= 1], ['regular', 1, true, true])
})

// ── прогресс ──
test('день в часовом поясе ресторана и серия', () => {
  assert.equal(dayIn('2026-11-01T22:30:00Z', 'Europe/Moscow'), '2026-11-02')
  assert.equal(dayIn('2026-11-01T22:30:00Z', 'UTC'), '2026-11-01')
  assert.equal(dayIn('2026-11-01T22:30:00Z', 'Not/AZone'), '2026-11-01')
  assert.equal(prevDay('2026-03-01'), '2026-02-28')
  assert.equal(nextStreak(null, 0, '2026-11-02'), 1)
  assert.equal(nextStreak('2026-11-01', 4, '2026-11-02'), 5)
  assert.equal(nextStreak('2026-11-02', 5, '2026-11-02'), 5)
  assert.equal(nextStreak('2026-10-30', 9, '2026-11-02'), 1)
  assert.equal(visibleStreak('2026-10-30', 9, '2026-11-02'), 0)
  assert.equal(visibleStreak('2026-11-01', 3, '2026-11-02'), 3)
})

test('баллы уровня не уходят ниже нуля', () => {
  assert.deepEqual(addPoints({ 1: 3 }, 1, -10), { 1: 0 })
  assert.deepEqual(addPoints({ 1: 3 }, 2, 4), { 1: 3, 2: 4 })
  assert.equal(totalPoints({ 1: 3, 2: 4 }), 7)
})

// ── коды-приглашения ──
test('код: формат, нормализация ввода и QR-ссылки', () => {
  const code = generateCode()
  assert.equal(code.length, 8)
  assert.ok([...code].every((c) => CODE_ALPHABET.includes(c)))
  assert.equal(normalizeCode(' k7m2-qx9p '), 'K7M2QX9P')
  assert.equal(normalizeCode('K7M2QX9'), null)
  assert.equal(normalizeCode('K7M2-QX9O'), null) // «O» нет в алфавите
  assert.equal(normalizeCode('https://x/join?code=K7M2QX9P'), null) // длиннее 8 — это ссылка, её разбирает приложение
  assert.equal(formatCode('K7M2QX9P'), 'K7M2-QX9P')
  assert.equal(new Set(Array.from({ length: 200 }, () => generateCode())).size, 200)
})

test('состояние приглашения', () => {
  const now = new Date('2026-11-01T10:00:00Z')
  const base = { expires_at: '2026-11-08T10:00:00Z', used_at: null, revoked_at: null }
  assert.equal(inviteState(base, now), 'ok')
  assert.equal(inviteState(null, now), 'missing')
  assert.equal(inviteState({ ...base, used_at: '2026-11-01T09:00:00Z' }, now), 'used')
  assert.equal(inviteState({ ...base, revoked_at: '2026-11-01T09:00:00Z' }, now), 'revoked')
  assert.equal(inviteState({ ...base, expires_at: '2026-11-01T10:00:00Z' }, now), 'expired')
})

test('имя и email', () => {
  assert.equal(cleanName('  Иван   Петров '), 'Иван Петров')
  assert.equal(cleanName('   '), null)
  assert.equal(cleanEmail(' Ivan@Mail.RU '), 'ivan@mail.ru')
  assert.equal(cleanEmail('ivan@'), null)
  assert.equal(cleanEmail('ivan mail@x.ru'), null)
})
