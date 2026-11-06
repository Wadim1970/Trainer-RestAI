import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Page, Notice } from '../components/Page'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { t } from '../i18n'

// Демо-код — ровно четыре цифры: на четвёртой вход срабатывает сам, кнопка активна только при четырёх цифрах.
const CODE_LENGTH = 4

interface DemoSession { access_token: string; refresh_token: string }

// Демо-вход для показа: код → настоящая сессия демо-официанта учебного ресторана (без почты).
export default function DemoScreen() {
  const nav = useNavigate()
  const { refresh } = useAuth()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inFlight = useRef(false) // не даёт отправить код дважды (автовход + нажатие кнопки)

  const enter = async (value = code) => {
    if (!supabase || inFlight.current || value.length !== CODE_LENGTH) return
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      const s = await api<DemoSession>('/api/demo-login', { body: { code: value }, auth: false })
      const { error: e } = await supabase.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token })
      if (e) throw new Error(t('errGeneric'))
      await refresh()
      nav('/', { replace: true })
    } catch (e) {
      setError((e as Error).message)
      setCode('') // неверный код: поле очищаем, чтобы сразу ввести заново
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <Page title={t('demoTitle')} back="/login">
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void enter() }}>
        <p className="muted">{t('demoIntro')}</p>
        <label className="field">
          <span>{t('demoCodeLabel')}</span>
          <input className="input otp" inputMode="numeric" autoComplete="off" pattern="[0-9]*" maxLength={CODE_LENGTH} value={code} onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); setCode(v); if (v.length === CODE_LENGTH) void enter(v) }} autoFocus />
        </label>
        {error && <Notice kind="error">{error}</Notice>}
        <button className="btn primary" type="submit" disabled={busy || code.length !== CODE_LENGTH}>{busy ? t('demoEntering') : t('demoEnter')}</button>
        <Link className="btn link" to="/login">{t('back')}</Link>
      </form>
    </Page>
  )
}
