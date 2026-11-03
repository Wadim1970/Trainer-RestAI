import { route, tooMany, clientIp, httpError } from './_lib/http.js'
import { demoLogin } from './_lib/demoService.js'

// POST /api/demo-login {code} — демо-вход для показа (учебный ресторан). Нужен TRAINER_DEMO_CODE.
// Ответ — сессия Supabase (access_token, refresh_token): приложение ставит её через setSession.
export default route('demo-login', {
  POST: async ({ req, body }) => {
    if (tooMany(`demo:${clientIp(req)}`, { limit: 10 })) throw httpError(429, 'Слишком много попыток. Попробуйте через 10 минут.')
    return demoLogin(body.code)
  },
})
