// Демо-вход в тренажёр для показа ресторанам (учебный ресторан «Сыроварня»).
//
// По коду из TRAINER_DEMO_CODE человек получает НАСТОЯЩУЮ сессию Supabase без почты:
// сервер заводит для него отдельного демо-официанта (свой чистый прогресс — двое
// гостей показа не мешают друг другу) и сразу входит под ним. Демо-аккаунты живут
// сутки, потом удаляются при следующем демо-входе. В списке официантов админки их нет.
//
// Демо-вход ВЫКЛЮЧЕН, пока не задан TRAINER_DEMO_CODE.

import crypto from 'node:crypto'
import { deps, selectAll, must } from './db.js'
import { httpError } from './http.js'

export const DEMO_EMAIL_DOMAIN = 'demo.restai.pro'
export const DEMO_RESTAURANT_ID = 'dd89773c-0952-4fd1-9510-514094a928ee' // учебная «Сыроварня»
export const DEMO_NAME = 'Демо-официант'
export const DEMO_TTL_MS = 24 * 3600_000

export const isDemoEmail = (email) => String(email || '').toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`)

export function demoConfig() {
  return {
    code: String(process.env.TRAINER_DEMO_CODE || '').trim(),
    restaurantId: String(process.env.TRAINER_DEMO_RESTAURANT_ID || DEMO_RESTAURANT_ID).trim(),
  }
}

function sameCode(got, expected) {
  const a = Buffer.from(String(got))
  const b = Buffer.from(String(expected))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// Удаляет демо-официантов старше суток (и их пользователей в Supabase Auth).
// Настоящих участников не трогает: отбор — по домену почты демо.
export async function cleanupDemo(restaurantId) {
  const cutoff = deps.now().getTime() - DEMO_TTL_MS
  const members = await selectAll(() => deps.db.from('trn_members').select('id, auth_user_id, email, created_at').eq('restaurant_id', restaurantId))
  const old = members.filter((m) => isDemoEmail(m.email) && new Date(m.created_at).getTime() < cutoff)
  for (const m of old) {
    await deps.authAdmin.deleteUser(m.auth_user_id).catch((e) => console.error('demo cleanup: пользователь', m.auth_user_id, e.message))
    const { error } = await deps.db.from('trn_members').delete().eq('id', m.id)
    if (error) console.error('demo cleanup: участник', m.id, error.message)
  }
  return old.length
}

export async function demoLogin(codeInput) {
  const cfg = demoConfig()
  if (!cfg.code) throw httpError(404, 'Демо-вход отключён')
  if (!sameCode(String(codeInput ?? '').trim(), cfg.code)) throw httpError(401, 'Неверный код')

  await cleanupDemo(cfg.restaurantId).catch((e) => console.error('demo cleanup:', e.message))

  const email = `demo-${crypto.randomBytes(6).toString('hex')}@${DEMO_EMAIL_DOMAIN}`
  const password = crypto.randomBytes(24).toString('base64url')
  const user = await deps.authAdmin.createUser({ email, password })
  try {
    must(await deps.db.from('trn_members').insert({ auth_user_id: user.id, restaurant_id: cfg.restaurantId, name: DEMO_NAME, email }).select('id').single())
    return await deps.authAdmin.passwordGrant({ email, password })
  } catch (e) {
    // Не вышло — убираем за собой, чтобы не копились «осиротевшие» демо-аккаунты.
    await deps.db.from('trn_members').delete().eq('auth_user_id', user.id)
    await deps.authAdmin.deleteUser(user.id).catch(() => {})
    console.error('demo-login:', e.message)
    throw httpError(502, 'Не удалось войти. Попробуйте ещё раз.')
  }
}
