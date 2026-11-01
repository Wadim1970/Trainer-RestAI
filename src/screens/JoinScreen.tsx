import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Page, Notice } from '../components/Page'
import OtpForm from '../components/OtpForm'
import { api, ApiError } from '../lib/api'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { t } from '../i18n'
import type { JoinCheck } from '../types'

// Регистрация: код-приглашение → имя и email → код из письма → готово.
// Состояние хранится на телефоне: пока человек ходит в почту, приложение может перезагрузиться.
const KEY = 'trainer_join_v1'
type Step = 'code' | 'details' | 'otp'
interface Draft { step: Step; code: string; name: string; email: string; restaurant: string }
const EMPTY: Draft = { step: 'code', code: '', name: '', email: '', restaurant: '' }

function load(): Draft {
  try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return EMPTY }
}
function save(d: Draft) {
  try { localStorage.setItem(KEY, JSON.stringify(d)) } catch { /* ignore */ }
}

const formatInput = (s: string) => {
  const c = s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
  return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c
}

export default function JoinScreen() {
  const nav = useNavigate()
  const { refresh } = useAuth()
  const [params] = useSearchParams()
  const [d, setD] = useState<Draft>(load)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (patch: Partial<Draft>) => setD((prev) => { const next = { ...prev, ...patch }; save(next); return next })

  const check = async (code: string) => {
    setBusy(true)
    setError('')
    try {
      const r = await api<JoinCheck>('/api/join/check', { body: { code }, auth: false })
      set({ code, restaurant: r.restaurant.name, step: 'details' })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // Код из QR (?code=…) подставляется и проверяется сам. Тот же код, что уже в черновике, —
  // продолжаем с того же места; другой код — начинаем заново.
  useEffect(() => {
    const fromLink = params.get('code')
    if (!fromLink) return
    const c = formatInput(fromLink)
    if (c === d.code && d.step !== 'code') return
    const fresh = { ...EMPTY, code: c }
    save(fresh)
    setD(fresh)
    if (c.replace('-', '').length === 8) void check(c)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sendOtp = async () => {
    if (!supabase) return
    const email = d.email.trim().toLowerCase()
    if (!d.name.trim()) return setError(t('nameInvalid'))
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return setError(t('emailInvalid'))
    setBusy(true)
    setError('')
    const { error: e } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
    setBusy(false)
    if (e) return setError(e.message)
    set({ email, step: 'otp' })
  }

  // Вошли по коду из письма → гасим приглашение и создаём официанта.
  const redeem = async () => {
    try {
      await api('/api/join/redeem', { body: { code: d.code, name: d.name } })
    } catch (e) {
      // 409 — уже зарегистрированы: просто входим.
      if (!(e instanceof ApiError && e.status === 409)) {
        if (e instanceof ApiError && e.status === 410) set({ step: 'code' })
        throw e
      }
    }
    save(EMPTY)
    localStorage.removeItem(KEY)
    await refresh()
    nav('/', { replace: true })
  }

  return (
    <Page title={t('joinTitle')}>
      {d.step === 'code' && (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); void check(d.code) }}>
          <p className="muted">{t('joinIntro')}</p>
          <label className="field">
            <span>{t('codeLabel')}</span>
            <input className="input code" autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false}
              placeholder={t('codePlaceholder')} value={d.code} onChange={(e) => set({ code: formatInput(e.target.value) })} />
          </label>
          {error && <Notice kind="error">{error}</Notice>}
          <button className="btn primary" type="submit" disabled={busy || d.code.replace('-', '').length !== 8}>{t('codeCheck')}</button>
          <p className="muted small">{t('noCode')}</p>
          <Link className="btn link" to="/login">{t('haveAccount')}</Link>
        </form>
      )}

      {d.step === 'details' && (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); void sendOtp() }}>
          <Notice>{t('joinRestaurant', { name: d.restaurant })}</Notice>
          <label className="field">
            <span>{t('nameLabel')}</span>
            <input className="input" autoComplete="given-name" placeholder={t('namePlaceholder')} value={d.name} onChange={(e) => set({ name: e.target.value })} />
          </label>
          <label className="field">
            <span>{t('emailLabel')}</span>
            <input className="input" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" placeholder={t('emailPlaceholder')}
              value={d.email} onChange={(e) => set({ email: e.target.value })} />
            <small className="muted">{t('emailHint')}</small>
          </label>
          {error && <Notice kind="error">{error}</Notice>}
          <button className="btn primary" type="submit" disabled={busy}>{t('sendCode')}</button>
          <button className="btn link" type="button" onClick={() => set({ step: 'code' })}>{t('back')}</button>
        </form>
      )}

      {d.step === 'otp' && <OtpForm email={d.email} onVerified={redeem} onBack={() => set({ step: 'details' })} />}
    </Page>
  )
}
