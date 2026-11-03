import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Page, Notice } from '../components/Page'
import OtpForm from '../components/OtpForm'
import { supabase } from '../lib/supabase'
import { authMessage } from '../lib/authMessage'
import { classifyAuthError } from '../lib/authErrors'
import { useAuth } from '../lib/auth'
import { t } from '../i18n'

// Вход официанта: email (внесён администратором в список доступа) → код из письма.
export default function LoginScreen() {
  const nav = useNavigate()
  const { refresh } = useAuth()
  const [email, setEmail] = useState('')
  const [step, setStep] = useState<'email' | 'otp'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const send = async () => {
    if (!supabase) return
    const e = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return setError(t('emailInvalid'))
    setBusy(true)
    setError('')
    // shouldCreateUser: false — пользователей заводит сервер, когда администратор вносит почту в список.
    // Если почты нет, Supabase отвечает ошибкой, но человеку мы этого не раскрываем: экран кода открывается
    // одинаково для любой почты (иначе по ответу можно было бы угадывать, кто есть в списке).
    const { error: err } = await supabase.auth.signInWithOtp({ email: e, options: { shouldCreateUser: false } })
    setBusy(false)
    if (err && classifyAuthError(err, 'login').key !== 'errNotRegistered') return setError(authMessage(err, 'login').text)
    setEmail(e)
    setStep('otp')
  }

  return (
    <Page title={t('loginTitle')}>
      {step === 'email' ? (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); void send() }}>
          <p className="muted">{t('loginIntro')}</p>
          <label className="field">
            <span>{t('emailLabel')}</span>
            <input className="input" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" placeholder={t('emailPlaceholder')} value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {error && <Notice kind="error">{error}</Notice>}
          <button className="btn primary" type="submit" disabled={busy}>{t('sendCode')}</button>
          <div className="or"><span>{t('or')}</span></div>
          <Link className="btn secondary" to="/demo">{t('demoLink')}</Link>
        </form>
      ) : (
        <OtpForm email={email} onVerified={async () => { await refresh(); nav('/', { replace: true }) }} onBack={() => setStep('email')} />
      )}
    </Page>
  )
}
