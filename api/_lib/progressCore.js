// Прогресс участника — ЧИСТАЯ логика: день по часовому поясу ресторана,
// серия дней, баллы по уровням.

export const DEFAULT_TZ = 'Europe/Moscow'

// Календарный день YYYY-MM-DD момента now в часовом поясе tz.
export function dayIn(now, tz = DEFAULT_TZ) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now))
  } catch {
    return new Date(now).toISOString().slice(0, 10)
  }
}

export function prevDay(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

// Серия дней подряд с занятием. last — последний день занятия (YYYY-MM-DD) или null.
export function nextStreak(last, streak, today) {
  if (last === today) return Math.max(1, streak || 1)
  if (last && last === prevDay(today)) return (streak || 0) + 1
  return 1
}

// Серия, которую показываем на экране: если вчера занятия не было, она уже сгорела.
export function visibleStreak(last, streak, today) {
  if (!last) return 0
  return last === today || last === prevDay(today) ? streak || 0 : 0
}

// Баллы уровня не уходят ниже нуля (иначе открытие следующего уровня «мигало» бы).
export function addPoints(levelPoints, level, delta) {
  const cur = Number(levelPoints?.[level] || 0)
  return { ...(levelPoints || {}), [level]: Math.max(0, cur + delta) }
}

export const totalPoints = (levelPoints) => Object.values(levelPoints || {}).reduce((s, v) => s + Number(v || 0), 0)
