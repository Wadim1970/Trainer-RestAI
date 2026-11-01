import { Link, useNavigate } from 'react-router-dom'
import { Page, Notice } from '../components/Page'
import { LevelCard } from './LevelsScreen'
import { useAuth } from '../lib/auth'
import { t, cardsWord, minutesWord, daysWord } from '../i18n'

export default function HomeScreen() {
  const nav = useNavigate()
  const { me, stale, signOut } = useAuth()
  if (!me) return null
  const { today } = me
  const hasWork = today.kind !== 'empty' && today.cards > 0
  const noContent = me.levels[0].dishes === 0

  return (
    <Page
      actions={hasWork && !stale ? (
        <button className="btn primary big" onClick={() => nav('/session')}>{today.kind === 'practice' ? t('practiceStart') : t('start')}</button>
      ) : undefined}
    >
      <div className="home-head">
        <div>
          <p className="muted small">{me.restaurant.name}</p>
          <h1 className="hello">{t('hello', { name: me.member.name })}</h1>
        </div>
        <button className="btn link small" onClick={() => void signOut()}>{t('signOut')}</button>
      </div>

      {stale && <Notice kind="warn"><b>{t('offline')}.</b> {t('offlineHint')}</Notice>}

      <section className="card today">
        <p className="eyebrow">{t('todayTitle')}</p>
        {hasWork ? (
          <>
            <p className="big-line">
              {today.kind === 'practice'
                ? t('practiceLine', { cards: today.cards, cardsWord: cardsWord(today.cards) })
                : t('todayLine', { minutes: today.minutes, minutesWord: minutesWord(today.minutes), cards: today.cards, cardsWord: cardsWord(today.cards) })}
            </p>
            {today.kind === 'regular' && <p className="muted small">{today.due > 0 ? `${today.due} на повторение · ` : ''}{today.fresh} новых</p>}
          </>
        ) : noContent ? (
          <>
            <p className="big-line">{t('noContent')}</p>
            <p className="muted small">{t('noContentHint')}</p>
          </>
        ) : (
          <>
            <p className="big-line">{t('allDone')}</p>
            <p className="muted small">{t('allDoneHint')}</p>
          </>
        )}
      </section>

      <div className="stats">
        <div className="stat"><span className="stat-n">{me.streak}</span><span className="muted small">{daysWord(me.streak)} подряд</span></div>
        <div className="stat"><span className="stat-n">{me.points}</span><span className="muted small">{t('points')}</span></div>
      </div>

      <div className="row-between">
        <h2>{t('levels')}</h2>
        <Link className="btn link small" to="/levels">{t('allLevels')}</Link>
      </div>
      {me.levels.filter((l) => l.status !== 'soon').map((l) => <LevelCard key={l.level} info={l} levels={me.levels} compact />)}
    </Page>
  )
}
