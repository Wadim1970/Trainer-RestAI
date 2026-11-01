import type { Scoring } from '../types'

// Предварительный подсчёт баллов на экране (формула та же, что на сервере: api/_lib/exerciseCore.js).
// Итог всё равно считает сервер.
export function previewPoints(correct: boolean, confident: boolean, combo: number, s: Scoring): number {
  const p = s.points
  const base = correct ? (confident ? p.correct_confident : p.correct_unsure) : (confident ? p.wrong_confident : p.wrong_unsure)
  return base > 0 ? Math.round(base * (1 + s.combo_step * Math.min(combo, s.combo_max))) : base
}
