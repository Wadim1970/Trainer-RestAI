// Общее для функций API: CORS, тело запроса, ошибки, простой лимит попыток.

export function httpError(status, message) {
  const e = new Error(message)
  e.status = status
  return e
}

// Разрешённые источники — TRAINER_CORS_ORIGINS (через запятую); не задано — любые.
// Авторизация идёт заголовком Authorization (не cookie), поэтому CORS не даёт обойти вход.
export function cors(req, res) {
  const allowed = String(process.env.TRAINER_CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)
  const origin = String(req.headers.origin || '')
  res.setHeader('Access-Control-Allow-Origin', allowed.length ? (allowed.includes(origin) ? origin : allowed[0]) : '*')
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token')
  res.setHeader('Access-Control-Max-Age', '86400')
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return true
  }
  return false
}

export function bodyOf(req) {
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body) } catch { return {} }
  }
  return req.body && typeof req.body === 'object' ? req.body : {}
}

export const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim()

// Лимит попыток с одного адреса за окно (в памяти процесса). true — слишком много.
const buckets = new Map()
export function tooMany(key, { limit = 10, windowMs = 10 * 60 * 1000 } = {}, now = Date.now()) {
  const recent = (buckets.get(key) || []).filter((t) => now - t < windowMs)
  recent.push(now)
  buckets.set(key, recent)
  if (buckets.size > 5000) buckets.clear()
  return recent.length > limit
}

// Обёртка функции: handlers — { GET: async ({req, query, body}) => json, POST: … }.
export function route(name, handlers) {
  return async function handler(req, res) {
    if (cors(req, res)) return
    const run = handlers[req.method]
    if (!run) {
      res.status(405).json({ error: 'Метод не поддерживается' })
      return
    }
    try {
      const body = req.method === 'GET' ? {} : bodyOf(req)
      res.status(200).json(await run({ req, query: req.query || {}, body }))
    } catch (err) {
      if (err?.status) {
        res.status(err.status).json({ error: err.message })
        return
      }
      console.error(`${name} failed:`, err)
      res.status(500).json({ error: 'Ошибка сервера, попробуйте ещё раз' })
    }
  }
}
