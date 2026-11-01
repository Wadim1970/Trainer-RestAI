// Коды-приглашения: генерация, нормализация ввода, проверка состояния.
// Код — 8 символов без похожих (нет 0/O/1/I): K7M2-QX9P. Алфавит 32 символа
// → ~1,1·10¹² вариантов; вместе с лимитом попыток подобрать код нельзя.

import crypto from 'node:crypto'

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 8
export const DEFAULT_INVITE_DAYS = 7
export const MAX_INVITES_PER_REQUEST = 100

export function generateCode(randomInt = crypto.randomInt) {
  let s = ''
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return s
}

// Из того, что ввёл или отсканировал человек, → код из 8 символов или null.
export function normalizeCode(input) {
  const s = String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (s.length !== CODE_LENGTH) return null
  return [...s].every((c) => CODE_ALPHABET.includes(c)) ? s : null
}

export const formatCode = (code) => `${code.slice(0, 4)}-${code.slice(4)}`

// ok | missing | used | revoked | expired
export function inviteState(invite, now) {
  if (!invite) return 'missing'
  if (invite.revoked_at) return 'revoked'
  if (invite.used_at) return 'used'
  if (new Date(invite.expires_at) <= now) return 'expired'
  return 'ok'
}

export const INVITE_MESSAGES = {
  missing: 'Код не найден. Проверьте код или попросите новый у администратора.',
  used: 'Этот код уже использован. Попросите у администратора новый.',
  revoked: 'Этот код отозван. Попросите у администратора новый.',
  expired: 'Срок действия кода истёк. Попросите у администратора новый.',
}

export function cleanName(name) {
  const s = String(name ?? '').replace(/\s+/g, ' ').trim()
  return s.length >= 1 && s.length <= 80 ? s : null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export function cleanEmail(email) {
  const s = String(email ?? '').trim().toLowerCase()
  return s.length <= 254 && EMAIL_RE.test(s) ? s : null
}
