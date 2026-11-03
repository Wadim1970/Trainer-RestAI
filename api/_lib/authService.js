// Вход официантов в тренажёр.
//
// Администратор ресторана вносит email официанта (trn_enrollments) — это одно оплаченное место
// на курс. Официант вводит свою почту, получает код из письма (Supabase Auth) и входит.
// Доступ определяет список: почты нет в списке или доступ закрыт — вход закрыт. Участник
// (trn_members) создаётся автоматически при первом входе.

import { deps, must } from './db.js'
import { httpError } from './http.js'
import { isDemoEmail } from './demoService.js'
import { nameFromEmail, pickEnrollment, ACCESS_MESSAGES } from './enrollmentCore.js'

function bearer(req) {
  const h = String(req.headers?.authorization || '')
  const m = h.match(/^Bearer\s+(\S+)$/i)
  return m ? m[1] : null
}

// Пользователь Supabase Auth по токену запроса (без проверки членства).
export async function authenticateUser(req) {
  const jwt = bearer(req)
  if (!jwt) throw httpError(401, 'Войдите в тренажёр')
  const user = await deps.getUser(jwt)
  if (!user) throw httpError(401, 'Сессия истекла — войдите снова')
  return user
}

const MEMBER_COLS = 'id, name, email, restaurant_id, auth_user_id'
const UNIQUE_VIOLATION = '23505'

// Участник тренажёра по токену запроса. Демо-аккаунты (показ ресторанам) в списке не нужны.
// Остальным: открытый доступ в списке обязателен; первый вход создаёт участника и запускает курс.
export async function authenticateMember(req) {
  const user = await authenticateUser(req)
  const email = String(user.email || '').trim().toLowerCase()
  const selectMember = async () => must(await deps.db.from('trn_members').select(MEMBER_COLS).eq('auth_user_id', user.id).maybeSingle())
  let member = await selectMember()

  if (isDemoEmail(email)) {
    if (!member) throw httpError(403, ACCESS_MESSAGES.notListed)
    return { user, member }
  }

  const rows = email ? must(await deps.db.from('trn_enrollments').select('*').eq('email', email).order('created_at', { ascending: false })) : []
  const { open, latest } = pickEnrollment(rows)
  if (!open) throw httpError(403, latest ? ACCESS_MESSAGES.ended : ACCESS_MESSAGES.notListed)
  if (member && member.restaurant_id !== open.restaurant_id) throw httpError(403, ACCESS_MESSAGES.otherRestaurant)

  if (!member) {
    const { data, error } = await deps.db.from('trn_members')
      .insert({ auth_user_id: user.id, restaurant_id: open.restaurant_id, name: open.name || nameFromEmail(email), email })
      .select(MEMBER_COLS).single()
    if (error) {
      // Два запроса подряд при первом входе: второй увидит уже созданного участника.
      if (error.code !== UNIQUE_VIOLATION) throw error
      member = await selectMember()
      if (!member) throw error
    } else member = data
  }

  // Первый вход: доступ становится «идёт курс» и привязывается к участнику.
  if (open.status === 'invited' || open.member_id !== member.id) {
    must(await deps.db.from('trn_enrollments')
      .update({ status: 'active', member_id: member.id, first_login_at: open.first_login_at || deps.now().toISOString() })
      .eq('id', open.id).neq('status', 'closed').select('id'))
  }
  return { user, member }
}
