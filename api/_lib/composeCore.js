// Состав сессии — ЧИСТАЯ логика. Порядок (ТЗ): сначала просроченные карточки
// (самые просроченные первыми), затем новые карточки открытых уровней в пределах
// дневного лимита. Если очередь пуста — «свободная практика» по уже изученным.

export const cardKey = (level, dishId) => `l${level}:${dishId}`

// ready — { 1: [dish], 2: [dish] }; states — строки trn_card_states ({card_key, due_at, level, dish_id});
// openLevels — [1, 2]; newToday — сколько новых карточек уже начато сегодня.
export function composeCards({ ready, states, openLevels, settings, now, newToday }) {
  const known = new Map(states.map((s) => [s.card_key, s]))
  const live = (level, dishId) => openLevels.includes(level) && ready[level]?.some((d) => d.id === dishId)

  const due = states
    .filter((s) => live(s.level, s.dish_id) && new Date(s.due_at) <= now)
    .sort((a, b) => new Date(a.due_at) - new Date(b.due_at))
    .map((s) => ({ cardKey: s.card_key, dishId: s.dish_id, level: s.level, source: 'due' }))

  const limit = settings.session_cards
  const cards = due.slice(0, limit)

  const newSlots = Math.max(0, Math.min(limit - cards.length, settings.new_cards_per_day - newToday))
  const fresh = []
  for (const level of openLevels) {
    for (const d of ready[level] || []) {
      if (!known.has(cardKey(level, d.id))) fresh.push({ cardKey: cardKey(level, d.id), dishId: d.id, level, source: 'new' })
    }
  }
  cards.push(...fresh.slice(0, newSlots))

  if (cards.length > 0) return { kind: 'regular', cards }

  // Нечего повторять и новых нет: свободная практика — ближайшие по сроку изученные карточки.
  const practice = states
    .filter((s) => live(s.level, s.dish_id))
    .sort((a, b) => new Date(a.due_at) - new Date(b.due_at))
    .slice(0, limit)
    .map((s) => ({ cardKey: s.card_key, dishId: s.dish_id, level: s.level, source: 'practice' }))
  return { kind: practice.length ? 'practice' : 'empty', cards: practice }
}

// Сводка для главного экрана: сколько карточек ждут сегодня.
export function todaySummary({ ready, states, openLevels, settings, now, newToday }) {
  const plan = composeCards({ ready, states, openLevels, settings, now, newToday })
  const regular = plan.kind === 'regular'
  const dueCount = regular ? plan.cards.filter((c) => c.source === 'due').length : 0
  const newCount = regular ? plan.cards.filter((c) => c.source === 'new').length : 0
  return {
    kind: plan.kind,
    cards: plan.cards.length,
    due: dueCount,
    fresh: newCount,
    minutes: Math.max(1, Math.round(plan.cards.length * 0.28)),
  }
}
