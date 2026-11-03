// node --test api/_lib/wine.test.js — вино и напитки в тренажёре.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeSettings } from './settingsCore.js'
import { seeded, norm } from './distractorCore.js'
import { splitGrapes, canonicalGrape, canonicalGrapes, grapesMentionedIn, COMMON_GRAPES } from './grapeCore.js'
import { trainableDishes, attachFacts, readyByLevel } from './levelsCore.js'
import { buildQuestion, gradeQuestion, KINDS } from './exerciseCore.js'
import { cardKey } from './composeCore.js'

const S = mergeSettings({})

// ── сорта винограда ──
test('сорта: разбор строки, русские названия, неизвестные не теряются', () => {
  assert.deepEqual(splitGrapes('Каберне Совиньон, Мерло; Каберне фран'), ['Каберне Совиньон', 'Мерло', 'Каберне фран'])
  assert.deepEqual(splitGrapes('Мерло и Сира'), ['Мерло', 'Сира'])
  assert.equal(canonicalGrape('Merlot'), 'Мерло')
  assert.equal(canonicalGrape('мерло'), 'Мерло')
  assert.equal(canonicalGrape('виноград Мерло'), 'Мерло')
  assert.equal(canonicalGrape('какой-то неизвестный'), 'Какой-то Неизвестный')
  assert.deepEqual(canonicalGrapes(['Merlot', 'мерло', 'Malbec']), ['Мерло', 'Мальбек'], 'повторы схлопываются')
  assert.deepEqual(canonicalGrapes(null), [])
  assert.ok(COMMON_GRAPES.length >= 30)
  assert.equal(new Set(COMMON_GRAPES.map(norm)).size, COMMON_GRAPES.length)
})

test('сорта: упомянутые в названии вина', () => {
  assert.deepEqual(grapesMentionedIn('Белое вино Sauvignon Blanc'), ['Совиньон Блан'])
  assert.deepEqual(grapesMentionedIn('Шато Лафит'), [])
  assert.deepEqual(grapesMentionedIn(''), [])
})

// ── меню ──
const row = (id, name, section, type = 'food') => ({ id, dish_name: name, menu_section: section, section_order: 1, product_type: type, is_hidden: false })
const MENU = [
  row('f1', 'Борщ', 'Супы'), row('f2', 'Рибай', 'Горячее'), row('f3', 'Цезарь', 'Салаты'), row('f4', 'Оливье', 'Салаты'),
  row('d1', 'Лимонад мятный', 'Лимонады', 'drink'), row('d2', 'Лимонад клубничный', 'Лимонады', 'drink'),
  row('d3', 'Морс клюквенный', 'Морсы', 'drink'), row('d4', 'Фреш апельсин', 'Фреши', 'drink'),
  row('w1', 'Каберне Резерв', 'Вино', 'alcohol'), row('w2', 'Шато Мальбек', 'Вино', 'alcohol'),
  row('w3', 'Белое сухое', 'Вино', 'alcohol'), row('w4', 'Розовое', 'Вино', 'alcohol'),
  row('w5', 'Красное полусладкое', 'Вино', 'alcohol'), row('w6', 'Негрони', 'Коктейли', 'alcohol'),
]
const ing = (...names) => names.map((n, i) => ({ name: n, is_key: i < 3 }))
const F = (dish_id, fact_type, value, status = 'confirmed') => ({ dish_id, fact_type, status, value })
const FACTS = [
  F('f1', 'ingredients', { items: ing('Свёкла', 'Говядина', 'Капуста', 'Сметана') }),
  F('f2', 'ingredients', { items: ing('Говядина', 'Розмарин', 'Масло', 'Соль') }),
  F('f3', 'ingredients', { items: ing('Курица', 'Пармезан', 'Романо', 'Соус') }),
  F('f4', 'ingredients', { items: ing('Картофель', 'Горошек', 'Колбаса', 'Майонез') }),
  F('d1', 'ingredients', { items: ing('Мята', 'Лайм', 'Сахар', 'Содовая') }),
  F('d2', 'ingredients', { items: ing('Клубника', 'Лимон', 'Сахар', 'Содовая') }),
  F('d3', 'ingredients', { items: ing('Клюква', 'Сахар', 'Вода', 'Мёд') }),
  F('d4', 'ingredients', { items: ing('Апельсин', 'Лёд', 'Мята', 'Сироп') }),
  // у вина «состав» — обрывки вкуса: учиться по нему нельзя
  F('w1', 'ingredients', { items: ing('вкус черной смородины', 'танины') }),
  F('w1', 'wine_grape', { grapes: ['Cabernet Sauvignon', 'Merlot'] }), F('w1', 'wine_vintage', { year: 2019 }),
  F('w2', 'wine_grape', { grapes: ['Malbec'] }), F('w2', 'wine_vintage', { year: 2021 }),
  F('w3', 'wine_grape', { grapes: ['Sauvignon Blanc'] }),
  F('w4', 'wine_grape', { grapes: ['Grenache', 'Syrah'] }), F('w4', 'wine_vintage', { year: 2022 }),
  F('w5', 'wine_grape', { grapes: ['Saperavi'] }, 'draft'), // не подтверждён
  F('w6', 'ingredients', { items: ing('Джин', 'Кампари', 'Вермут', 'Апельсин') }), // коктейль — состав
]

const dishes = attachFacts(trainableDishes(MENU), FACTS)
const by = (id) => dishes.find((d) => d.id === id)
const ctx = (seed = 3) => ({ dishes, sections: [...new Set(dishes.map((d) => d.section))], settings: S, rng: seeded(seed), year: 2026 })
const card = (id) => ({ cardKey: cardKey(2, id), dishId: id, level: 2 })

test('факты: у вина — сорта и год, а не «состав»; у коктейля и напитков — состав', () => {
  assert.deepEqual(by('w1').wine, { grapes: ['Каберне Совиньон', 'Мерло'], vintage: 2019 })
  assert.equal(by('w1').ingredients, null, 'обрывки вкуса в состав вина не попадают')
  assert.deepEqual(by('w2').wine, { grapes: ['Мальбек'], vintage: 2021 })
  assert.equal(by('w5').wine, null, 'черновик не учитываем')
  assert.ok(by('w6').ingredients.length === 4 && by('w6').wine === null)
  assert.ok(by('d1').ingredients.length === 4)
})

test('уровень 2: вино с сортом/годом, коктейли и безалкогольные напитки готовы; черновик — нет', () => {
  const ready = readyByLevel(dishes)[2].map((d) => d.id).sort()
  assert.deepEqual(ready, ['d1', 'd2', 'd3', 'd4', 'f1', 'f2', 'f3', 'f4', 'w1', 'w2', 'w3', 'w4', 'w6'])
})

test('год без сорта тоже делает вино готовым', () => {
  const d = attachFacts(trainableDishes(MENU), [F('w5', 'wine_vintage', { year: 2018 })])
  assert.ok(readyByLevel(d)[2].some((x) => x.id === 'w5'))
})

// ── упражнения ──
function kindsFor(id, seeds = 120) {
  const out = new Map()
  for (let seed = 1; seed <= seeds; seed++) {
    const q = buildQuestion(card(id), ctx(seed))
    if (q) { if (!out.has(q.kind)) out.set(q.kind, []); out.get(q.kind).push(q) }
  }
  return out
}
function wellFormed(q) {
  const ids = q.options.map((o) => o.id)
  assert.equal(new Set(q.options.map((o) => norm(o.label))).size, q.options.length, 'варианты не повторяются')
  for (const a of q.answer) assert.ok(ids.includes(a))
  if (!q.multi) assert.equal(q.answer.length, 1)
}

test('KINDS[2] содержит вопросы про вино', () => {
  for (const k of ['wine_grape', 'wine_vintage', 'guess_wine']) assert.ok(KINDS[2].includes(k), k)
})

test('вино-купаж: выбор нескольких сортов, верный набор == сорта вина', () => {
  const qs = kindsFor('w1').get('wine_grape')
  assert.ok(qs?.length, 'вопрос про сорт собирается')
  for (const q of qs) {
    wellFormed(q)
    assert.equal(q.multi, true)
    assert.deepEqual(q.answer.map((id) => q.options.find((o) => o.id === id).label).sort(), ['Каберне Совиньон', 'Мерло'])
    assert.ok(q.options.length >= 4 && q.options.length <= 6)
  }
})

test('вино одного сорта: одиночный выбор из 4, верный сорт на месте, без дублей', () => {
  const qs = kindsFor('w3').get('wine_grape')
  assert.ok(qs?.length)
  for (const q of qs) {
    wellFormed(q)
    assert.equal(q.multi, false)
    assert.equal(q.options.find((o) => o.id === q.answer[0]).label, 'Совиньон Блан')
    assert.equal(q.options.length, 4)
  }
})

test('название выдаёт ответ («Шато Мальбек») → про сорт не спрашиваем, про год — можно', () => {
  const m = kindsFor('w2')
  assert.equal(m.has('wine_grape'), false)
  assert.equal(m.has('guess_wine'), false)
  assert.equal(m.has('wine_vintage'), true)
})

test('год урожая: верный год среди вариантов, будущих лет нет', () => {
  const qs = kindsFor('w1').get('wine_vintage')
  assert.ok(qs?.length)
  for (const q of qs) {
    wellFormed(q)
    assert.equal(q.options.find((o) => o.id === q.answer[0]).label, '2019')
    for (const o of q.options) assert.ok(Number(o.label) <= 2026)
  }
  assert.equal(kindsFor('w3').has('wine_vintage'), false, 'года нет — вопроса нет')
})

test('«какое вино»: лишние — только вина с известными сортами и без пересечения', () => {
  const qs = kindsFor('w4').get('guess_wine')
  assert.ok(qs?.length)
  for (const q of qs) {
    wellFormed(q)
    const labels = q.options.map((o) => o.label)
    assert.ok(labels.includes('Розовое'))
    assert.ok(!labels.includes('Красное полусладкое'), 'без сортов — не берём')
    assert.ok(!labels.includes('Негрони'), 'не вино — не берём')
    assert.deepEqual(q.subject.grapes, ['Гренаш', 'Сира'])
  }
})

test('«какое вино»: если у другого вина тот же сорт — оно не попадает в варианты', () => {
  const d = attachFacts(trainableDishes(MENU), [
    ...FACTS,
    F('w5', 'wine_grape', { grapes: ['Мерло'] }),
  ])
  for (let seed = 1; seed <= 80; seed++) {
    const q = buildQuestion(card('w1'), { dishes: d, sections: [], settings: S, rng: seeded(seed), year: 2026 })
    if (q?.kind === 'guess_wine') assert.ok(!q.options.some((o) => o.label === 'Красное полусладкое'))
  }
})

test('безалкогольные напитки: ложные ингредиенты и блюда — только из напитков', () => {
  const foodIng = new Set(['свекла', 'говядина', 'капуста', 'сметана', 'розмарин', 'масло', 'соль', 'курица', 'пармезан', 'романо', 'соус', 'картофель', 'горошек', 'колбаса', 'майонез'])
  const foodNames = new Set(['Борщ', 'Рибай', 'Цезарь', 'Оливье'])
  const m = kindsFor('d1')
  assert.ok(m.size >= 2, 'напиток даёт несколько видов вопросов')
  for (const qs of m.values()) {
    for (const q of qs) {
      wellFormed(q)
      for (const o of q.options) {
        assert.ok(!foodIng.has(norm(o.label)), `еда в вариантах напитка: ${o.label}`)
        assert.ok(!foodNames.has(o.label), `блюдо в вариантах напитка: ${o.label}`)
      }
    }
  }
})

test('еда: в вариантах нет напитков', () => {
  const drinkNames = new Set(['Лимонад мятный', 'Лимонад клубничный', 'Морс клюквенный', 'Фреш апельсин', 'Мята', 'Лайм', 'Содовая', 'Клубника'])
  for (const qs of kindsFor('f3').values()) for (const q of qs) for (const o of q.options) assert.ok(!drinkNames.has(o.label), o.label)
})

test('проверка ответа на вопрос про сорт', () => {
  const q = kindsFor('w1').get('wine_grape')[0]
  assert.equal(gradeQuestion(q, q.answer).correct, true)
  assert.equal(gradeQuestion(q, [q.answer[0]]).correct, false, 'одного сорта из двух мало')
  const wrong = q.options.find((o) => !q.answer.includes(o.id)).id
  assert.equal(gradeQuestion(q, [...q.answer, wrong]).correct, false)
})
