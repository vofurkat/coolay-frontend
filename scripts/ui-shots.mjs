/**
 * Визуальная проверка вёрстки: логинится, засеивает пару SKU-карточек в
 * localStorage и снимает ключевые экраны в нескольких ширинах.
 * Данные подкладываются напрямую в стор-ключ coolay_sku_cards, чтобы не
 * тратить кредиты kie.ai на реальную генерацию ради скриншотов.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE || 'http://127.0.0.1:4180'
const OUT = '.ui'
mkdirSync(OUT, { recursive: true })

const WIDTHS = [
  { name: 'desktop', w: 1440, h: 1100 },
  { name: 'laptop', w: 1180, h: 900 },
  { name: 'mobile', w: 390, h: 900 },
]

function fakeCard(i) {
  const now = new Date(Date.now() - i * 3600_000).toISOString()
  const langs = ['ru', 'en', 'uz', 'tr']
  const content = {}
  langs.forEach((l) => {
    content[l] = {
      name:
        l === 'ru'
          ? `Мужская летняя рубашка с коротким рукавом, модель ${i + 1}`
          : `Men summer shirt ${i + 1}`,
      short: 'Лёгкая рубашка из хлопка для тёплой погоды, свободный крой.',
      full: 'Полное описание товара. '.repeat(20),
      advantages: ['100% хлопок', 'Дышащая ткань', 'Свободный крой', 'Легко стирается'],
      seo: {
        title: 'Мужская рубашка купить',
        description: 'Купить мужскую летнюю рубашку из хлопка',
        keywords: ['рубашка', 'хлопок', 'лето', 'мужская', 'короткий рукав'],
      },
    }
  })
  return {
    id: `card-seed-${i}`,
    sku: `SKU-SEED${i}0`,
    productId: `PRD-0000${i}`,
    status: i === 2 ? 'draft' : i === 3 ? 'archived' : 'active',
    createdAt: now,
    updatedAt: now,
    author: 'Администратор',
    createdVia: 'AI-генерация',
    sourceImage: '',
    images: [
      { slotId: 'main', taskId: 't1', state: 'success', url: '', credits: 4 },
      { slotId: 'cutout', taskId: 't2', state: 'success', url: '', credits: 4 },
    ],
    analysis: {
      title: 'Мужская летняя рубашка',
      subtitle: 'Хлопок, короткий рукав',
      confidence: 95,
      category: 'Рубашки',
      color: 'Голубой',
      material: 'Хлопок',
      gender: 'Мужской',
      season: 'Лето',
      productType: 'Рубашка',
      style: 'Casual',
      pattern: 'Однотонный',
      cut: 'Свободный',
      neckline: 'Кубинский воротник',
      sleeve: 'Короткий',
      brand: '',
      doubts: [],
      recommendations: [],
      imagePrompt: '',
    },
    content,
    specs: Array.from({ length: 11 }, (_, k) => ({
      label: `Характеристика ${k + 1}`,
      value: `Значение ${k + 1}`,
    })),
    tone: 'Нейтральный',
    credits: 28.4,
    channels: [
      { id: 'site', name: 'Сайт', short: 'C', tone: 'bg-ink-900 text-white', status: 'ready' },
      { id: 'wb', name: 'Wildberries', short: 'WB', tone: 'bg-fuchsia-600 text-white', status: 'ready' },
      { id: 'ozon', name: 'Ozon', short: 'OZ', tone: 'bg-blue-600 text-white', status: 'ready' },
      { id: 'shopify', name: 'Shopify', short: 'SH', tone: 'bg-emerald-600 text-white', status: 'ready' },
      { id: 'ms', name: 'МойСклад', short: 'МС', tone: 'bg-amber-500 text-white', status: 'check' },
    ],
    versions: [{ id: 'v1', label: 'v1.0', createdAt: now, author: 'Администратор', current: true }],
    activity: [
      { id: 'a1', text: 'Карточка создана', author: 'Администратор', createdAt: now, icon: 'sparkles' },
    ],
    readiness: { total: 92 - i * 7, content: 95, specs: 100, seo: 90, images: 100, adaptation: 100 },
  }
}

const errors = []

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
const page = await ctx.newPage()

page.on('console', (m) => {
  if (m.type() === "error") errors.push(m.text() + " @ " + (m.location()?.url || "?"))
})
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
await page.route('**://fonts.g*/**', (r) => r.abort())

// Логин
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.getByPlaceholder('Введите логин').fill('admin')
await page.getByPlaceholder('Введите пароль').fill('admin')
await page.locator('button[type=submit]').click()
await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 15000 })

// Засеиваем карточки
await page.evaluate((cards) => {
  localStorage.setItem('coolay_sku_cards', JSON.stringify(cards))
  localStorage.removeItem('coolay_sku_draft')
}, [0, 1, 2, 3].map(fakeCard))

const ROUTES = [
  ['studio', '/studios/product-cards'],
  ['projects', '/projects'],
  ['history', '/studios/product-cards/history'],
  ['detail', '/studios/product-cards/card-seed-0'],
  ['dashboard', '/'],
]

for (const { name, w, h } of WIDTHS) {
  await page.setViewportSize({ width: w, height: h })
  for (const [label, path] of ROUTES) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(350)
    await page.screenshot({ path: `${OUT}/${name}-${label}.png`, fullPage: true })
  }
}

// Проверка горизонтального переполнения — главный симптом «каши»
await page.setViewportSize({ width: 1440, height: 1100 })
const overflow = []
for (const [label, path] of ROUTES) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
  const r = await page.evaluate(() => {
    const el = document.scrollingElement
    const main = document.querySelector('main')
    return {
      docScrollW: el.scrollWidth,
      docClientW: el.clientWidth,
      mainScrollW: main?.scrollWidth ?? 0,
      mainClientW: main?.clientWidth ?? 0,
    }
  })
  const bad = r.docScrollW > r.docClientW + 1 || r.mainScrollW > r.mainClientW + 1
  overflow.push(`${bad ? 'ГОР.СКРОЛЛ' : 'ok'} ${label}: doc ${r.docScrollW}/${r.docClientW}, main ${r.mainScrollW}/${r.mainClientW}`)
}

// Проверка бокового отступа контента от края main
await page.goto(`${BASE}/studios/product-cards`, { waitUntil: 'networkidle' })
const pad = await page.evaluate(() => {
  const main = document.querySelector('main')
  const page = main.querySelector('.page, .page-narrow')
  if (!page) return null
  const h1 = page.querySelector('h1')
  return {
    mainLeft: main.getBoundingClientRect().left,
    h1Left: h1.getBoundingClientRect().left,
    pageWidth: page.getBoundingClientRect().width,
    mainWidth: main.getBoundingClientRect().width,
  }
})

console.log('--- горизонтальное переполнение ---')
overflow.forEach((l) => console.log(l))
console.log('--- отступы (1440px) ---')
console.log(JSON.stringify(pad))
console.log('--- ошибки консоли ---')
console.log(errors.length ? errors.slice(0, 10).join('\n') : 'нет')

await browser.close()
