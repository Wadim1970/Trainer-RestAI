import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Notice } from './Page'
import { t } from '../i18n'

// Ввод кода из письма (Supabase Auth, signInWithOtp / verifyOtp).
export default function OtpForm({ email, onVerified, onBack }: { email: string; onVerified: () => Promise<void> | void; onBack: () => void }) {
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [resent, setResent] = useState(false)

  const verify = async () => {
    if (!supabase || busy) return
    setBusy(true)
    setError('')
    const { error: e } = await supabase.auth.verifyOtp({ email, token: token.trim(), type: 'email' })
    if (e) {
      setError(t('otpWrong'))
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
    const { error: e } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
    if (e) setError(e.message)
    else setResent(true)
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
      {resent && !error && <Notice>{t('otpSent', { email })}</Notice>}
      <button className="btn primary" type="submit" disabled={busy || token.length < 6}>{t('otpConfirm')}</button>
      <button className="btn link" type="button" onClick={() => void resend()} disabled={busy}>{t('otpResend')}</button>
      <button className="btn link" type="button" onClick={onBack} disabled={busy}>{t('back')}</button>
    </form>
  )
}
