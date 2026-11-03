// Доступ к общей БД (Supabase) под service_role. Ключ — только на сервере.
// deps подменяются в тестах.

import { createClient } from '@supabase/supabase-js'

export const deps = {
  db: createClient(
    process.env.SUPABASE_URL || 'http://localhost',
    process.env.SUPABASE_SERVICE_KEY || 'missing-key',
    { auth: { autoRefreshToken: false, persistSession: false } },
  ),
  now: () => new Date(),
  rng: Math.random,
  // Управление пользователями Supabase Auth (service_role): демо-вход и заведение пользователей по списку доступа. В тестах подменяется.
  authAdmin: {
    async createUser({ email, password }) {
      const { data, error } = await deps.db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { demo: true } })
      if (error) throw error
      return { id: data.user.id }
    },
    // Пользователь для входа по коду из письма: подтверждённый, без пароля. Уже есть такая почта
    // (например, это же человек в Waiter-app) — не ошибка: используем существующего.
    async ensureUser({ email }) {
      const { data, error } = await deps.db.auth.admin.createUser({ email, email_confirm: true })
      if (!error) return { id: data.user.id, created: true }
      if (error.code === 'email_exists' || error.status === 422 || /already.*registered|already been registered|email.*exists/i.test(String(error.message))) return { id: null, created: false }
      throw error
    },
    async deleteUser(id) {
      const { error } = await deps.db.auth.admin.deleteUser(id)
      if (error) throw error
    },
    // Настоящая сессия по email+паролю (тот же вход, что у Waiter-app для демо-официанта).
    async passwordGrant({ email, password }) {
      const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '')
      const key = process.env.SUPABASE_SERVICE_KEY || ''
      const res = await fetch(`${base}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(`GoTrue token ${res.status}: ${data?.msg ?? data?.error_description ?? data?.error ?? res.statusText}`)
      return { access_token: data.access_token, refresh_token: data.refresh_token, expires_in: data.expires_in, token_type: data.token_type || 'bearer' }
    },
  },
  // JWT официанта → { id, email } или null. В тестах подменяется.
  async getUser(jwt) {
    const { data, error } = await deps.db.auth.getUser(jwt)
    if (error || !data?.user) return null
    return { id: data.user.id, email: data.user.email || '' }
  },
}

const PAGE = 1000
// PostgREST отдаёт не больше 1000 строк за раз — дочитываем страницами.
export async function selectAll(build) {
  const out = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < PAGE) return out
  }
}

export const must = ({ data, error }) => {
  if (error) throw error
  return data
}
