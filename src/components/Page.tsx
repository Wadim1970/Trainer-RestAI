import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { t } from '../i18n'

export function Loader({ text }: { text?: string }) {
  return (
    <div className="center">
      <div className="spinner" aria-hidden />
      <p className="muted">{text ?? t('loading')}</p>
    </div>
  )
}

// Страница: шапка (назад + заголовок) и контент; нижняя панель действий закреплена внизу.
export function Page({ title, back, children, actions, wide }: { title?: string; back?: string | boolean; children: ReactNode; actions?: ReactNode; wide?: boolean }) {
  const nav = useNavigate()
  return (
    <div className="page">
      {(title || back) && (
        <header className="topbar">
          {back ? <button className="icon-btn" onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))} aria-label={t('back')}>←</button> : <span className="icon-btn ghost" />}
          <h1>{title}</h1>
          <span className="icon-btn ghost" />
        </header>
      )}
      <main className={wide ? 'content wide' : 'content'}>{children}</main>
      {actions && <footer className="actions">{actions}</footer>}
    </div>
  )
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'error' | 'warn'; children: ReactNode }) {
  return <div className={`notice ${kind}`} role={kind === 'error' ? 'alert' : undefined}>{children}</div>
}
