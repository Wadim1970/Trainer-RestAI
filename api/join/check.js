import { route, tooMany, clientIp, httpError } from '../_lib/http.js'
import { checkInvite } from '../_lib/authService.js'

// POST /api/join/check {code} — код действителен? Возвращает название ресторана.
export default route('join/check', {
  POST: async ({ req, body }) => {
    if (tooMany(`check:${clientIp(req)}`, { limit: 20 })) throw httpError(429, 'Слишком много попыток. Попробуйте через 10 минут.')
    return checkInvite(body.code)
  },
})
