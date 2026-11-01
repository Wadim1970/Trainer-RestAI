import { route } from './_lib/http.js'
import { authenticateMember } from './_lib/authService.js'
import { getMe } from './_lib/trainerService.js'

// GET /api/me — главный экран официанта: баллы, серия, карта уровней, план на сегодня.
export default route('me', {
  GET: async ({ req }) => getMe((await authenticateMember(req)).member),
})
