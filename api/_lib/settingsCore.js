// Настройки тренажёра ресторана. Все пороги, веса и лимиты — настройки, а не
// константы в коде (правило ТЗ №7): значения ниже — только умолчания, их
// переопределяет строка trn_settings ресторана (jsonb `value`).

export const DEFAULT_SETTINGS = Object.freeze({
  // Сколько баллов набрать на уровне N-1, чтобы открыть уровень N.
  unlock_points: { 2: 50, 3: 80 },
  new_cards_per_day: 20,
  session_cards: 25,
  // Быстрее этого времени уверенный верный ответ получает рейтинг Easy.
  fast_ms: 6000,
  // Сколько вариантов в сетке «Найди своё».
  grid_size: 12,
  // Баллы: верно/неверно × уверен/не уверен.
  points: { correct_confident: 2, correct_unsure: 1, wrong_confident: -2, wrong_unsure: 0 },
  // Комбо: за каждый верный подряд ответ множитель растёт на combo_step до combo_max шагов.
  combo_step: 0.1,
  combo_max: 5,
})

const int = (v, def, min, max) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def
}
const num = (v, def, min, max) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def
}

// raw — то, что лежит в trn_settings.value (любой мусор безопасен).
export function mergeSettings(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const d = DEFAULT_SETTINGS
  const p = r.points && typeof r.points === 'object' ? r.points : {}
  const u = r.unlock_points && typeof r.unlock_points === 'object' ? r.unlock_points : {}
  return {
    unlock_points: { 2: int(u[2], d.unlock_points[2], 0, 100000), 3: int(u[3], d.unlock_points[3], 0, 100000) },
    new_cards_per_day: int(r.new_cards_per_day, d.new_cards_per_day, 1, 200),
    session_cards: int(r.session_cards, d.session_cards, 5, 60),
    fast_ms: int(r.fast_ms, d.fast_ms, 1000, 60000),
    grid_size: int(r.grid_size, d.grid_size, 6, 20),
    points: {
      correct_confident: int(p.correct_confident, d.points.correct_confident, 0, 100),
      correct_unsure: int(p.correct_unsure, d.points.correct_unsure, 0, 100),
      wrong_confident: int(p.wrong_confident, d.points.wrong_confident, -100, 0),
      wrong_unsure: int(p.wrong_unsure, d.points.wrong_unsure, -100, 0),
    },
    combo_step: num(r.combo_step, d.combo_step, 0, 1),
    combo_max: int(r.combo_max, d.combo_max, 0, 20),
  }
}
