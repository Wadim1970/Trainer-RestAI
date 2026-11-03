// Доступы официантов к тренажёру — для администратора ресторана.
// Администратор вносит email (одно оплаченное место на один курс); официант входит по email и
// коду из письма. Закрыть доступ может администратор; прогресс остаётся.

import { deps, selectAll, must } from './db.js'
import { httpError } from './http.js'
import { isDemoEmail } from './demoService.js'
import { parseEmailList, MAX_EMAILS_PER_REQUEST } from './enrollmentCore.js'
import { totalPoints, visibleStreak, dayIn, DEFAULT_TZ } from './progressCore.js'

const UNIQUE_VIOLATION = '23505'
const cleanActor = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) || null

// Внести email'ы (текст из поля или массив строк). Возвращает итог по каждой строке.
export async function addEnrollments(restaurantId, { emails, actor }) {
  const entries = parseEmailList(emails)
  if (entries.length === 0) throw httpError(400, 'Укажите хотя бы один email')
  if (entries.length > MAX_EMAILS_PER_REQUEST) throw httpError(400, `За один раз — не больше ${MAX_EMAILS_PER_REQUEST} адресов`)
  const restaurant = must(await deps.db.from('restaurants').select('id').eq('id', restaurantId).maybeSingle())
  if (!restaurant) throw httpError(404, 'Ресторан не найден')

  const results = []
  for (const e of entries) {
    if (e.error) { results.push({ line: e.line, email: null, status: 'invalid', message: 'Не похоже на email' }); continue }
    try {
      const open = must(await deps.db.from('trn_enrollments').select('id, restaurant_id, status').eq('email', e.email).neq('status', 'closed').maybeSingle())
      if (open) {
        results.push(open.restaurant_id === restaurantId
          ? { line: e.line, email: e.email, status: 'exists', message: 'Уже в списке' }
          : { line: e.line, email: e.email, status: 'other_restaurant', message: 'Эта почта уже занята в другом ресторане' })
        continue
      }
      // Пользователь для входа по коду заводится сразу; уже существующий — не ошибка.
      await deps.authAdmin.ensureUser({ email: e.email })
      const { error } = await deps.db.from('trn_enrollments').insert({
        restaurant_id: restaurantId, email: e.email, name: e.name, status: 'invited', created_by: cleanActor(actor),
      })
      if (error) {
        if (error.code === UNIQUE_VIOLATION) { results.push({ line: e.line, email: e.email, status: 'exists', message: 'Уже в списке' }); continue }
        throw error
      }
      results.push({ line: e.line, email: e.email, status: 'added', message: 'Доступ открыт' })
    } catch (err) {
      console.error('enrollments add:', e.email, err.message)
      results.push({ line: e.line, email: e.email, status: 'error', message: 'Не удалось добавить, попробуйте ещё раз' })
    }
  }
  return { results, added: results.filter((r) => r.status === 'added').length }
}

// Закрыть доступ: официант больше не войдёт, прогресс сохраняется.
export async function closeEnrollment(restaurantId, id) {
  const rows = must(await deps.db.from('trn_enrollments')
    .update({ status: 'closed', closed_reason: 'admin', closed_at: deps.now().toISOString() })
    .eq('id', id).eq('restaurant_id', restaurantId).neq('status', 'closed').select('id'))
  if (!rows || rows.length === 0) throw httpError(404, 'Доступ не найден или уже закрыт')
  return { ok: true }
}

// Доступы ресторана с прогрессом. Сначала открытые, затем закрытые.
export async function listEnrollments(restaurantId) {
  const restaurant = must(await deps.db.from('restaurants').select('timezone').eq('id', restaurantId).maybeSingle())
  const today = dayIn(deps.now(), restaurant?.timezone || DEFAULT_TZ)
  const [rows, states] = await Promise.all([
    selectAll(() => deps.db.from('trn_enrollments').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false })),
    selectAll(() => deps.db.from('trn_member_state').select('*').eq('restaurant_id', restaurantId)),
  ])
  const byMember = new Map(states.map((s) => [s.member_id, s]))
  const view = (r) => {
    const s = r.member_id ? byMember.get(r.member_id) : null
    return {
      id: r.id, email: r.email, name: r.name || null, status: r.status, closedReason: r.closed_reason || null,
      createdAt: r.created_at, firstLoginAt: r.first_login_at || null, closedAt: r.closed_at || null,
      points: totalPoints(s?.level_points), levelPoints: s?.level_points || {},
      streak: visibleStreak(s?.last_active_date || null, s?.streak_days || 0, today),
      lastActive: s?.last_active_date || null,
    }
  }
  const list = rows.filter((r) => !isDemoEmail(r.email)).map(view)
  const open = list.filter((r) => r.status !== 'closed')
  return { enrollments: [...open, ...list.filter((r) => r.status === 'closed')], counts: { open: open.length, closed: list.length - open.length } }
}
