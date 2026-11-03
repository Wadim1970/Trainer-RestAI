import { t, secondsWord } from '../i18n'
import { classifyAuthError, type AuthContext } from './authErrors'

export interface AuthMessage { text: string; seconds?: number }

// Ошибка Supabase Auth → русский текст для экрана (+ сколько секунд ждать, если Supabase это сообщил).
export function authMessage(err: unknown, ctx: AuthContext): AuthMessage {
  const { key, seconds } = classifyAuthError(err, ctx)
  if (key === 'errRateWait' && seconds != null) return { text: t(key, { n: seconds, secWord: secondsWord(seconds) }), seconds }
  return { text: t(key, {}) }
}
