import { Page } from '../components/Page'
import { useAuth } from '../lib/auth'
import { t } from '../i18n'

export default function NoAccessScreen() {
  const { signOut, noAccessMessage } = useAuth()
  return (
    <Page title={t('noAccessTitle')}>
      <div className="stack">
        <p>{noAccessMessage || t('noAccessText')}</p>
        <button className="btn primary" onClick={() => void signOut()}>{t('signOut')}</button>
      </div>
    </Page>
  )
}
