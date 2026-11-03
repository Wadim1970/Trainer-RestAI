// node --test api/_lib/service.test.js — вход по списку доступа, сессии, ответы, администратор (поддельная БД).
process.env.SUPABASE_URL ||= 'http://localhost'
process.env.SUPABASE_SERVICE_KEY ||= 'test'
process.env.TRAINER_PUBLIC_URL = 'https://trainer.example.com/'

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { fakeDb } from './testing/fakeDb.js'
import { seeded } from './distractorCore.js'

const { deps } = await import('./db.js')
const auth = await import('./authService.js')
const svc = await import('./trainerService.js')
const enr = await import('./enrollmentsService.js')
const { assertAdmin } = await import('./adminAuth.js')

const R = 'dd89773c-0952-4fd1-9510-514094a928ee'
const R2 = '22222222-2222-2222-2222-222222222222'
const NOW = new Date('2026-11-01T10:00:00Z')

const dish = (id, name, section, extra = {}) => ({ id, restaurant_id: R, dish_name: name, menu_section: section, section_order: 1, product_type: 'food', is_hidden: false, ...extra })
const ing = (...names) => ({ items: names.map((n, i) => ({ name: n, is_key: i < 3 })) })
const fact = (dish_id, value) => ({ restaurant_id: R, dish_id, fact_type: 'ingredients', status: 'confirmed', value })

const USERS = { 'tok-ivan': { id: 'u-ivan', email: 'ivan@mail.ru' }, 'tok-anna': { id: 'u-anna', email: 'anna@mail.ru' }, 'tok-caps': { id: 'u-caps', email: 'Pavel@Mail.RU' } }
const req = (token, extra = {}) => ({ headers: token ? { authorization: `Bearer ${token}` } : {}, ...extra })

let t
beforeEach(() => {
  deps.now = () => NOW
  deps.rng = seeded(11)
  deps.getUser = async (jwt) => USERS[jwt] || null
  deps.db = fakeDb({
    restaurants: [{ id: R, name: 'Сыроварня', timezone: 'Europe/Moscow' }, { id: R2, name: 'Другой' }],
    menu_items: [
      dish('a1', 'Цезарь с курицей', 'Салаты'), dish('a2', 'Греческий', 'Салаты'), dish('a3', 'Оливье', 'Салаты'),
      dish('s1', 'Борщ', 'Супы'), dish('s2', 'Солянка', 'Супы'), dish('h1', 'Рибай', 'Горячее'),
    ],
    trn_dish_facts: [
      fact('a1', ing('Курица', 'Пармезан', 'Романо', 'Соус цезарь')), fact('a2', ing('Огурцы', 'Томаты', 'Фета', 'Маслины')),
      fact('a3', ing('Картофель', 'Горошек', 'Колбаса', 'Майонез')), fact('s1', ing('Свёкла', 'Говядина', 'Капуста', 'Сметана')),
    ],
    trn_enrollments: [], trn_invites: [], trn_members: [], trn_settings: [], trn_sessions: [], trn_attempts: [], trn_card_states: [], trn_member_state: [],
  })
  t = deps.db.tables
})

const err = (p) => p.then(() => assert.fail('ожидалась ошибка'), (e) => e)
const enrollment = (email, extra = {}) => ({ id: `e-${email}`, restaurant_id: R, email, name: null, status: 'invited', created_at: NOW.toISOString(), first_login_at: null, closed_at: null, ...extra })

// Официант внесён в список и вошёл (первый вход создаёт участника).
async function registered(token = 'tok-ivan', name = 'Иван') {
  t.trn_enrollments.push(enrollment(USERS[token].email.toLowerCase(), { name }))
  return (await auth.authenticateMember(req(token))).member
}

// ── вход по списку доступа ──
test('первый вход: участник создан из записи списка, курс идёт (active), имя из списка', async () => {
  t.trn_enrollments.push(enrollment('ivan@mail.ru', { name: 'Иван Петров' }))
  const { member } = await auth.authenticateMember(req('tok-ivan'))
  assert.deepEqual([member.name, member.restaurant_id, member.email], ['Иван Петров', R, 'ivan@mail.ru'])
  assert.equal(t.trn_members.length, 1)
  const e = t.trn_enrollments[0]
  assert.deepEqual([e.status, e.member_id, e.first_login_at], ['active', member.id, NOW.toISOString()])
  // повторный вход ничего не плодит и не сдвигает дату первого входа
  deps.now = () => new Date('2026-11-02T10:00:00Z')
  await auth.authenticateMember(req('tok-ivan'))
  assert.equal(t.trn_members.length, 1)
  assert.equal(t.trn_enrollments[0].first_login_at, NOW.toISOString())
})

test('имя не указано в списке — берётся из почты; регистр почты не важен', async () => {
  t.trn_enrollments.push(enrollment('pavel@mail.ru'))
  const { member } = await auth.authenticateMember(req('tok-caps'))
  assert.equal(member.name, 'Pavel')
  assert.equal(member.email, 'pavel@mail.ru')
})

test('почты нет в списке — вход закрыт, участник не создаётся', async () => {
  const e = await err(auth.authenticateMember(req('tok-anna')))
  assert.equal(e.status, 403)
  assert.match(e.message, /нет в списке/)
  assert.equal(t.trn_members.length, 0)
})

test('доступ закрыт администратором — «доступ закончился», прогресс сохранён, повторный доступ работает', async () => {
  const member = await registered()
  await enr.closeEnrollment(R, t.trn_enrollments[0].id)
  const e = await err(auth.authenticateMember(req('tok-ivan')))
  assert.equal(e.status, 403)
  assert.match(e.message, /Доступ к курсу закончился/)
  assert.equal(t.trn_members.length, 1, 'участник и его прогресс остаются')
  // администратор открывает доступ снова: новая запись, тот же участник
  await enr.addEnrollments(R, { emails: 'ivan@mail.ru Иван', actor: 'Админ' })
  const again = await auth.authenticateMember(req('tok-ivan'))
  assert.equal(again.member.id, member.id)
  assert.equal(t.trn_members.length, 1)
})

test('почта занята в другом ресторане — вход закрыт', async () => {
  const member = await registered()
  t.trn_enrollments[0].status = 'closed'; t.trn_enrollments[0].closed_at = NOW.toISOString()
  t.trn_enrollments.push(enrollment('ivan@mail.ru', { restaurant_id: R2, id: 'e-other' }))
  const e = await err(auth.authenticateMember(req('tok-ivan')))
  assert.equal(e.status, 403)
  assert.match(e.message, /другому ресторану/)
  assert.equal(t.trn_members.find((m) => m.id === member.id).restaurant_id, R)
})

test('два запроса при первом входе: участник один', async () => {
  t.trn_enrollments.push(enrollment('ivan@mail.ru', { name: 'Иван' }))
  const realFrom = deps.db.from.bind(deps.db)
  deps.db.from = (name) => {
    const q = realFrom(name)
    if (name === 'trn_members') {
      q.insert = (row) => ({ select: () => ({ single: async () => { t.trn_members.push({ id: 'm-race', ...row }); return { data: null, error: { code: '23505', message: 'duplicate' } } } }) })
    }
    return q
  }
  const { member } = await auth.authenticateMember(req('tok-ivan'))
  assert.equal(member.id, 'm-race')
  assert.equal(t.trn_members.length, 1)
  assert.equal(t.trn_enrollments[0].status, 'active')
})

test('прочие ошибки базы при создании участника не глотаются', async () => {
  t.trn_enrollments.push(enrollment('ivan@mail.ru'))
  const realFrom = deps.db.from.bind(deps.db)
  deps.db.from = (name) => {
    const q = realFrom(name)
    if (name === 'trn_members') q.insert = () => ({ select: () => ({ single: async () => ({ data: null, error: { code: 'XX000', message: 'boom' } }) }) })
    return q
  }
  assert.equal((await err(auth.authenticateMember(req('tok-ivan')))).message, 'boom')
  assert.equal(t.trn_enrollments[0].status, 'invited', 'доступ не «запущен», если участник не создан')
})

test('авторизация запросов: нет токена / неизвестный токен', async () => {
  assert.equal((await err(auth.authenticateMember(req(null)))).status, 401)
  assert.equal((await err(auth.authenticateMember(req('tok-nobody')))).status, 401)
})

// ── главный экран ──
test('главный экран нового официанта: уровень 1 открыт, 2 закрыт, 3 «скоро», план на сегодня', async () => {
  const member = await registered()
  const me = await svc.getMe(member)
  assert.equal(me.restaurant.name, 'Сыроварня')
  assert.deepEqual(me.levels.map((l) => l.status), ['open', 'locked', 'soon'])
  assert.deepEqual([me.points, me.streak], [0, 0])
  assert.equal(me.today.kind, 'regular')
  assert.equal(me.today.fresh, 6) // 6 блюд, все новые
})

// ── сессии и ответы ──
const correct = (s) => s.questions.map((q) => ({ qid: q.qid, selected: q.answer, confident: true, latencyMs: 3000 }))

test('сессия: вопросы выданы, сохранены на сервере; ответы проверяет сервер, баллы и повторение записаны', async () => {
  const member = await registered()
  const s = await svc.createSession(member)
  assert.equal(s.kind, 'regular')
  assert.ok(s.questions.length >= 5)
  assert.ok(s.questions.every((q) => q.level === 1 && q.answer.length >= 1))
  assert.equal(t.trn_sessions.length, 1)
  assert.deepEqual(s.scoring.points, { correct_confident: 2, correct_unsure: 1, wrong_confident: -2, wrong_unsure: 0 })

  const r = await svc.submitAnswers(member, { sessionId: s.sessionId, answers: correct(s) })
  assert.equal(r.totals.correct, s.questions.length)
  assert.ok(r.totals.points > 0)
  assert.equal(t.trn_attempts.length, s.questions.length)
  assert.equal(t.trn_card_states.length, s.questions.length)
  assert.ok(t.trn_card_states.every((c) => new Date(c.due_at) > NOW - 1))
  assert.equal(r.points, r.totals.points)
  assert.equal(r.streak, 1)
  assert.ok(t.trn_sessions[0].completed_at)
})

test('повторная отправка тех же ответов не удваивает баллы и не меняет расписание', async () => {
  const member = await registered()
  const s = await svc.createSession(member)
  const first = await svc.submitAnswers(member, { sessionId: s.sessionId, answers: correct(s) })
  const states = JSON.stringify(t.trn_card_states)
  const again = await svc.submitAnswers(member, { sessionId: s.sessionId, answers: correct(s) })
  assert.equal(t.trn_attempts.length, s.questions.length)
  assert.equal(again.totals.points, first.totals.points)
  assert.equal(again.points, first.points)
  assert.equal(JSON.stringify(t.trn_card_states), states)
  assert.equal(t.trn_member_state[0].streak_days, 1)
})

test('ответ можно прислать частями: итог складывается', async () => {
  const member = await registered()
  const s = await svc.createSession(member)
  const all = correct(s)
  await svc.submitAnswers(member, { sessionId: s.sessionId, answers: all.slice(0, 2) })
  assert.ok(!t.trn_sessions[0].completed_at)
  const r = await svc.submitAnswers(member, { sessionId: s.sessionId, answers: all })
  assert.equal(r.totals.answered, s.questions.length)
  assert.equal(t.trn_attempts.length, s.questions.length)
})

test('неверный уверенный ответ: минус баллы, карточка скоро вернётся; неуверенный — без штрафа', async () => {
  const member = await registered()
  const s = await svc.createSession(member)
  const [q1, q2] = s.questions
  const wrongOf = (q) => [q.options.find((o) => !q.answer.includes(o.id)).id]
  const r = await svc.submitAnswers(member, { sessionId: s.sessionId, answers: [
    { qid: q1.qid, selected: wrongOf(q1), confident: true, latencyMs: 1000 },
    { qid: q2.qid, selected: wrongOf(q2), confident: false, latencyMs: 1000 },
  ] })
  assert.deepEqual(r.results.map((x) => [x.correct, x.points]), [[false, -2], [false, 0]])
  assert.equal(r.points, 0, 'баллы уровня не ниже нуля')
  assert.equal(r.weak.length >= 1, true)
  const state = t.trn_card_states.find((c) => c.card_key === q1.cardKey)
  assert.ok(new Date(state.due_at) <= new Date(NOW.getTime() + 2 * 60_000), 'Again → через минуту')
})

test('чужую сессию отправить нельзя; мусор в ответах игнорируется', async () => {
  const ivan = await registered('tok-ivan', 'K7M2QX9P')
  const anna = await registered('tok-anna', 'ANNAKEY2')
  const s = await svc.createSession(ivan)
  assert.equal((await err(svc.submitAnswers(anna, { sessionId: s.sessionId, answers: correct(s) }))).status, 404)
  assert.equal((await err(svc.submitAnswers(ivan, { sessionId: s.sessionId, answers: [] }))).status, 400)
  const r = await svc.submitAnswers(ivan, { sessionId: s.sessionId, answers: [{ qid: 'nope', selected: ['o0'] }, { qid: s.questions[0].qid, selected: ['чужой'], confident: true }] })
  assert.equal(r.results.length, 1)
  assert.equal(r.results[0].correct, false)
})

test('уровень 2 открывается, когда набраны баллы уровня 1', async () => {
  t.trn_settings.push({ restaurant_id: R, value: { unlock_points: { 2: 8 }, session_cards: 6 } })
  const member = await registered()
  let me = await svc.getMe(member)
  assert.equal(me.levels[1].status, 'locked')
  const s = await svc.createSession(member)
  const r = await svc.submitAnswers(member, { sessionId: s.sessionId, answers: correct(s) })
  assert.ok(r.points >= 8)
  assert.deepEqual(r.unlocked, [2])
  me = await svc.getMe(member)
  assert.equal(me.levels[1].status, 'open')
  assert.equal(me.settings.unlockPoints[2], 8)
})

test('нет подтверждённых данных — честное «пусто», а не пустая сессия', async () => {
  const member = await registered()
  t.menu_items.length = 0
  const s = await svc.createSession(member)
  assert.deepEqual([s.kind, s.reason, s.questions.length], ['empty', 'no_content', 0])
  assert.equal(t.trn_sessions.length, 0)
})

test('уровень 2 без подтверждённого состава пуст: шеф не подтвердил — тренажёр не придумывает', async () => {
  t.trn_dish_facts.length = 0
  t.trn_settings.push({ restaurant_id: R, value: { unlock_points: { 2: 0 } } })
  const member = await registered()
  const me = await svc.getMe(member)
  assert.equal(me.levels[1].status, 'empty')
  const s = await svc.createSession(member)
  assert.ok(s.questions.every((q) => q.level === 1))
})

test('данные других ресторанов не видны', async () => {
  const member = await registered()
  t.menu_items.push({ ...dish('z9', 'Чужое блюдо', 'Салаты'), restaurant_id: R2 })
  const s = await svc.createSession(member)
  const text = JSON.stringify(s)
  assert.ok(!text.includes('Чужое блюдо'))
})

// ── администратор ──
const ensured = []
beforeEach(() => {
  ensured.length = 0
  deps.authAdmin.ensureUser = async ({ email }) => { ensured.push(email); return { id: `u-${email}`, created: true } }
})

test('администратор: внести email списком — добавлены, повторы, неверные, чужой ресторан', async () => {
  t.trn_enrollments.push(enrollment('busy@mail.ru', { restaurant_id: R2, id: 'e-busy' }), enrollment('ivan@mail.ru', { id: 'e-ivan' }))
  const r = await enr.addEnrollments(R, { emails: 'Anna@Mail.ru Анна Смирнова\nivan@mail.ru\nbusy@mail.ru\nне-почта\nanna@mail.ru', actor: ' Админ ' })
  assert.deepEqual(r.results.map((x) => [x.email, x.status]), [
    ['anna@mail.ru', 'added'], ['ivan@mail.ru', 'exists'], ['busy@mail.ru', 'other_restaurant'], [null, 'invalid'],
  ])
  assert.equal(r.added, 1)
  const created = t.trn_enrollments.find((e) => e.email === 'anna@mail.ru')
  assert.deepEqual([created.name, created.status, created.restaurant_id, created.created_by], ['Анна Смирнова', 'invited', R, 'Админ'])
  assert.deepEqual(ensured, ['anna@mail.ru'], 'пользователь для входа заводится только для новой почты')
  assert.equal((await err(enr.addEnrollments(R, { emails: '  \n ' }))).status, 400)
  assert.equal((await err(enr.addEnrollments(R, { emails: Array.from({ length: 101 }, (_, i) => `u${i}@mail.ru`) }))).status, 400)
  assert.equal((await err(enr.addEnrollments('99999999-9999-9999-9999-999999999999', { emails: 'a@mail.ru' }))).status, 404)
})

test('администратор: ошибка заведения пользователя — доступ не создаётся, остальные строки идут дальше', async () => {
  deps.authAdmin.ensureUser = async ({ email }) => { if (email === 'bad@mail.ru') throw new Error('gotrue down'); return { id: 'u', created: true } }
  const r = await enr.addEnrollments(R, { emails: 'bad@mail.ru\ngood@mail.ru' })
  assert.deepEqual(r.results.map((x) => x.status), ['error', 'added'])
  assert.deepEqual(t.trn_enrollments.map((e) => e.email), ['good@mail.ru'])
})

test('администратор: закрыть доступ — один раз; чужой ресторан и закрытый не закрываются', async () => {
  t.trn_enrollments.push(enrollment('ivan@mail.ru', { id: 'e-ivan' }))
  assert.equal((await err(enr.closeEnrollment(R2, 'e-ivan'))).status, 404)
  await enr.closeEnrollment(R, 'e-ivan')
  const e = t.trn_enrollments[0]
  assert.deepEqual([e.status, e.closed_reason, e.closed_at], ['closed', 'admin', NOW.toISOString()])
  assert.equal((await err(enr.closeEnrollment(R, 'e-ivan'))).status, 404)
})

test('администратор: список доступов с прогрессом; открытые выше закрытых; демо и чужие рестораны не видны; доступ к кабинету', async () => {
  const member = await registered()
  const s = await svc.createSession(member)
  await svc.submitAnswers(member, { sessionId: s.sessionId, answers: correct(s) })
  t.trn_enrollments.push(
    enrollment('old@mail.ru', { id: 'e-old', status: 'closed', closed_at: NOW.toISOString(), created_at: '2026-11-02T00:00:00Z' }),
    enrollment('new@mail.ru', { id: 'e-new', created_at: '2026-10-01T00:00:00Z' }),
    enrollment('demo-abc@demo.restai.pro', { id: 'e-demo' }),
    enrollment('other@mail.ru', { id: 'e-r2', restaurant_id: R2 }),
  )
  const { enrollments, counts } = await enr.listEnrollments(R)
  assert.deepEqual(enrollments.map((e) => [e.email, e.status]), [['ivan@mail.ru', 'active'], ['new@mail.ru', 'invited'], ['old@mail.ru', 'closed']])
  assert.deepEqual(counts, { open: 2, closed: 1 })
  assert.ok(enrollments[0].points > 0)
  assert.equal(enrollments[0].streak, 1)
  assert.equal(enrollments[1].points, 0)
  assert.deepEqual((await enr.listEnrollments(R2)).enrollments.map((e) => e.email), ['other@mail.ru'])

  delete process.env.ADMIN_TOKEN
  assert.equal(assertAdmin({ headers: {} }, R), R) // учебный ресторан открыт (тестовый режим)
  assert.equal((() => { try { assertAdmin({ headers: {} }, R2) } catch (e) { return e.status } })(), 401)
  process.env.ADMIN_TOKEN = 'secret-token'
  assert.equal(assertAdmin({ headers: { 'x-admin-token': 'secret-token' } }, R2), R2)
  assert.equal((() => { try { assertAdmin({ headers: { 'x-admin-token': 'wrong-token!' } }, R2) } catch (e) { return e.status } })(), 401)
  assert.equal((() => { try { assertAdmin({ headers: {} }, 'not-uuid') } catch (e) { return e.status } })(), 400)
  delete process.env.ADMIN_TOKEN
})

test('вино в сессии: вопросы про сорт/год собираются из подтверждённых фактов, неподтверждённое не попадает', async () => {
  const wines = [['w1', 'Каберне Резерв', ['Каберне Совиньон', 'Мерло'], 2019], ['w2', 'Белое сухое', ['Совиньон блан'], 2021],
    ['w3', 'Розовое', ['Гренаш', 'Сира'], 2022], ['w4', 'Красное', ['Темпранильо'], 2018], ['w5', 'Игристое', ['Шардоне'], 2020]]
  for (const [id, name] of wines) t.menu_items.push(dish(id, name, 'Вино', { product_type: 'alcohol' }))
  for (const [id, , grapes, year] of wines) {
    t.trn_dish_facts.push({ restaurant_id: R, dish_id: id, fact_type: 'wine_grape', status: 'confirmed', value: { grapes } })
    t.trn_dish_facts.push({ restaurant_id: R, dish_id: id, fact_type: 'wine_vintage', status: 'confirmed', value: { year } })
  }
  t.menu_items.push(dish('w6', 'Чёрновик', 'Вино', { product_type: 'alcohol' }))
  t.trn_dish_facts.push({ restaurant_id: R, dish_id: 'w6', fact_type: 'wine_grape', status: 'draft', value: { grapes: ['Пино Нуар'] } })
  t.trn_settings.push({ restaurant_id: R, value: { unlock_points: { 2: 0 }, session_cards: 60, new_cards_per_day: 60 } })
  const member = await registered()
  const s = await svc.createSession(member)
  const wine = s.questions.filter((q) => ['wine_grape', 'wine_vintage', 'guess_wine'].includes(q.kind))
  assert.ok(wine.length >= 3, `вопросов про вино: ${wine.length}`)
  assert.ok(wine.every((q) => q.level === 2 && !JSON.stringify(q).includes('Чёрновик') && !JSON.stringify(q).includes('Пино')))
  const r = await svc.submitAnswers(member, { sessionId: s.sessionId, answers: correct(s) })
  assert.ok(r.points > 0)
})
