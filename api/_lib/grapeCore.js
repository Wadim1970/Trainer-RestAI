// Сорта винограда: в меню один сорт записан по-разному («Merlot», «Мерло», «Каберне Совиньон»,
// «Каберне-совиньон»). Словарь приводит названия к одному русскому виду, чтобы в вопросах
// «Какие сорта в вине?» не было двух вариантов одного и того же сорта (иначе ответ нельзя проверить).
// Неизвестный сорт остаётся как написан в меню (в нормальном регистре) — вопрос от этого не страдает.

import { norm } from './distractorCore.js'

// [русское название, ...другие написания]
const GRAPES = [
  ['Каберне Совиньон', 'cabernet sauvignon', 'каберне совиньен', 'каберне совиньйон', 'каберне савиньон'],
  ['Мерло', 'merlot'],
  ['Каберне Фран', 'cabernet franc', 'каберне фран'],
  ['Пти Вердо', 'petit verdot', 'пти вердот'],
  ['Пино Нуар', 'pinot noir', 'пино нуар', 'шпетбургундер'],
  ['Сира', 'syrah', 'shiraz', 'шираз', 'сира'],
  ['Мальбек', 'malbec'],
  ['Темпранильо', 'tempranillo'],
  ['Санджовезе', 'sangiovese', 'санджиовезе'],
  ['Неббиоло', 'nebbiolo'],
  ['Гренаш', 'grenache', 'garnacha', 'гарнача'],
  ['Мурведр', 'mourvedre', 'monastrell', 'монастрель'],
  ['Карменер', 'carmenere'],
  ['Зинфандель', 'zinfandel', 'primitivo', 'примитиво'],
  ['Гаме', 'gamay', 'гамей'],
  ['Саперави', 'saperavi'],
  ['Негроамаро', 'negroamaro'],
  ['Монтепульчано', 'montepulciano'],
  ['Пинотаж', 'pinotage'],
  ['Шардоне', 'chardonnay', 'шардонэ'],
  ['Совиньон Блан', 'sauvignon blanc', 'совиньон блан', 'совиньон бланк', 'савиньон блан'],
  ['Рислинг', 'riesling', 'рислинг'],
  ['Пино Гри', 'pinot gris', 'pinot grigio', 'пино гриджо', 'пино гри'],
  ['Пино Блан', 'pinot blanc', 'пино блан'],
  ['Шенен Блан', 'chenin blanc', 'шенен блан'],
  ['Семильон', 'semillon'],
  ['Вионье', 'viognier', 'вионье'],
  ['Гевюрцтраминер', 'gewurztraminer', 'gewürztraminer', 'гевюрцтраминер', 'гевюрц'],
  ['Мускат', 'muscat', 'moscato', 'москато'],
  ['Альбариньо', 'albarino', 'альбарино'],
  ['Грюнер Вельтлинер', 'gruner veltliner', 'grüner veltliner', 'грюнер вельтлинер'],
  ['Глера', 'glera', 'prosecco', 'просекко'],
  ['Верментино', 'vermentino'],
  ['Треббиано', 'trebbiano'],
  ['Гарганега', 'garganega'],
  ['Мускадэ', 'melon de bourgogne', 'мускадет', 'muscadet'],
  ['Ркацители', 'rkatsiteli'],
  ['Совиньон Гри', 'sauvignon gris'],
]

const ALIASES = new Map()
for (const [ru, ...others] of GRAPES) {
  ALIASES.set(norm(ru), ru)
  for (const o of others) ALIASES.set(norm(o), ru)
}

// Из «Каберне Совиньон, Мерло» → ['Каберне Совиньон', 'Мерло'] (разделители — запятая, точка с запятой, «/», « и »).
export function splitGrapes(raw) {
  return String(raw ?? '').split(/[,;/]+|\s+и\s+/i).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

const titleCase = (s) => s.replace(/(^|\s)(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase())

// Приводит название сорта к виду из словаря; неизвестный — аккуратный вариант исходного.
export function canonicalGrape(name) {
  const key = norm(String(name).replace(/^виноград\s+/i, ''))
  return ALIASES.get(key) || titleCase(String(name).replace(/\s+/g, ' ').trim().toLowerCase())
}

// Список сортов блюда в каноническом виде без повторов.
export function canonicalGrapes(names) {
  const out = []
  for (const n of names || []) {
    const c = canonicalGrape(n)
    if (c && !out.includes(c)) out.push(c)
  }
  return out
}

// Сорта из словаря, упомянутые в тексте (например, в названии вина «Белое вино Sauvignon Blanc»).
export function grapesMentionedIn(text) {
  const hay = ` ${norm(text)} `
  const out = []
  for (const [ru, ...others] of GRAPES) {
    if ([ru, ...others].some((a) => { const k = norm(a); return k.length >= 4 && hay.includes(` ${k} `) })) out.push(ru)
  }
  return out
}

// Типичные сорта для «лишних» вариантов в вопросах (когда в меню мало вин).
export const COMMON_GRAPES = GRAPES.map(([ru]) => ru)
