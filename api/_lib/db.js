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
