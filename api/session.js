import { route } from './_lib/http.js'
import { authenticateMember } from './_lib/authService.js'
import { createSession } from './_lib/trainerService.js'

// POST /api/session — выдать сессию упражнений (просроченные карточки, затем новые).
export default route('session', {
  POST: async ({ req }) => createSession((await authenticateMember(req)).member),
})
