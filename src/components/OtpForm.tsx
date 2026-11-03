import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Notice } from './Page'
import { authMessage } from '../lib/authMessage'
import { classifyAuthError } from '../lib/authErrors'
import { t } from '../i18n'

// Пауза между повторными запросами кода (Supabase всё равно не даст чаще, чем раз в минуту).
const RESEND_SECONDS = 60

// Ввод кода из письма (Supabase Auth, signInWithOtp / verifyOtp).
export default function OtpForm({ email, onVerified, onBack }: { email: string; onVerified: () => Promise<void> | void; onBack: () => void }) {
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [resent, setResent] = useState(false)
  const [wait, setWait] = useState(RESEND_SECONDS) // код только что отправлен — сразу повторять рано

  useEffect(() => {
    if (wait <= 0) return
    const id = setTimeout(() => setWait((n) => n - 1), 1000)
    return () => clearTimeout(id)
  }, [wait])

  const verify = async () => {
    if (!supabase || busy) return
    setBusy(true)
    setError('')
    const { error: e } = await supabase.auth.verifyOtp({ email, token: token.trim(), type: 'email' })
    if (e) {
      setError(authMessage(e, 'verify').text)
      setBusy(false)
      return
    }
    try {
      await onVerified()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  const resend = async () => {
    if (!supabase) return
    setError('')
    const { error: e } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
    if (e && classifyAuthError(e, 'login').key !== 'errNotRegistered') {
      const m = authMessage(e, 'login')
      setError(m.text)
      if (m.seconds) setWait(m.seconds)
    } else {
      setResent(true)
      setWait(RESEND_SECONDS)
    }
  }

  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); void verify() }}>
      <h2>{t('otpTitle')}</h2>
      <p className="muted">{t('otpSent', { email })}</p>
      <label className="field">
        <span>{t('otpLabel')}</span>
        <input
          className="input otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={10}
          value={token} onChange={(e) => setToken(e.target.value.replace(/\D/g, ''))} autoFocus
        />
      </label>
      {error && <Notice kind="error">{error}</Notice>}
      {resent && !error && <Notice>{t('otpResent', { email })}</Notice>}
      <button className="btn primary" type="submit" disabled={busy || token.length < 6}>{t('otpConfirm')}</button>
      <button className="btn link" type="button" onClick={() => void resend()} disabled={busy || wait > 0}>{wait > 0 ? t('otpResendIn', { n: wait }) : t('otpResend')}</button>
      <button className="btn link" type="button" onClick={onBack} disabled={busy}>{t('back')}</button>
    </form>
  )
}
