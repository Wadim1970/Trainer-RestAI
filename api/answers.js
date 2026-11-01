import { route } from './_lib/http.js'
import { authenticateMember } from './_lib/authService.js'
import { submitAnswers } from './_lib/trainerService.js'

// POST /api/answers {sessionId, answers:[{qid, selected, confident, latencyMs}]}
// Верность и баллы считает сервер. Повторная отправка безопасна.
export default route('answers', {
  POST: async ({ req, body }) => submitAnswers((await authenticateMember(req)).member, body),
})
