import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { api, ApiError, NetworkError } from './api'
import { flushOutbox } from './outbox'
import { t } from '../i18n'
import type { Me } from '../types'

const ME_CACHE = 'trainer_me_cache_v1'

interface AuthState {
  ready: boolean
  hasSession: boolean
  me: Me | null
  stale: boolean // показаны сохранённые данные: нет связи
  noAccess: boolean // вошли по email, но доступа нет: почты нет в списке или доступ закрыт
  noAccessMessage: string // причина — текст от сервера
  error: string
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

function readCache(): Me | null {
  try { return JSON.parse(localStorage.getItem(ME_CACHE) || 'null') } catch { return null }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const [me, setMe] = useState<Me | null>(null)
  const [stale, setStale] = useState(false)
  const [noAccess, setNoAccess] = useState(false)
  const [noAccessMessage, setNoAccessMessage] = useState('')
  const [error, setError] = useState('')

  const signOut = useCallback(async () => {
    try { localStorage.removeItem(ME_CACHE) } catch { /* ignore */ }
    setMe(null)
    setNoAccess(false)
    setNoAccessMessage('')
    await supabase?.auth.signOut()
    setHasSession(false)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const data = await api<Me>('/api/me')
      setMe(data)
      setStale(false)
      setNoAccess(false)
      setNoAccessMessage('')
      setError('')
      try { localStorage.setItem(ME_CACHE, JSON.stringify(data)) } catch { /* ignore */ }
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) { setNoAccess(true); setNoAccessMessage(e.message); setMe(null) }
      else if (e instanceof ApiError && e.status === 401) await signOut()
      else if (e instanceof NetworkError) {
        const cached = readCache()
        if (cached) { setMe(cached); setStale(true) } else setError(t('serverError'))
      } else setError((e as Error).message)
    }
  }, [signOut])

  useEffect(() => {
    if (!supabase) { setReady(true); return }
    let alive = true
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setHasSession(!!data.session)
      if (!data.session) setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setHasSession(!!session))
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  // Есть сессия — загружаем данные официанта и досылаем накопившиеся ответы.
  useEffect(() => {
    if (!hasSession) return
    let alive = true
    void (async () => {
      await flushOutbox()
      await refresh()
      if (alive) setReady(true)
    })()
    const onOnline = () => { void flushOutbox().then(refresh) }
    window.addEventListener('online', onOnline)
    return () => { alive = false; window.removeEventListener('online', onOnline) }
  }, [hasSession, refresh])

  const value = useMemo(() => ({ ready, hasSession, me, stale, noAccess, noAccessMessage, error, refresh, signOut }), [ready, hasSession, me, stale, noAccess, noAccessMessage, error, refresh, signOut])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth вне AuthProvider')
  return v
}
