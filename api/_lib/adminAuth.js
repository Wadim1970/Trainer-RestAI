// Доступ администратора ресторана к выдаче кодов-приглашений.
//
// ТЕСТОВЫЙ РЕЖИМ (как у админки Waiter-app): входа в кабинет пока нет, поэтому
// учебный ресторан «Сыроварня» открыт без токена, а любой другой ресторан — только
// с общим токеном ADMIN_TOKEN в заголовке X-Admin-Token. Когда появится вход для
// администраторов, эту проверку заменит проверка их сессии.
// ВАЖНО: общий токен не должен уходить в браузер администратора ресторана.

import crypto from 'node:crypto'
import { httpError } from './http.js'

const DEMO_RESTAURANT_ID = 'dd89773c-0952-4fd1-9510-514094a928ee'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isUuid = (s) => UUID_RE.test(String(s || ''))

function openRestaurants() {
  const raw = process.env.TRAINER_ADMIN_OPEN_RESTAURANTS ?? DEMO_RESTAURANT_ID
  return new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))
}

function hasToken(req) {
  const expected = process.env.ADMIN_TOKEN || ''
  const got = String(req.headers['x-admin-token'] || '')
  return !!expected && got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected))
}

export function assertAdmin(req, restaurantId) {
  if (!isUuid(restaurantId)) throw httpError(400, 'restaurantId обязателен')
  if (openRestaurants().has(String(restaurantId).toLowerCase()) || hasToken(req)) return restaurantId
  throw httpError(401, 'Нет доступа к кабинету этого ресторана')
}
