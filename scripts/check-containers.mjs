/**
 * Проверка единообразия контейнеров страниц.
 *
 * Задача: у всех страниц должна быть одинаковая ширина контента и одинаковые
 * отступы. Раньше это копипастилось в каждую вьюху и разъезжалось
 * (1440px против 1400px против 1024px), поэтому проверяем не классы в исходниках,
 * а реально отрендеренную геометрию.
 *
 * Запуск: PORT=4181 node scripts/preview-server.mjs & node scripts/check-containers.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://127.0.0.1:4181'

// Все страницы с обычным контейнером. ToolWorkspaceView не включён намеренно:
// это полноэкранная рабочая область, а не страница с центрованным контентом.
const ROUTES = [
  ['/', 'Главная'],
  ['/studios/product-cards', 'Карточки товара'],
  ['/studios/product-cards/new', 'Мастер карточки'],
  ['/studios/product-cards/history', 'История карточек'],
  ['/tools', 'Инструменты'],
  ['/templates', 'Шаблоны'],
  ['/projects', 'Мои проекты'],
  ['/projects/shared', 'Общие со мной'],
  ['/history', 'История'],
  ['/integrations', 'Интеграции'],
  ['/settings', 'Настройки'],
]

const WIDTHS = [1440, 1180, 390]

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => {
  localStorage.setItem(
    'coolay_auth',
    JSON.stringify({ token: 'demo', user: { name: 'Алексей Коваль', role: 'admin' } }),
  )
})

let failures = 0

for (const width of WIDTHS) {
  await page.setViewportSize({ width, height: 900 })
  console.log(`\n=== ${width}px ===`)
  const seen = []

  for (const [route, label] of ROUTES) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(250)

    const m = await page.evaluate(() => {
      const main = document.querySelector('main')
      if (!main) return null
      // Контейнер страницы — первый элемент внутри <main>
      const el = main.firstElementChild
      if (!el) return null
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      const doc = document.documentElement
      return {
        left: Math.round(r.left),
        width: Math.round(r.width),
        padL: cs.paddingLeft,
        padT: cs.paddingTop,
        maxW: cs.maxWidth,
        overflow: doc.scrollWidth > doc.clientWidth,
        scrollW: doc.scrollWidth,
        clientW: doc.clientWidth,
      }
    })

    if (!m) {
      console.log(`  ✗ ${label}: контейнер не найден`)
      failures++
      continue
    }
    if (m.overflow) {
      console.log(`  ✗ ${label}: горизонтальное переполнение ${m.scrollW} > ${m.clientW}`)
      failures++
    }
    seen.push({ label, ...m })
    console.log(
      `  ${label}: width=${m.width} maxW=${m.maxW} padL=${m.padL} padT=${m.padT}`,
    )
  }

  // Все страницы на одной ширине окна должны совпадать по геометрии.
  const ref = seen[0]
  for (const s of seen.slice(1)) {
    const diff = []
    if (s.width !== ref.width) diff.push(`width ${s.width} vs ${ref.width}`)
    if (s.maxW !== ref.maxW) diff.push(`max-width ${s.maxW} vs ${ref.maxW}`)
    if (s.padL !== ref.padL) diff.push(`padding-left ${s.padL} vs ${ref.padL}`)
    if (s.padT !== ref.padT) diff.push(`padding-top ${s.padT} vs ${ref.padT}`)
    if (diff.length) {
      console.log(`  ✗ ${s.label} расходится с «${ref.label}»: ${diff.join(', ')}`)
      failures++
    }
  }
}

await browser.close()

if (failures) {
  console.log(`\n✗ Расхождений: ${failures}`)
  process.exit(1)
}
console.log('\n✓ Все страницы имеют одинаковую ширину и отступы')
