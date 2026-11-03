// Коды-приглашения и участники — для администратора ресторана.

import { deps, selectAll, must } from './db.js'
import { httpError } from './http.js'
import { generateCode, formatCode, inviteState, DEFAULT_INVITE_DAYS, MAX_INVITES_PER_REQUEST } from './inviteCore.js'
import { totalPoints, visibleStreak, dayIn, DEFAULT_TZ } from './progressCore.js'

// Ссылка для QR. Без TRAINER_PUBLIC_URL ссылки нет: относительный адрес в QR никуда не ведёт,
// поэтому админка в этом случае показывает только код и предупреждение.
export function joinUrl(code) {
  const base = String(process.env.TRAINER_PUBLIC_URL || '').trim().replace(/\/$/, '')
  return /^https?:\/\//.test(base) ? `${base}/join?code=${code}` : null
}

const cleanNote = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) || null

const view = (inv, members, now) => ({
  id: inv.id,
  code: inv.code,
  codeFormatted: formatCode(inv.code),
  joinUrl: joinUrl(inv.code),
  state: inviteState(inv, now),
  note: inv.note || null,
  createdAt: inv.created_at,
  expiresAt: inv.expires_at,
  usedAt: inv.used_at || null,
  usedBy: inv.used_by ? (members.get(inv.used_by) || null) : null,
})

export async function listInvites(restaurantId) {
  const now = deps.now()
  const [invites, members] = await Promise.all([
    selectAll(() => deps.db.from('trn_invites').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false })),
    selectAll(() => deps.db.from('trn_members').select('id, name').eq('restaurant_id', restaurantId)),
  ])
  const names = new Map(members.map((m) => [m.id, m.name]))
  return { invites: invites.map((i) => view(i, names, now)) }
}

// count кодов (по одному на официанта), действуют days дней.
export async function createInvites(restaurantId, { count, days, note, actor }) {
  const n = count === undefined ? 1 : Math.floor(Number(count))
  if (!Number.isFinite(n) || n < 1 || n > MAX_INVITES_PER_REQUEST) throw httpError(400, `Количество кодов — от 1 до ${MAX_INVITES_PER_REQUEST}`)
  const d = days === undefined ? DEFAULT_INVITE_DAYS : Math.floor(Number(days))
  if (!Number.isFinite(d) || d < 1 || d > 90) throw httpError(400, 'Срок действия — от 1 до 90 дней')
  const restaurant = must(await deps.db.from('restaurants').select('id').eq('id', restaurantId).maybeSingle())
  if (!restaurant) throw httpError(404, 'Ресторан не найден')

  const now = deps.now()
  const expires = new Date(now.getTime() + d * 86400_000).toISOString()
  const created = []
  // Код уникален в базе; при редкой коллизии пробуем другой.
  for (let i = 0; i < n; i++) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await deps.db.from('trn_invites')
        .insert({ restaurant_id: restaurantId, code: generateCode(), note: cleanNote(note), created_by: cleanNote(actor), expires_at: expires })
        .select('*').single()
      if (!error) { created.push(data); break }
      if (error.code !== '23505') throw error
    }
  }
  if (created.length < n) throw httpError(500, 'Не удалось создать все коды, попробуйте ещё раз')
  return { invites: created.map((c) => view(c, new Map(), now)) }
}

// Отозвать неиспользованный код.
export async function revokeInvite(restaurantId, id) {
  const rows = must(await deps.db.from('trn_invites').update({ revoked_at: deps.now().toISOString() })
    .eq('id', id).eq('restaurant_id', restaurantId).is('used_at', null).is('revoked_at', null).select('id'))
  if (!rows || rows.length === 0) throw httpError(404, 'Код не найден, уже использован или уже отозван')
  return { ok: true }
}

// Официанты ресторана с прогрессом.
export async function listMembers(restaurantId) {
  const restaurant = must(await deps.db.from('restaurants').select('timezone').eq('id', restaurantId).maybeSingle())
  const today = dayIn(deps.now(), restaurant?.timezone || DEFAULT_TZ)
  const [members, states] = await Promise.all([
    selectAll(() => deps.db.from('trn_members').select('id, name, email, created_at').eq('restaurant_id', restaurantId).order('created_at', { ascending: false })),
    selectAll(() => deps.db.from('trn_member_state').select('*').eq('restaurant_id', restaurantId)),
  ])
  const byId = new Map(states.map((s) => [s.member_id, s]))
  return {
    members: members.map((m) => {
      const s = byId.get(m.id)
      return {
        id: m.id, name: m.name, email: m.email, registeredAt: m.created_at,
        points: totalPoints(s?.level_points), levelPoints: s?.level_points || {},
        streak: visibleStreak(s?.last_active_date || null, s?.streak_days || 0, today),
        lastActive: s?.last_active_date || null,
      }
    }),
  }
}
