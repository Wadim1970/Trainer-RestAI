import { Link } from 'react-router-dom'
import { Page } from '../components/Page'
import { useAuth } from '../lib/auth'
import { t } from '../i18n'

export default function NoAccessScreen() {
  const { signOut } = useAuth()
  return (
    <Page title={t('noAccessTitle')}>
      <div className="stack">
        <p>{t('noAccessText')}</p>
        <Link className="btn primary" to="/join" onClick={() => void signOut()}>{t('toJoin')}</Link>
        <button className="btn link" onClick={() => void signOut()}>{t('signOut')}</button>
      </div>
    </Page>
  )
}
