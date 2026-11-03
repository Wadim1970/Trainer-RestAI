import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Page, Notice } from '../components/Page'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { t } from '../i18n'

interface DemoSession { access_token: string; refresh_token: string }

// Демо-вход для показа: код → настоящая сессия демо-официанта учебного ресторана (без почты).
export default function DemoScreen() {
  const nav = useNavigate()
  const { refresh } = useAuth()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const enter = async () => {
    if (!supabase || busy) return
    setBusy(true)
    setError('')
    try {
      const s = await api<DemoSession>('/api/demo-login', { body: { code }, auth: false })
      const { error: e } = await supabase.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token })
      if (e) throw new Error(t('errGeneric'))
      await refresh()
      nav('/', { replace: true })
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Page title={t('demoTitle')} back="/login">
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void enter() }}>
        <p className="muted">{t('demoIntro')}</p>
        <label className="field">
          <span>{t('demoCodeLabel')}</span>
          <input className="input otp" inputMode="numeric" autoComplete="off" pattern="[0-9]*" maxLength={12} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
        </label>
        {error && <Notice kind="error">{error}</Notice>}
        <button className="btn primary" type="submit" disabled={busy || code.length < 3}>{t('demoEnter')}</button>
        <Link className="btn link" to="/login">{t('back')}</Link>
      </form>
    </Page>
  )
}
