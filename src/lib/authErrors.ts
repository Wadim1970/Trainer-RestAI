// Ошибки входа по email (Supabase Auth) → ключ русского текста. ЧИСТАЯ функция без
// зависимостей (тесты: node --test src/lib/authErrors.test.ts); сами тексты — в i18n/ru.ts.
// Supabase отдаёт английские сообщения и (в новых версиях) код ошибки; смотрим на код,
// статус и, как запасной путь, на текст сообщения.

export type AuthErrorKey =
  | 'errRateWait' | 'errRateMany' | 'errNotRegistered' | 'errSignupsOff' | 'errEmailInvalid'
  | 'errEmailBlocked' | 'errSendFail' | 'errNetwork' | 'errGeneric' | 'otpWrong'

// send — регистрация (письмо новому пользователю); login — вход (только для уже зарегистрированных);
// verify — проверка введённого кода.
export type AuthContext = 'send' | 'login' | 'verify'

export interface AuthErrorInfo { key: AuthErrorKey; seconds?: number }

interface Like { message?: unknown; code?: unknown; status?: unknown; name?: unknown }

export function classifyAuthError(err: unknown, ctx: AuthContext): AuthErrorInfo {
  const e = (err && typeof err === 'object' ? err : {}) as Like
  const msg = String(e.message ?? '').toLowerCase()
  const code = String(e.code ?? '').toLowerCase()
  const status = Number(e.status)
  const name = String(e.name ?? '')

  // Нет связи с сервером. supabase-js оборачивает в AuthRetryableFetchError и обрыв сети (статуса нет),
  // и любой ответ 5xx (статус есть) — второй случай это не «нет сети», а сбой на сервере.
  const noStatus = !(status >= 100)
  if (/failed to fetch|networkerror|load failed|network request failed/.test(msg) || (name === 'AuthRetryableFetchError' && noStatus)) return { key: 'errNetwork' }

  // Слишком частые запросы: «For security purposes, you can only request this after 59 seconds».
  const wait = /after (\d+) seconds?/.exec(msg)
  if (wait && (status === 429 || /security purposes|rate limit/.test(msg) || code.includes('rate_limit'))) return { key: 'errRateWait', seconds: Number(wait[1]) }
  if (status === 429 || code.includes('rate_limit') || /rate limit|too many/.test(msg)) return { key: 'errRateMany' }

  if (ctx === 'verify') {
    if (code === 'otp_expired' || /expired|invalid|incorrect/.test(msg) || status === 403 || status === 400 || status === 401) return { key: 'otpWrong' }
    return { key: 'errGeneric' }
  }

  // Регистрации по email нет: для входа — «вы не зарегистрированы», для регистрации — отключено на сервере.
  if (code === 'otp_disabled' || code === 'signup_disabled' || code === 'email_provider_disabled' || /signups? not allowed|signup.*disabled|user not found/.test(msg)) {
    return { key: ctx === 'login' ? 'errNotRegistered' : 'errSignupsOff' }
  }
  if (code === 'email_address_invalid' || code === 'validation_failed' || /invalid.*email|email.*invalid|unable to validate email/.test(msg)) return { key: 'errEmailInvalid' }
  if (code === 'email_address_not_authorized' || /not authorized/.test(msg)) return { key: 'errEmailBlocked' }
  if (code === 'unexpected_failure' || (Number.isFinite(status) && status >= 500) || /sending .*email|smtp|mail/.test(msg)) return { key: 'errSendFail' }

  return { key: 'errGeneric' }
}
