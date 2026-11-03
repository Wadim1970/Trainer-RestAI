// node --test api/_lib/demo.test.js — демо-вход для показа (учебный ресторан).
process.env.SUPABASE_URL ||= 'http://localhost'
process.env.SUPABASE_SERVICE_KEY ||= 'test'

import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { fakeDb } from './testing/fakeDb.js'

const { deps } = await import('./db.js')
const demo = await import('./demoService.js')
const svc = await import('./trainerService.js')
const enr = await import('./enrollmentsService.js')
const auth = await import('./authService.js')

const R = demo.DEMO_RESTAURANT_ID
const NOW = new Date('2026-11-05T10:00:00Z')

let t, created, deleted, grantFails
beforeEach(() => {
  process.env.TRAINER_DEMO_CODE = '1111'
  delete process.env.TRAINER_DEMO_RESTAURANT_ID
  deps.now = () => NOW
  created = []
  deleted = []
  grantFails = false
  deps.authAdmin = {
    async createUser({ email, password }) { const id = `auth-${created.length + 1}`; created.push({ id, email, password }); return { id } },
    async deleteUser(id) { deleted.push(id) },
    async passwordGrant({ email }) {
      if (grantFails) throw new Error('GoTrue недоступен')
      return { access_token: `at-${email}`, refresh_token: 'rt', expires_in: 3600, token_type: 'bearer' }
    },
  }
  deps.db = fakeDb({
    restaurants: [{ id: R, name: 'Сыроварня', timezone: 'Europe/Moscow' }],
    menu_items: [], trn_dish_facts: [], trn_enrollments: [{ id: 'e-1', restaurant_id: R, email: 'ivan@mail.ru', name: 'Иван', status: 'active', member_id: 'real-1', created_at: '2026-10-01T00:00:00Z' }], trn_invites: [], trn_settings: [], trn_sessions: [], trn_attempts: [], trn_card_states: [], trn_member_state: [],
    trn_members: [
      { id: 'real-1', auth_user_id: 'u-real', restaurant_id: R, name: 'Иван', email: 'ivan@mail.ru', created_at: '2026-10-01T00:00:00Z' },
    ],
  })
  t = deps.db.tables
})
afterEach(() => { delete process.env.TRAINER_DEMO_CODE })

const err = (p) => p.then(() => assert.fail('ожидалась ошибка'), (e) => e)

test('демо-вход выключен, пока не задан TRAINER_DEMO_CODE', async () => {
  delete process.env.TRAINER_DEMO_CODE
  const e = await err(demo.demoLogin('1111'))
  assert.equal(e.status, 404)
  assert.equal(created.length, 0)
})

test('неверный и пустой код — отказ, аккаунт не создаётся', async () => {
  for (const bad of ['0000', '', undefined, '11111', ' 11 ']) assert.equal((await err(demo.demoLogin(bad))).status, 401, String(bad))
  assert.equal(created.length, 0)
  assert.equal(t.trn_members.length, 1)
})

test('верный код: отдельный демо-официант «Сыроварни» и настоящая сессия', async () => {
  const s = await demo.demoLogin(' 1111 ')
  assert.equal(created.length, 1)
  assert.match(created[0].email, /^demo-[0-9a-f]{12}@demo\.restai\.pro$/)
  assert.ok(created[0].password.length >= 24)
  assert.equal(s.access_token, `at-${created[0].email}`)
  assert.equal(s.refresh_token, 'rt')
  const m = t.trn_members.find((x) => x.email === created[0].email)
  assert.deepEqual([m.name, m.restaurant_id, m.auth_user_id], [demo.DEMO_NAME, R, 'auth-1'])
})

test('каждый вход — отдельный аккаунт с чистым прогрессом', async () => {
  deps.now = () => new Date() // поддельная БД ставит created_at по реальным часам — «сейчас» должно с ними совпадать
  await demo.demoLogin('1111')
  await demo.demoLogin('1111')
  assert.equal(created.length, 2)
  assert.notEqual(created[0].email, created[1].email)
  assert.notEqual(created[0].password, created[1].password)
  assert.equal(t.trn_members.filter((m) => demo.isDemoEmail(m.email)).length, 2)
})

test('демо-аккаунты старше суток удаляются; свежие и настоящие участники — нет', async () => {
  t.trn_members.push(
    { id: 'd-old', auth_user_id: 'u-old', restaurant_id: R, name: 'Демо', email: 'demo-aaaaaaaaaaaa@demo.restai.pro', created_at: '2026-11-03T10:00:00Z' },
    { id: 'd-new', auth_user_id: 'u-new', restaurant_id: R, name: 'Демо', email: 'demo-bbbbbbbbbbbb@demo.restai.pro', created_at: '2026-11-05T08:00:00Z' },
    // «настоящий» участник старше суток с похожей почтой, но другим доменом — не трогаем
    { id: 'real-2', auth_user_id: 'u-real2', restaurant_id: R, name: 'Анна', email: 'demo-cccccccccccc@gmail.com', created_at: '2026-10-01T00:00:00Z' },
  )
  await demo.demoLogin('1111')
  assert.deepEqual(deleted, ['u-old'])
  const ids = t.trn_members.map((m) => m.id)
  assert.ok(!ids.includes('d-old'))
  assert.ok(ids.includes('d-new') && ids.includes('real-1') && ids.includes('real-2'))
})

test('сбой входа: аккаунт и участник убираются, наружу — понятная ошибка без деталей', async () => {
  grantFails = true
  const e = await err(demo.demoLogin('1111'))
  assert.equal(e.status, 502)
  assert.ok(!/GoTrue/.test(e.message))
  assert.deepEqual(deleted, ['auth-1'])
  assert.equal(t.trn_members.filter((m) => demo.isDemoEmail(m.email)).length, 0)
})

test('ресторан демо можно переопределить переменной окружения', async () => {
  process.env.TRAINER_DEMO_RESTAURANT_ID = '33333333-3333-3333-3333-333333333333'
  await demo.demoLogin('1111')
  assert.equal(t.trn_members.at(-1).restaurant_id, '33333333-3333-3333-3333-333333333333')
})

test('главный экран знает, что это демо; у настоящего официанта признака нет', async () => {
  await demo.demoLogin('1111')
  const d = t.trn_members.find((m) => demo.isDemoEmail(m.email))
  const real = t.trn_members.find((m) => m.id === 'real-1')
  assert.equal((await svc.getMe({ ...d })).demo, true)
  assert.equal((await svc.getMe({ ...real })).demo, false)
})

test('в списке официантов админки демо-аккаунтов нет', async () => {
  await demo.demoLogin('1111')
  t.trn_enrollments.push({ id: 'e-2', restaurant_id: R, email: 'demo-zzz@demo.restai.pro', name: null, status: 'invited', created_at: '2026-10-02T00:00:00Z' })
  const { enrollments } = await enr.listEnrollments(R)
  assert.deepEqual(enrollments.map((e) => e.name), ['Иван'])
})

test('демо-официант входит без записи в списке доступа; «чужой» демо-адрес без участника — нет', async () => {
  const sess = await demo.demoLogin('1111')
  const email = sess.access_token.replace(/^at-/, '')
  const user = { id: created.at(-1).id, email }
  deps.getUser = async () => user
  const { member } = await auth.authenticateMember({ headers: { authorization: 'Bearer x' } })
  assert.equal(member.email, email)
  assert.equal(t.trn_enrollments.length, 1, 'для демо записи доступа не создаются')
  deps.getUser = async () => ({ id: 'u-fake', email: 'demo-fake@demo.restai.pro' })
  assert.equal((await err(auth.authenticateMember({ headers: { authorization: 'Bearer x' } }))).status, 403)
})

test('isDemoEmail: только наш демо-домен', () => {
  assert.equal(demo.isDemoEmail('demo-1@demo.restai.pro'), true)
  assert.equal(demo.isDemoEmail('DEMO-1@DEMO.RESTAI.PRO'), true)
  assert.equal(demo.isDemoEmail('x@demo.restai.pro.evil.com'), false)
  assert.equal(demo.isDemoEmail('x@restai.pro'), false)
  assert.equal(demo.isDemoEmail(null), false)
})
