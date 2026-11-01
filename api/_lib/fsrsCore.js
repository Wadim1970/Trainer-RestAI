// Интервальное повторение: обёртка над ts-fsrs. Рейтинг выводится автоматически
// (официант себя не оценивает): неверно → Again; верно, но «не уверен» → Hard;
// верно и уверен → Good; верно, уверен и быстро → Easy.

import { fsrs, createEmptyCard, Rating } from 'ts-fsrs'

const scheduler = fsrs()

export function ratingFor({ correct, confident, latencyMs }, fastMs) {
  if (!correct) return Rating.Again
  if (!confident) return Rating.Hard
  return Number.isFinite(latencyMs) && latencyMs >= 0 && latencyMs < fastMs ? Rating.Easy : Rating.Good
}

// Карточка из jsonb (даты приходят строками).
function revive(json) {
  const c = { ...json, due: new Date(json.due) }
  if (json.last_review) c.last_review = new Date(json.last_review)
  return c
}

// state — jsonb прежнего состояния или null (новая карточка).
// Возвращает { fsrs: jsonb, due_at: ISO, reps, lapses, rating }.
export function review(state, rating, now) {
  const card = state ? revive(state) : createEmptyCard(now)
  const { card: next } = scheduler.next(card, now, rating)
  return { fsrs: JSON.parse(JSON.stringify(next)), due_at: next.due.toISOString(), reps: next.reps, lapses: next.lapses, rating }
}
