// Доступы официантов: разбор списка email, проверки — ЧИСТАЯ логика.

export const MAX_EMAILS_PER_REQUEST = 100

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export function cleanEmail(email) {
  const s = String(email ?? '').trim().toLowerCase()
  return s.length <= 254 && EMAIL_RE.test(s) ? s : null
}

export function cleanName(name) {
  const s = String(name ?? '').replace(/\s+/g, ' ').trim()
  return s.length >= 1 && s.length <= 80 ? s : null
}

const FIND_EMAIL = /[^\s,;<>()"']+@[^\s,;<>()"']+/

// Текст из поля админки → список { line, email, name, error }.
// Строка: «email» или «email Имя Фамилия» (также «Имя <email>» и «email, Имя»).
// Строки разделяются переводом строки или «;». Повторы одной почты в запросе убираются.
export function parseEmailList(input) {
  const raw = Array.isArray(input) ? input.map(String) : String(input ?? '').split(/[\n\r;]+/)
  const seen = new Set()
  const out = []
  for (const line of raw) {
    const text = line.trim()
    if (!text) continue
    const m = FIND_EMAIL.exec(text)
    const email = m ? cleanEmail(m[0].replace(/[.,]+$/, '')) : null
    if (!email) { out.push({ line: text, email: null, name: null, error: 'invalid' }); continue }
    if (seen.has(email)) continue
    seen.add(email)
    const rest = (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).replace(/[,\-–—<>]+/g, ' ')
    out.push({ line: text, email, name: cleanName(rest), error: null })
  }
  return out
}

// Из почты — имя на случай, если администратор его не указал («ivan.petrov@…» → «Ivan Petrov»).
export function nameFromEmail(email) {
  const local = String(email || '').split('@')[0].replace(/[._\-+0-9]+/g, ' ').trim()
  const words = local.split(' ').filter(Boolean).slice(0, 3)
  const s = words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
  return cleanName(s) || 'Официант'
}

// Среди записей одной почты — открытая (если есть), иначе последняя закрытая.
export function pickEnrollment(rows) {
  const list = [...(rows || [])].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  return { open: list.find((r) => r.status !== 'closed') || null, latest: list[0] || null }
}

export const STATUS_LABELS = { invited: 'Приглашён', active: 'Идёт курс', closed: 'Закрыт' }

export const ACCESS_MESSAGES = {
  notListed: 'Вашей почты нет в списке доступа. Обратитесь к администратору ресторана.',
  ended: 'Доступ к курсу закончился. Чтобы пройти курс снова, обратитесь к администратору ресторана.',
  otherRestaurant: 'Ваш аккаунт привязан к другому ресторану. Обратитесь к администратору.',
}
