#!/usr/bin/env node
// Подготовка ДЕМО-данных учебного ресторана «Сыроварня»: подтверждает состав блюд в контент-студии,
// чтобы в тренажёре работал уровень 2 «Ингредиенты». Ключевыми отмечаются первые 5 ингредиентов.
//
//   node scripts/demo-seed.mjs                      # на VPS: API официанта на 127.0.0.1:3002
//   node scripts/demo-seed.mjs --api https://waiter.restai.pro
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

const sync = await call('POST', null, { action: 'sync' })
console.log(`Меню синхронизировано: блюд ${sync.dishes}, новых черновиков ${sync.created}.`)

const studio = await call('GET')
const todo = studio.dishes.filter((d) => d.productType === 'food' && !d.hidden && d.statuses.ingredients === 'draft')
console.log(`Блюд с неподтверждённым составом: ${todo.length} (из ${studio.dishes.length}).`)

let confirmed = 0
let skipped = 0
for (const [n, d] of todo.entries()) {
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
  if ((n + 1) % 10 === 0) console.log(`  …обработано ${n + 1} из ${todo.length}`)
}
console.log(`Готово: подтверждён состав у ${confirmed} блюд, пропущено ${skipped}.`)
console.log('Откройте тренажёр: уровень 2 «Ингредиенты» станет доступен после набора баллов на уровне 1.')
