// Вход и регистрация участников тренажёра.
//
// Поток: администратор ресторана выдаёт код (QR) → официант открывает ссылку,
// вводит имя и email → получает код из письма (Supabase Auth, signInWithOtp) →
// вводит его → приложение получает сессию → отправляет код-приглашение сюда
// (redeemInvite). Только после этого появляется участник (trn_members).
// Дальше вход — по email и коду из письма; доступ определяет trn_members.

import { deps, must } from './db.js'
import { httpError } from './http.js'
import { normalizeCode, inviteState, INVITE_MESSAGES, cleanName } from './inviteCore.js'

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

// Участник тренажёра по токену запроса.
export async function authenticateMember(req) {
  const user = await authenticateUser(req)
  const member = must(await deps.db.from('trn_members').select('id, name, email, restaurant_id, auth_user_id').eq('auth_user_id', user.id).maybeSingle())
  if (!member) throw httpError(403, 'У вас нет доступа к тренажёру. Получите код-приглашение у администратора ресторана.')
  return { user, member }
}

// Проверка кода ДО регистрации: показываем название ресторана, ничего не расходуя.
export async function checkInvite(codeInput) {
  const code = normalizeCode(codeInput)
  if (!code) throw httpError(400, 'Код состоит из 8 символов, например K7M2-QX9P')
  const invite = must(await deps.db.from('trn_invites').select('id, restaurant_id, expires_at, used_at, revoked_at, kind').eq('code', code).maybeSingle())
  const state = inviteState(invite, deps.now())
  if (state !== 'ok') throw httpError(state === 'missing' ? 404 : 410, INVITE_MESSAGES[state])
  const restaurant = must(await deps.db.from('restaurants').select('id, name').eq('id', invite.restaurant_id).maybeSingle())
  return { restaurant: { id: invite.restaurant_id, name: restaurant?.name || 'Ресторан' }, kind: invite.kind }
}

// Погасить код и создать участника для вошедшего (по email) пользователя.
export async function redeemInvite(user, { code: codeInput, name: nameInput }) {
  const code = normalizeCode(codeInput)
  if (!code) throw httpError(400, 'Код состоит из 8 символов, например K7M2-QX9P')
  const name = cleanName(nameInput)
  if (!name) throw httpError(400, 'Укажите имя')
  if (!user.email) throw httpError(400, 'Для регистрации нужен email')

  const existing = must(await deps.db.from('trn_members').select('id').eq('auth_user_id', user.id).maybeSingle())
  if (existing) throw httpError(409, 'Вы уже зарегистрированы. Просто войдите по email.')

  const now = deps.now()
  const invite = must(await deps.db.from('trn_invites').select('id, restaurant_id, expires_at, used_at, revoked_at').eq('code', code).maybeSingle())
  const state = inviteState(invite, now)
  if (state !== 'ok') throw httpError(state === 'missing' ? 404 : 410, INVITE_MESSAGES[state])

  // Атомарно «занимаем» код: условие в самом UPDATE, поэтому два одновременных
  // запроса с одним кодом не пройдут оба.
  const claimed = must(await deps.db.from('trn_invites')
    .update({ used_at: now.toISOString() })
    .eq('id', invite.id).is('used_at', null).is('revoked_at', null).gt('expires_at', now.toISOString())
    .select('id'))
  if (!claimed || claimed.length === 0) throw httpError(410, INVITE_MESSAGES.used)

  const { data: member, error } = await deps.db.from('trn_members')
    .insert({ auth_user_id: user.id, restaurant_id: invite.restaurant_id, invite_id: invite.id, name, email: user.email.toLowerCase() })
    .select('id, name, email, restaurant_id').single()
  if (error) {
    // Участника не создали — возвращаем код, чтобы место не пропало.
    await deps.db.from('trn_invites').update({ used_at: null }).eq('id', invite.id)
    throw error
  }
  await deps.db.from('trn_invites').update({ used_by: member.id }).eq('id', invite.id)
  return { member: { id: member.id, name: member.name, restaurantId: member.restaurant_id } }
}
