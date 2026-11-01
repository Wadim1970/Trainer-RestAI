import { supabase } from './supabase'
import { t } from '../i18n'

const BASE = ((import.meta.env.VITE_API_URL as string | undefined) || '').replace(/\/$/, '')

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

// Нет связи (сеть, не ответил сервер) — отличаем от ответа с ошибкой.
export class NetworkError extends Error {
  constructor() {
    super(t('serverError'))
  }
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.auth !== false && supabase) {
    const { data } = await supabase.auth.getSession()
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`
  }
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method: opts.method || (opts.body ? 'POST' : 'GET'),
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    })
  } catch {
    throw new NetworkError()
  }
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError((json as { error?: string }).error || t('serverError'), res.status)
  return json as T
}
