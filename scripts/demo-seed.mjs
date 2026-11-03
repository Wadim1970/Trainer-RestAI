#!/usr/bin/env node
// Подготовка ДЕМО-данных учебного ресторана «Сыроварня»: подтверждает состав блюд в контент-студии,
// чтобы в тренажёре работал уровень 2 «Состав и вина»:
//   • еда, безалкогольные напитки, коктейли — подтверждается состав (ключевыми отмечаются первые 5 ингредиентов);
//   • вина — подтверждаются сорт винограда и год урожая (состав у вин — обрывки описания вкуса, его не учим).
//
//   node scripts/demo-seed.mjs                      # на VPS: API официанта на 127.0.0.1:3002
//   node scripts/demo-seed.mjs --api https://waiter.restai.pro
//   node scripts/demo-seed.mjs --explain            # только показать, какие блюда будут обработаны, а какие нет и почему (ничего не меняет)
//
// ВАЖНО: это демо-данные, а не проверка шефа. В журнале подтверждений пишется «Демо (автоматически)».
// Для настоящего ресторана так делать нельзя: скрипт откажется работать с любым рестораном,
// кроме учебного (--restaurant другой id только вместе с --force). Повторный запуск безопасен:
// трогает только черновики, не затрагивая уже подтверждённое шефом или с отмеченными ключевыми.

const DEMO_RESTAURANT_ID = 'dd89773c-0952-4fd1-9510-514094a928ee'
const ACTOR = 'Демо (автоматически)'
const KEY_COUNT = 5

const args = process.argv.slice(2)
const arg = (name, def) => { const i = args.indexOf(`--${name}`); return i > -1 ? args[i + 1] : def }
const api = String(arg('api', 'http://127.0.0.1:3002')).replace(/\/$/, '')
const restaurantId = arg('restaurant', DEMO_RESTAURANT_ID)
const token = arg('token', process.env.ADMIN_TOKEN || '')

function die(msg) { console.error(`Ошибка: ${msg}`); process.exit(1) }

if (restaurantId !== DEMO_RESTAURANT_ID && !args.includes('--force')) {
  die('это демо-скрипт: он работает только с учебным рестораном «Сыроварня». Для другого ресторана нужен --force, но так делать нельзя: состав должен подтверждать шеф.')
}

async function call(method, query, body) {
  const url = new URL(`${api}/api/admin/trainer-facts`)
  if (method === 'GET') { url.searchParams.set('restaurantId', restaurantId); for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v) }
  let res
  try {
    res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Admin-Token': token } : {}) },
      body: method === 'GET' ? undefined : JSON.stringify({ restaurantId, ...body }),
    })
  } catch (e) { die(`не удалось связаться с ${api}: ${e.message}`) }
  const json = await res.json().catch(() => ({}))
  if (!res.ok) die(`${method} ${res.status}: ${json.error || 'ошибка сервера'}`)
  return json
}

// Вино — по наличию факта «сорт»/«год» в ЛЮБОМ статусе (иначе после подтверждения вино стало бы «обычной позицией»
// и скрипт подтвердил бы его «состав» — обрывки описания вкуса).
const isWine = (d) => d.productType === 'alcohol' && !!(d.statuses.wine_grape || d.statuses.wine_vintage)
const isDraft = (d, type) => d.statuses[type] === 'draft'
const wineTodo = (d) => isDraft(d, 'wine_grape') || isDraft(d, 'wine_vintage')

// Режим «объяснить»: только чтение. Раскладывает позиции студии по причинам, ничего не меняет.
if (args.includes('--explain')) {
  const studio = await call('GET')
  const groups = { food: [], drink: [], cocktail: [], wine: [], hidden: [], none: [], done: [] }
  for (const d of studio.dishes) {
    if (d.hidden) groups.hidden.push(d.name)
    else if (isWine(d)) (wineTodo(d) ? groups.wine : groups.done).push(d.name)
    else if (!d.statuses.ingredients) groups.none.push(d.name)
    else if (!isDraft(d, 'ingredients')) groups.done.push(d.name)
    else if (d.productType === 'food') groups.food.push(d.name)
    else if (d.productType === 'drink') groups.drink.push(d.name)
    else groups.cocktail.push(d.name)
  }
  const show = (title, names) => {
    console.log(`\n${title}: ${names.length}`)
    for (const n of names.slice(0, 40)) console.log(`   • ${n}`)
    if (names.length > 40) console.log(`   … и ещё ${names.length - 40}`)
  }
  console.log(`Всего позиций в студии: ${studio.dishes.length} (копии в «Популярном» не считаются — это те же блюда)`)
  show('БУДУТ ОБРАБОТАНЫ — еда (состав из меню)', groups.food)
  show('БУДУТ ОБРАБОТАНЫ — безалкогольные напитки (состав)', groups.drink)
  show('БУДУТ ОБРАБОТАНЫ — коктейли и крепкий алкоголь (состав)', groups.cocktail)
  show('БУДУТ ОБРАБОТАНЫ — вина (сорт винограда и год урожая)', groups.wine)
  show('Исключены — скрыты от гостя', groups.hidden)
  show('Исключены — в меню не указан состав (нечего подтверждать)', groups.none)
  show('Исключены — уже подтверждено или отклонено', groups.done)
  console.log('\nПримечание: позиции без состава могли ещё не попасть в студию как черновики — запуск без --explain сначала синхронизирует меню.')
  process.exit(0)
}

const sync = await call('POST', null, { action: 'sync' })
console.log(`Меню синхронизировано: позиций ${sync.dishes}, новых черновиков ${sync.created}.`)

const studio = await call('GET')
const visible = studio.dishes.filter((d) => !d.hidden)
const wines = visible.filter((d) => isWine(d) && wineTodo(d))
const rest = visible.filter((d) => !isWine(d) && isDraft(d, 'ingredients'))
console.log(`К подтверждению: состав у ${rest.length}, вина (сорт/год) — ${wines.length} (из ${studio.dishes.length} позиций).`)

let confirmed = 0
let skipped = 0
let wineFacts = 0
for (const [n, d] of rest.entries()) {
  const card = await call('GET', { dishId: d.id })
  const fact = card.facts.find((f) => f.type === 'ingredients')
  const items = fact?.value?.items || []
  // Нет состава, или шеф уже отметил ключевые ингредиенты — не трогаем.
  if (!items.length || items.some((i) => i.is_key)) { skipped++; continue }
  await call('POST', null, {
    action: 'save', actor: ACTOR, dishId: d.id, factType: 'ingredients', confirm: true,
    value: { items: items.map((i, idx) => ({ name: i.name, is_key: idx < KEY_COUNT })) },
  })
  confirmed++
  if ((n + 1) % 10 === 0) console.log(`  …обработано ${n + 1} из ${rest.length}`)
}
for (const d of wines) {
  const card = await call('GET', { dishId: d.id })
  for (const type of ['wine_grape', 'wine_vintage']) {
    const fact = card.facts.find((f) => f.type === type)
    if (!fact || fact.status !== 'draft') continue
    const ok = type === 'wine_grape' ? (fact.value?.grapes || []).length > 0 : Number.isInteger(fact.value?.year)
    if (!ok) continue
    await call('POST', null, { action: 'save', actor: ACTOR, dishId: d.id, factType: type, confirm: true, value: fact.value })
    wineFacts++
  }
}
console.log(`Готово: подтверждён состав у ${confirmed} позиций (пропущено ${skipped}), у вин — фактов (сорт/год): ${wineFacts}.`)
console.log('Откройте тренажёр: уровень 2 «Состав и вина» станет доступен после набора баллов на уровне 1.')
