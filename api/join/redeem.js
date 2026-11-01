import { route, tooMany, clientIp, httpError } from '../_lib/http.js'
import { authenticateUser, redeemInvite } from '../_lib/authService.js'

// POST /api/join/redeem {code, name} + Authorization: Bearer <сессия после входа по email>
// Гасит код-приглашение и создаёт официанта в тренажёре.
export default route('join/redeem', {
  POST: async ({ req, body }) => {
    if (tooMany(`redeem:${clientIp(req)}`, { limit: 10 })) throw httpError(429, 'Слишком много попыток. Попробуйте через 10 минут.')
    return redeemInvite(await authenticateUser(req), body)
  },
})
