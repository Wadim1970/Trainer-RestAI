// Упражнения уровней 1–2 и проверка ответов — ЧИСТАЯ логика (без БД и сети).
// Вердикт выносит только код: ответ — это сравнение выбранных вариантов с
// заранее известным набором верных. LLM здесь не участвует.
//
// Формат вопроса единый для всех упражнений:
//   { cardKey, dishId, level, kind, subject, options:[{id,label}], multi, answer:[id,…], primaryOptionId? }
// subject — данные для подписи (название блюда, раздел, список ингредиентов);
// текст инструкции рисует приложение через i18n по `kind`.

import { norm, distractorsFor, shuffle } from './distractorCore.js'

export const KINDS = {
  1: ['menu_grid', 'which_section'],
  2: ['build_dish', 'odd_one', 'guess_dish'],
}

const keyIngredients = (dish) => (dish.ingredients || []).filter((i) => i.is_key).map((i) => i.name)
const allIngredientKeys = (dish) => new Set((dish.ingredients || []).map((i) => norm(i.name)))

// Присваивает вариантам id o0..oN после перемешивания.
function withIds(labels, rng) {
  const items = labels.map((l) => (typeof l === 'string' ? { label: l } : l))
  shuffle(items, rng)
  return items.map((it, i) => ({ ...it, id: `o${i}` }))
}
const idOf = (options, label) => options.find((o) => o.label === label)?.id

// ── Уровень 1 ──
function menuGrid(dish, ctx) {
  const size = ctx.settings.grid_size
  // 1 целевое + до 3 настоящих из того же раздела + остальное — дистракторы.
  const sameSection = ctx.dishes.filter((d) => d.id !== dish.id && d.section === dish.section)
  shuffle(sameSection, ctx.rng)
  const real = [dish, ...sameSection.slice(0, Math.min(3, Math.floor(size / 3)))]
  const fake = distractorsFor(dish, ctx.dishes.map((d) => d.name), size - real.length, ctx.rng)
  if (fake.length < 2) return null
  const options = withIds([...real.map((d) => d.name), ...fake], ctx.rng)
  return {
    kind: 'menu_grid',
    subject: { section: dish.section },
    options,
    multi: true,
    answer: real.map((d) => idOf(options, d.name)),
    primaryOptionId: idOf(options, dish.name),
  }
}

function whichSection(dish, ctx) {
  const others = ctx.sections.filter((s) => s !== dish.section)
  if (others.length < 1) return null
  shuffle(others, ctx.rng)
  const options = withIds([dish.section, ...others.slice(0, 3)], ctx.rng)
  return { kind: 'which_section', subject: { dishName: dish.name }, options, multi: false, answer: [idOf(options, dish.section)] }
}

// ── Уровень 2 ──
// Ингредиенты-дистракторы: из других блюд того же раздела (правдоподобнее), которых нет в этом блюде.
function foreignIngredients(dish, ctx, n) {
  const mine = allIngredientKeys(dish)
  const pool = (names) => {
    const seen = new Set()
    const out = []
    for (const name of names) {
      const k = norm(name)
      if (!k || mine.has(k) || seen.has(k)) continue
      seen.add(k)
      out.push(name)
    }
    return out
  }
  const same = ctx.dishes.filter((d) => d.id !== dish.id && d.section === dish.section && d.ingredients)
  const rest = ctx.dishes.filter((d) => d.id !== dish.id && d.section !== dish.section && d.ingredients)
  const names = (ds) => ds.flatMap((d) => d.ingredients.map((i) => i.name))
  const first = shuffle(pool(names(same)), ctx.rng)
  const more = shuffle(pool(names(rest)).filter((x) => !first.includes(x)), ctx.rng)
  return [...first, ...more].slice(0, n)
}

function buildDish(dish, ctx) {
  const keys = keyIngredients(dish).slice(0, 6)
  if (keys.length < 1) return null
  const foreign = foreignIngredients(dish, ctx, Math.max(4, 12 - keys.length))
  if (foreign.length < 3) return null
  const options = withIds([...keys, ...foreign.slice(0, 12 - keys.length)], ctx.rng)
  return { kind: 'build_dish', subject: { dishName: dish.name }, options, multi: true, answer: keys.map((k) => idOf(options, k)) }
}

function oddOne(dish, ctx) {
  const keys = keyIngredients(dish)
  if (keys.length < 2) return null
  const own = shuffle([...keys], ctx.rng).slice(0, 3)
  const foreign = foreignIngredients(dish, ctx, 1)
  if (!foreign.length) return null
  const options = withIds([...own, foreign[0]], ctx.rng)
  return { kind: 'odd_one', subject: { dishName: dish.name }, options, multi: false, answer: [idOf(options, foreign[0])] }
}

function guessDish(dish, ctx) {
  const keys = keyIngredients(dish)
  if (keys.length < 2) return null
  const same = ctx.dishes.filter((d) => d.id !== dish.id && d.section === dish.section)
  const rest = ctx.dishes.filter((d) => d.id !== dish.id && d.section !== dish.section)
  shuffle(same, ctx.rng)
  shuffle(rest, ctx.rng)
  const wrong = [...same, ...rest].slice(0, 3)
  if (wrong.length < 3) return null
  const options = withIds([dish.name, ...wrong.map((d) => d.name)], ctx.rng)
  return { kind: 'guess_dish', subject: { ingredients: keys }, options, multi: false, answer: [idOf(options, dish.name)] }
}

const BUILDERS = { menu_grid: menuGrid, which_section: whichSection, build_dish: buildDish, odd_one: oddOne, guess_dish: guessDish }

// card: { cardKey, dishId, level }. ctx: { dishes, sections, settings, rng }.
// Пробует виды упражнений уровня в случайном порядке; null — ни один не собрался.
export function buildQuestion(card, ctx) {
  const dish = ctx.dishes.find((d) => d.id === card.dishId)
  if (!dish) return null
  const kinds = shuffle([...(KINDS[card.level] || [])], ctx.rng)
  for (const kind of kinds) {
    const q = BUILDERS[kind](dish, ctx)
    if (q) return { cardKey: card.cardKey, dishId: card.dishId, level: card.level, ...q }
  }
  return null
}

// ── Проверка ответа ──
// selected — id выбранных вариантов. Возвращает:
//   correct        — весь ответ верен (набор выбранных == набор верных);
//   primaryCorrect — верно ли отработана ЦЕЛЕВАЯ карточка (для сетки: целевое блюдо отмечено;
//                    для остальных упражнений совпадает с correct) — по нему идёт повторение;
//   missed / wrong — какие верные не выбраны и какие лишние выбраны.
export function gradeQuestion(q, selected) {
  const picked = new Set((Array.isArray(selected) ? selected : []).filter((id) => q.options.some((o) => o.id === id)))
  const right = new Set(q.answer)
  if (!q.multi && picked.size > 1) {
    // Для одиночного выбора лишнее нажатие — ошибка.
    return { correct: false, primaryCorrect: false, missed: [...right], wrong: [...picked].filter((id) => !right.has(id)) }
  }
  const missed = [...right].filter((id) => !picked.has(id))
  const wrong = [...picked].filter((id) => !right.has(id))
  const correct = missed.length === 0 && wrong.length === 0
  const primaryCorrect = q.primaryOptionId ? picked.has(q.primaryOptionId) : correct
  return { correct, primaryCorrect, missed, wrong }
}

// ── Баллы ──
// items: [{ correct, confident }] в порядке ответов. Возвращает баллы по каждому
// и итоговое комбо. Комбо растёт на верных подряд и сбрасывается ошибкой;
// множитель действует только на положительные баллы.
export function scoreAnswers(items, settings, startCombo = 0) {
  let combo = startCombo
  const points = items.map((it) => {
    const p = settings.points
    const base = it.correct ? (it.confident ? p.correct_confident : p.correct_unsure) : (it.confident ? p.wrong_confident : p.wrong_unsure)
    let pts = base
    if (base > 0) pts = Math.round(base * (1 + settings.combo_step * Math.min(combo, settings.combo_max)))
    combo = it.correct ? combo + 1 : 0
    return pts
  })
  return { points, combo }
}
