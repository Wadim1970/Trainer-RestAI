import { ru, type Key } from './ru'

// t('key', { name: 'Иван' }) — подстановка {name}.
export function t(key: Key, params?: Record<string, string | number>): string {
  let s: string = ru[key]
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v))
  return s
}

// Русские числительные: plural(5, 'карточка', 'карточки', 'карточек') → 'карточек'.
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return many
  if (b > 1 && b < 5) return few
  if (b === 1) return one
  return many
}

export const cardsWord = (n: number) => plural(n, 'карточка', 'карточки', 'карточек')
export const minutesWord = (n: number) => plural(n, 'минута', 'минуты', 'минут')
export const daysWord = (n: number) => plural(n, 'день', 'дня', 'дней')
export const secondsWord = (n: number) => plural(n, 'секунду', 'секунды', 'секунд')
export const dishesWord = (n: number) => plural(n, 'блюдо', 'блюда', 'блюд')
