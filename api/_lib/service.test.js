// node --test api/_lib/service.test.js — вход по коду, сессии, ответы, коды-приглашения (поддельная БД).
process.env.SUPABASE_URL ||= 'http://localhost'
process.env.SUPABASE_SERVICE_KEY ||= 'test'

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { fakeDb } from './testing/fakeDb.js'
import { seeded } from './distractorCore.js'

const { deps } = await import('./db.js')
const auth = await import('./authService.js')
const svc = await import('./trainerService.js')
const inv = await import('./invitesService.js')
const { assertAdmin } = await import('./adminAuth.js')

const R = 'dd89773c-0952-4fd1-9510-514094a928ee'
const R2 = '22222222-2222-2222-2222-222222222222'
const NOW = new Date('2026-11-01T10:00:00Z')

const dish = (id, name, section, extra = {}) => ({ id, restaurant_id: R, dish_name: name, menu_section: section, section_order: 1, product_type: 'food', is_hidden: false, ...extra })
const ing = (...names) => ({ items: names.map((n, i) => ({ name: n, is_key: i < 3 })) })
const fact = (dish_id, value) => ({ restaurant_id: R, dish_id, fact_type: 'ingredients', status: 'confirmed', value })

const USERS = { 'tok-ivan': { id: 'u-ivan', email: 'ivan@mail.ru' }, 'tok-anna': { id: 'u-anna', email: 'anna@mail.ru' } }
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
    trn_invites: [], trn_members: [], trn_settings: [], trn_sessions: [], trn_attempts: [], trn_card_states: [], trn_member_state: [],
  })
  t = deps.db.tables
})

const err = (p) => p.then(() => assert.fail('ожидалась ошибка'), (e) => e)
const invite = (code, extra = {}) => ({ id: `i-${code}`, restaurant_id: R, code, kind: 'training', created_at: NOW.toISOString(), expires_at: '2026-11-08T10:00:00Z', used_at: null, revoked_at: null, ...extra })

async function registered(token = 'tok-ivan', code = 'K7M2QX9P') {
  t.trn_invites.push(invite(code))
  await auth.redeemInvite(USERS[token], { code, name: 'Иван' })
  return (await auth.authenticateMember(req(token))).member
}

// ── вход и регистрация ──
test('проверка кода: действителен / не тот формат / нет / использован / истёк / отозван', async () => {
  t.trn_invites.push(invite('K7M2QX9P'), invite('USEDUSED', { used_at: NOW.toISOString() }), invite('EXPRD222', { expires_at: '2026-10-01T00:00:00Z' }), invite('RVKD2222', { revoked_at: NOW.toISOString() }))
  const ok = await auth.checkInvite('k7m2-qx9p')
  assert.deepEqual(ok.restaurant, { id: R, name: 'Сыроварня' })
  assert.equal((await err(auth.checkInvite('123'))).status, 400)
  assert.equal((await err(auth.checkInvite('AAAAAAAA'))).status, 404)
  for (const c of ['USEDUSED', 'EXPRD222', 'RVKD2222']) assert.equal((await err(auth.checkInvite(c))).status, 410)
  assert.equal(t.trn_invites.find((i) => i.code === 'K7M2QX9P').used_at, null, 'проверка ничего не расходует')
})

test('регистрация по коду: участник создан, код погашен, повторно использовать нельзя', async () => {
  t.trn_invites.push(invite('K7M2QX9P'))
  const r = await auth.redeemInvite(USERS['tok-ivan'], { code: 'K7M2-QX9P', name: '  Иван  Петров ' })
  assert.equal(r.member.name, 'Иван Петров')
  assert.equal(t.trn_members.length, 1)
  assert.equal(t.trn_members[0].restaurant_id, R)
  assert.equal(t.trn_members[0].email, 'ivan@mail.ru')
  const used = t.trn_invites[0]
  assert.ok(used.used_at)
  assert.equal(used.used_by, t.trn_members[0].id)
  // тот же код другим человеком
  assert.equal((await err(auth.redeemInvite(USERS['tok-anna'], { code: 'K7M2QX9P', name: 'Анна' }))).status, 410)
  // тот же человек второй раз
  t.trn_invites.push(invite('NEWKEY22'))
  assert.equal((await err(auth.redeemInvite(USERS['tok-ivan'], { code: 'NEWKEY22', name: 'Иван' }))).status, 409)
  assert.equal(t.trn_invites.find((i) => i.code === 'NEWKEY22').used_at, null, 'второй код не расходуется')
})

test('регистрация: просроченный/отозванный код и пустое имя отклоняются', async () => {
  t.trn_invites.push(invite('EXPRD222', { expires_at: '2026-10-01T00:00:00Z' }), invite('RVKD2222', { revoked_at: NOW.toISOString() }), invite('K7M2QX9P'))
  assert.equal((await err(auth.redeemInvite(USERS['tok-ivan'], { code: 'EXPRD222', name: 'Иван' }))).status, 410)
  assert.equal((await err(auth.redeemInvite(USERS['tok-ivan'], { code: 'RVKD2222', name: 'Иван' }))).status, 410)
  assert.equal((await err(auth.redeemInvite(USERS['tok-ivan'], { code: 'K7M2QX9P', name: '   ' }))).status, 400)
  assert.equal((await err(auth.redeemInvite({ id: 'u-x', email: '' }, { code: 'K7M2QX9P', name: 'Иван' }))).status, 400)
  assert.equal(t.trn_members.length, 0)
})

test('если участника создать не удалось — код возвращается', async () => {
  t.trn_invites.push(invite('K7M2QX9P'))
  const realFrom = deps.db.from.bind(deps.db)
  deps.db.from = (name) => (name === 'trn_members'
    ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: 'XX000', message: 'boom' } }) }) }) }
    : realFrom(name))
  await err(auth.redeemInvite(USERS['tok-ivan'], { code: 'K7M2QX9P', name: 'Иван' }))
  assert.equal(t.trn_invites[0].used_at, null)
})

test('авторизация запросов: нет токена / неизвестный токен / не участник / участник', async () => {
  assert.equal((await err(auth.authenticateMember(req(null)))).status, 401)
  assert.equal((await err(auth.authenticateMember(req('tok-nobody')))).status, 401)
  const e = await err(auth.authenticateMember(req('tok-anna')))
  assert.equal(e.status, 403)
  assert.match(e.message, /код-приглашение/)
  const member = await registered()
  assert.equal(member.restaurant_id, R)
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
test('администратор: выдача, список, отзыв кодов; использованный отозвать нельзя', async () => {
  const made = await inv.createInvites(R, { count: 3, days: 7, note: 'Смена А', actor: 'Админ' })
  assert.equal(made.invites.length, 3)
  assert.equal(new Set(made.invites.map((i) => i.code)).size, 3)
  assert.ok(made.invites.every((i) => i.state === 'ok' && i.codeFormatted.length === 9 && i.joinUrl.includes('/join?code=')))
  assert.equal(t.trn_invites[0].expires_at, '2026-11-08T10:00:00.000Z')

  const code = made.invites[0].code
  await auth.redeemInvite(USERS['tok-ivan'], { code, name: 'Иван' })
  const list = await inv.listInvites(R)
  assert.equal(list.invites.find((i) => i.code === code).state, 'used')
  assert.equal(list.invites.find((i) => i.code === code).usedBy, 'Иван')

  assert.equal((await err(inv.revokeInvite(R, made.invites[0].id))).status, 404)
  await inv.revokeInvite(R, made.invites[1].id)
  assert.equal((await inv.listInvites(R)).invites.find((i) => i.id === made.invites[1].id).state, 'revoked')

  assert.equal((await err(inv.createInvites(R, { count: 0 }))).status, 400)
  assert.equal((await err(inv.createInvites(R, { count: 'abc' }))).status, 400)
  assert.equal((await err(inv.createInvites(R, { count: 1, days: 0 }))).status, 400)
  assert.equal((await err(inv.createInvites(R, { count: 101 }))).status, 400)
  assert.equal((await err(inv.createInvites(R, { count: 1, days: 400 }))).status, 400)
  assert.equal((await err(inv.createInvites('99999999-9999-9999-9999-999999999999', { count: 1 }))).status, 404)
})

test('администратор: список официантов с прогрессом; чужие рестораны закрыты', async () => {
  const member = await registered()
  const s = await svc.createSession(member)
  await svc.submitAnswers(member, { sessionId: s.sessionId, answers: correct(s) })
  const { members } = await inv.listMembers(R)
  assert.equal(members.length, 1)
  assert.equal(members[0].name, 'Иван')
  assert.ok(members[0].points > 0)
  assert.equal(members[0].streak, 1)
  assert.deepEqual((await inv.listMembers(R2)).members, [])

  delete process.env.ADMIN_TOKEN
  assert.equal(assertAdmin({ headers: {} }, R), R) // учебный ресторан открыт (тестовый режим)
  assert.equal((() => { try { assertAdmin({ headers: {} }, R2) } catch (e) { return e.status } })(), 401)
  process.env.ADMIN_TOKEN = 'secret-token'
  assert.equal(assertAdmin({ headers: { 'x-admin-token': 'secret-token' } }, R2), R2)
  assert.equal((() => { try { assertAdmin({ headers: { 'x-admin-token': 'wrong-token!' } }, R2) } catch (e) { return e.status } })(), 401)
  assert.equal((() => { try { assertAdmin({ headers: {} }, 'not-uuid') } catch (e) { return e.status } })(), 400)
  delete process.env.ADMIN_TOKEN
})
