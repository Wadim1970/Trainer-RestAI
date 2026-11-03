import { Page } from '../components/Page'
import { useAuth } from '../lib/auth'
import { t, dishesWord } from '../i18n'
import type { LevelInfo } from '../types'

const NAME = { names: 'level1', ingredients: 'level2', chef: 'level3' } as const
const DESC = { names: 'level1Desc', ingredients: 'level2Desc', chef: 'level3Desc' } as const

export function LevelCard({ info, levels, compact }: { info: LevelInfo; levels: LevelInfo[]; compact?: boolean }) {
  const prev = levels.find((l) => l.level === info.level - 1)
  const locked = info.status === 'locked'
  const pct = info.need > 0 && info.prevPoints != null ? Math.min(100, Math.round((info.prevPoints / info.need) * 100)) : 100
  const badge = { open: t('levelOpen'), locked: t('levelLocked'), empty: t('levelEmpty'), soon: t('levelSoon') }[info.status]
  return (
    <section className={`card level ${info.status}`}>
      <div className="level-num" aria-hidden>{locked ? '🔒' : info.level}</div>
      <div className="level-body">
        <div className="row-between">
          <h3>{t(NAME[info.title])}</h3>
          <span className={`badge ${info.status}`}>{badge}</span>
        </div>
        {!compact && <p className="muted small">{t(DESC[info.title])}</p>}
        {info.status === 'open' && <p className="muted small">{t('levelDishes', { n: info.dishes, dishesWord: dishesWord(info.dishes) })}</p>}
        {locked && prev && (
          <>
            <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
            <p className="muted small">{t('levelUnlockHint', { need: info.need, prev: t(NAME[prev.title]), have: info.prevPoints ?? 0 })}</p>
          </>
        )}
      </div>
    </section>
  )
}

export default function LevelsScreen() {
  const { me } = useAuth()
  if (!me) return null
  return (
    <Page title={t('levels')} back="/">
      {me.levels.map((l) => <LevelCard key={l.level} info={l} levels={me.levels} />)}
      <section className="card level soon">
        <div className="level-num" aria-hidden>4</div>
        <div className="level-body">
          <div className="row-between"><h3>{t('soonService')}</h3><span className="badge soon">{t('levelSoon')}</span></div>
          <p className="muted small">{t('soonServiceDesc')}</p>
        </div>
      </section>
      <section className="card level soon">
        <div className="level-num" aria-hidden>🎙</div>
        <div className="level-body">
          <div className="row-between"><h3>{t('soonVoice')}</h3><span className="badge soon">{t('levelSoon')}</span></div>
          <p className="muted small">{t('soonVoiceDesc')}</p>
        </div>
      </section>
    </Page>
  )
}
