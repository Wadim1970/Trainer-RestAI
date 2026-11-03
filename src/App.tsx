import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { supabase } from './lib/supabase'
import { Loader, Notice, Page } from './components/Page'
import JoinScreen from './screens/JoinScreen'
import LoginScreen from './screens/LoginScreen'
import DemoScreen from './screens/DemoScreen'
import HomeScreen from './screens/HomeScreen'
import LevelsScreen from './screens/LevelsScreen'
import SessionScreen from './screens/SessionScreen'
import NoAccessScreen from './screens/NoAccessScreen'
import { t } from './i18n'

// Закрытая часть: только для вошедших и зарегистрированных в тренажёре.
function RequireMember() {
  const { ready, hasSession, me, noAccess, error, refresh } = useAuth()
  if (!ready) return <Loader />
  if (!hasSession) return <Navigate to="/login" replace />
  if (noAccess) return <NoAccessScreen />
  if (!me) {
    return (
      <Page title={t('appName')} actions={<button className="btn primary" onClick={() => void refresh()}>{t('retry')}</button>}>
        <Notice kind="error">{error || t('serverError')}</Notice>
      </Page>
    )
  }
  return <Outlet />
}

export default function App() {
  if (!supabase) return <Page title={t('appName')}><Notice kind="error">{t('configMissing')}</Notice></Page>
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/join" element={<JoinScreen />} />
          <Route path="/login" element={<LoginScreen />} />
          <Route path="/demo" element={<DemoScreen />} />
          <Route element={<RequireMember />}>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/levels" element={<LevelsScreen />} />
            <Route path="/session" element={<SessionScreen />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
