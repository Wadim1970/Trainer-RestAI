import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page, Loader, Notice } from '../components/Page'
import { api, NetworkError } from '../lib/api'
import { enqueue } from '../lib/outbox'
import { previewPoints } from '../lib/scoring'
import { useAuth } from '../lib/auth'
import { t } from '../i18n'
import type { AnswerInput, AnswersResponse, Question, SessionResponse, Scoring } from '../types'

type Phase =
  | { name: 'loading' }
  | { name: 'error'; message: string }
  | { name: 'empty'; reason?: string }
  | { name: 'run'; session: SessionResponse & { sessionId: string } }
  | { name: 'saving' }
  | { name: 'done'; result: AnswersResponse | null; offline: boolean; local: { correct: number; total: number } }

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))

export default function SessionScreen() {
  const nav = useNavigate()
  const { me, refresh } = useAuth()
  const [phase, setPhase] = useState<Phase>({ name: 'loading' })

  const load = useCallback(async () => {
    setPhase({ name: 'loading' })
    try {
      const s = await api<SessionResponse>('/api/session', { method: 'POST', body: {} })
      if (s.kind === 'empty' || !s.sessionId || s.questions.length === 0) setPhase({ name: 'empty', reason: s.reason })
      else setPhase({ name: 'run', session: s as SessionResponse & { sessionId: string } })
    } catch (e) {
      setPhase({ name: 'error', message: e instanceof NetworkError ? t('offlineHint') : (e as Error).message })
    }
  }, [])

  // Сессию выдаём один раз за открытие экрана (React в режиме разработки запускает эффект дважды —
  // без защиты на сервере создавались бы две сессии, а карточки засчитывались бы по неверной).
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    void load()
  }, [load])

  const submit = async (sessionId: string, answers: AnswerInput[], correct: number, total: number) => {
    setPhase({ name: 'saving' })
    try {
      const result = await api<AnswersResponse>('/api/answers', { body: { sessionId, answers } })
      setPhase({ name: 'done', result, offline: false, local: { correct, total } })
      void refresh()
    } catch (e) {
      if (e instanceof NetworkError) {
        enqueue(sessionId, answers)
        setPhase({ name: 'done', result: null, offline: true, local: { correct, total } })
      } else setPhase({ name: 'error', message: (e as Error).message })
    }
  }

  if (phase.name === 'loading' || phase.name === 'saving') return <Page><Loader text={phase.name === 'saving' ? t('submitting') : undefined} /></Page>
  if (phase.name === 'error') {
    return (
      <Page title={t('appName')} back="/" actions={<button className="btn primary" onClick={() => void load()}>{t('retry')}</button>}>
        <Notice kind="error">{phase.message}</Notice>
      </Page>
    )
  }
  if (phase.name === 'empty') {
    return (
      <Page title={t('sessionEmpty')} back="/" actions={<button className="btn primary" onClick={() => nav('/', { replace: true })}>{t('resultHome')}</button>}>
        <p>{phase.reason === 'no_content' ? t('noContentHint') : t('allDoneHint')}</p>
      </Page>
    )
  }
  if (phase.name === 'done') {
    const r = phase.result
    const unlocked = r && me ? r.levels.filter((l) => r.unlocked.includes(l.level)) : []
    return (
      <Page title={t('resultTitle')} actions={(
        <>
          <button className="btn primary" onClick={() => void load()}>{t('resultMore')}</button>
          <button className="btn link" onClick={() => nav('/', { replace: true })}>{t('resultHome')}</button>
        </>
      )}>
        <section className="card result">
          <p className="big-n">{phase.local.correct}<span className="muted">/{phase.local.total}</span></p>
          <p>{t('resultCorrect', { a: phase.local.correct, b: phase.local.total })}</p>
          {r && <p className="points">{r.totals.points >= 0 ? t('plus', { n: r.totals.points }) : t('minus', { n: Math.abs(r.totals.points) })} · {t('resultTotal', { n: r.points })}</p>}
        </section>
        {phase.offline && <Notice kind="warn">{t('savedOffline')}</Notice>}
        {unlocked.map((l) => <Notice key={l.level}>🎉 {t('resultUnlocked', { name: l.title === 'ingredients' ? t('level2') : t('level3') })}</Notice>)}
        {r && r.weak.length > 0 && (
          <section className="card">
            <h3>{t('resultWeak')}</h3>
            <ul className="weak">{r.weak.map((w) => <li key={w.dishId}>{w.name}</li>)}</ul>
          </section>
        )}
      </Page>
    )
  }
  return <Run session={phase.session} onFinish={submit} onExit={() => nav('/', { replace: true })} />
}

function Run({ session, onFinish, onExit }: {
  session: SessionResponse & { sessionId: string }
  onFinish: (sessionId: string, answers: AnswerInput[], correct: number, total: number) => Promise<void>
  onExit: () => void
}) {
  const questions = session.questions
  const scoring = session.scoring as Scoring
  const [i, setI] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [confident, setConfident] = useState(true)
  const [checked, setChecked] = useState(false)
  const [answers, setAnswers] = useState<AnswerInput[]>([])
  const [correctCount, setCorrectCount] = useState(0)
  const [combo, setCombo] = useState(0)
  const [pts, setPts] = useState<number | null>(null)
  const [confirmExit, setConfirmExit] = useState(false)
  const shownAt = useRef(Date.now())
  const q: Question = questions[i]
  const last = i === questions.length - 1
  const ok = checked && sameSet(selected, q.answer)

  useEffect(() => { shownAt.current = Date.now() }, [i])

  const toggle = (id: string) => {
    if (checked) return
    setSelected((cur) => (q.multi ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : [id]))
  }

  const check = () => {
    const correct = sameSet(selected, q.answer)
    const a: AnswerInput = { qid: q.qid, selected, confident, latencyMs: Date.now() - shownAt.current }
    setAnswers((cur) => [...cur, a])
    setPts(scoring ? previewPoints(correct, confident, combo, scoring) : null)
    setCombo(correct ? combo + 1 : 0)
    if (correct) setCorrectCount((n) => n + 1)
    setChecked(true)
  }

  const next = () => {
    if (last) { void onFinish(session.sessionId, answers, correctCount, questions.length); return }
    setI(i + 1)
    setSelected([])
    setConfident(true)
    setChecked(false)
    setPts(null)
  }

  const exit = async () => {
    // Уже данные ответы не теряем: отправляем (или кладём в очередь).
    if (answers.length > 0) {
      try { await api('/api/answers', { body: { sessionId: session.sessionId, answers } }) } catch (e) { if (e instanceof NetworkError) enqueue(session.sessionId, answers) }
    }
    onExit()
  }

  const labelOf = (id: string) => q.options.find((o) => o.id === id)?.label ?? ''
  const missed = q.answer.filter((id) => !selected.includes(id))
  const extra = selected.filter((id) => !q.answer.includes(id))
  const title = q.kind === 'menu_grid' ? t('kind_menu_grid')
    : q.kind === 'which_section' ? t('kind_which_section', { dishName: q.subject.dishName || '' })
      : q.kind === 'build_dish' ? t('kind_build_dish', { dishName: q.subject.dishName || '' })
        : q.kind === 'odd_one' ? t('kind_odd_one', { dishName: q.subject.dishName || '' })
          : q.kind === 'wine_grape' ? t('kind_wine_grape', { dishName: q.subject.dishName || '' })
            : q.kind === 'wine_vintage' ? t('kind_wine_vintage', { dishName: q.subject.dishName || '' })
              : q.kind === 'guess_wine' ? t('kind_guess_wine')
                : t('kind_guess_dish')
  const sub = q.kind === 'menu_grid' ? t('kind_menu_grid_sub', { section: q.subject.section || '' })
    : q.kind === 'build_dish' ? t('kind_build_dish_sub') : q.kind === 'guess_dish' ? t('kind_guess_dish_sub') : q.kind === 'guess_wine' ? t('kind_guess_wine_sub') : q.multi ? t('mark') : ''

  return (
    <div className="page session">
      <header className="topbar">
        <button className="icon-btn" onClick={() => setConfirmExit(true)} aria-label={t('exit')}>✕</button>
        <div className="progress-wrap">
          <div className="bar" role="progressbar" aria-valuenow={i + (checked ? 1 : 0)} aria-valuemin={0} aria-valuemax={questions.length}>
            <i style={{ width: `${((i + (checked ? 1 : 0)) / questions.length) * 100}%` }} />
          </div>
          <span className="muted small">{t('question', { i: i + 1, n: questions.length })}</span>
        </div>
        <span className="icon-btn ghost" />
      </header>

      <main className="content question">
        <h2 className="q-title">{title}</h2>
        {sub && <p className="muted">{sub}</p>}
        {q.kind === 'guess_dish' && (
          <div className="chips ing">{(q.subject.ingredients || []).map((x) => <span key={x} className="chip static">{x}</span>)}</div>
        )}
        {q.kind === 'guess_wine' && (
          <div className="chips ing">{(q.subject.grapes || []).map((x) => <span key={x} className="chip static">{x}</span>)}</div>
        )}

        <div className={q.kind === 'menu_grid' ? 'options grid' : q.kind === 'build_dish' || q.kind === 'wine_grape' ? 'options chips' : 'options'} role={q.multi ? 'group' : 'radiogroup'}>
          {q.options.map((o) => {
            const isSel = selected.includes(o.id)
            const right = q.answer.includes(o.id)
            const cls = ['opt', isSel ? 'sel' : '', checked && right ? 'ok' : '', checked && isSel && !right ? 'bad' : ''].filter(Boolean).join(' ')
            return (
              <button key={o.id} className={cls} onClick={() => toggle(o.id)} aria-pressed={isSel} disabled={checked && !isSel && !right}>
                {q.multi && <span className="box" aria-hidden>{isSel ? '✓' : ''}</span>}
                <span>{o.label}</span>
              </button>
            )
          })}
        </div>

        {!checked && (
          <div className="confidence" role="group" aria-label={t('confidenceHint')}>
            <button className={confident ? 'seg on' : 'seg'} onClick={() => setConfident(true)}>{t('confident')}</button>
            <button className={!confident ? 'seg on' : 'seg'} onClick={() => setConfident(false)}>{t('unsure')}</button>
          </div>
        )}

        {checked && (
          <div className={ok ? 'feedback ok' : 'feedback bad'} role="status">
            <b>{ok ? t('right') : t('wrong')}</b>
            {pts !== null && <span className="pts">{pts >= 0 ? t('plus', { n: pts }) : t('minus', { n: Math.abs(pts) })}</span>}
            {!ok && !q.multi && <p>{t('correctWas', { answer: labelOf(q.answer[0]) })}</p>}
            {!ok && q.multi && (
              <>
                {missed.length > 0 && <p>{t('missedHint', { items: missed.map(labelOf).join(', ') })}</p>}
                {extra.length > 0 && <p>{t('extraHint', { items: extra.map(labelOf).join(', ') })}</p>}
              </>
            )}
          </div>
        )}
      </main>

      <footer className="actions">
        {!checked
          ? <button className="btn primary big" onClick={check} disabled={selected.length === 0}>{t('check')}</button>
          : <button className="btn primary big" onClick={next}>{last ? t('finish') : t('next')}</button>}
      </footer>

      {confirmExit && (
        <div className="modal-back" role="dialog" aria-modal="true">
          <div className="modal">
            <p>{t('exitConfirm')}</p>
            <button className="btn primary" onClick={() => void exit()}>{t('exit')}</button>
            <button className="btn link" onClick={() => setConfirmExit(false)}>{t('cancel')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
