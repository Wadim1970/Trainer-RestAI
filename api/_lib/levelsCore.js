// Блюда для обучения, готовность к уровням и открытие уровней — ЧИСТАЯ логика.
// Источник данных — общая БД: меню (menu_items) и ПОДТВЕРЖДЁННЫЕ шефом факты
// (trn_dish_facts, контент-студия в Admin-restai). Неподтверждённое в тренажёр
// не попадает.

import { norm, roleOf } from './distractorCore.js'
import { canonicalGrapes } from './grapeCore.js'

const isPopular = (section) => norm(section) === 'популярное'

// Блюда меню для обучения: без скрытых и без копий в «Популярном» (одно блюдо — одна запись).
export function trainableDishes(rows) {
  const byName = new Map()
  for (const r of rows) {
    const k = norm(r.dish_name)
    if (!byName.has(k)) byName.set(k, [])
    byName.get(k).push(r)
  }
  const drop = new Set()
  for (const list of byName.values()) {
    const pop = list.filter((r) => isPopular(r.menu_section))
    const own = list.filter((r) => !isPopular(r.menu_section))
    if (pop.length === 1 && own.length === 1) drop.add(pop[0].id)
  }
  return rows
    .filter((r) => !r.is_hidden && !drop.has(r.id) && String(r.dish_name || '').trim())
    .sort((a, b) => (a.section_order ?? 9999) - (b.section_order ?? 9999) || String(a.dish_name).localeCompare(String(b.dish_name), 'ru'))
    .map((r) => ({
      id: r.id,
      name: String(r.dish_name).trim(),
      section: r.menu_section || 'Без раздела',
      sectionOrder: r.section_order ?? 9999,
      description: String(r.description || ''),
      role: roleOf(r),
      productType: r.product_type || 'food',
      ingredients: null, // заполняется подтверждёнными фактами
    }))
}

// facts — строки trn_dish_facts (ingredients, wine_grape, wine_vintage). Берётся только ПОДТВЕРЖДЁННОЕ.
//  • еда, безалкогольные напитки, коктейли и крепкое: состав (ingredients);
//  • вино: сорта винограда и год урожая. Состав у вина — обрывки описания вкуса,
//    поэтому для вин он не используется.
export function attachFacts(dishes, facts) {
  const ing = new Map()
  const grapes = new Map()
  const vintage = new Map()
  for (const f of facts) {
    if (f.status !== 'confirmed' || !f.value || f.value.na) continue
    if (f.fact_type === 'ingredients') ing.set(f.dish_id, (f.value.items || []).filter((i) => i && String(i.name || '').trim()))
    else if (f.fact_type === 'wine_grape') grapes.set(f.dish_id, canonicalGrapes(f.value.grapes))
    else if (f.fact_type === 'wine_vintage' && Number.isInteger(f.value.year)) vintage.set(f.dish_id, f.value.year)
  }
  return dishes.map((d) => {
    const g = grapes.get(d.id) || []
    const y = vintage.get(d.id) ?? null
    // Вино (есть подтверждённый сорт или год): состав не используем — у вин это обрывки описания вкуса.
    if (d.productType === 'alcohol' && (g.length || y)) return { ...d, ingredients: null, wine: { grapes: g, vintage: y } }
    // Остальное (еда, безалкогольные напитки, коктейли и крепкое): подтверждённый состав.
    return { ...d, ingredients: ing.get(d.id) || null, wine: null }
  })
}
export const attachIngredients = attachFacts // прежнее имя

// Блюдо готово к уровню 2: подтверждённый состав с ключевым ингредиентом
// (еда, напитки) либо подтверждённый сорт винограда / год урожая (вино).
export const level2Ready = (d) => !!(d.wine || (d.ingredients && d.ingredients.some((i) => i.is_key)))

// Какие блюда готовы к каждому уровню.
export function readyByLevel(dishes) {
  return { 1: dishes, 2: dishes.filter(level2Ready) }
}

export const LEVEL_TITLES = { 1: 'names', 2: 'ingredients', 3: 'chef' }

// Состояние каждого уровня для карты. progress — баллы по уровням { 1: n, 2: n }.
// status: open | locked (ждёт баллов) | empty (шеф ещё не подтвердил данные) | soon (ещё не сделано).
export function levelMap(ready, progress, settings) {
  const points = (lv) => Number(progress?.[lv] || 0)
  const out = []
  for (const level of [1, 2]) {
    const need = level === 1 ? 0 : settings.unlock_points[level]
    const prev = level === 1 ? Infinity : points(level - 1)
    const unlocked = level === 1 || prev >= need
    const dishes = ready[level].length
    out.push({
      level,
      title: LEVEL_TITLES[level],
      status: !unlocked ? 'locked' : dishes === 0 ? 'empty' : 'open',
      points: points(level),
      need,
      prevPoints: level === 1 ? null : prev,
      dishes,
    })
  }
  out.push({ level: 3, title: LEVEL_TITLES[3], status: 'soon', points: 0, need: settings.unlock_points[3], prevPoints: null, dishes: 0 })
  return out
}

export const isUnlocked = (map, level) => map.find((m) => m.level === level)?.status === 'open'
