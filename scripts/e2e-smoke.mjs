/**
 * E2E-проверка модуля «Карточки товара» в песочнице.
 * Прогоняет весь мастер: логин → загрузка фото → анализ → контент → изображения → карточка,
 * затем проверяет историю, страницу карточки и восстановление после перезагрузки.
 *
 *   node scripts/e2e-smoke.mjs                 # полный прогон (тратит кредиты kie.ai)
 *   FAST=1 node scripts/e2e-smoke.mjs          # без шага генерации изображений
 *   BASE=http://127.0.0.1:4175 node scripts/...
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE || 'http://127.0.0.1:4175'
const SHOTS = path.resolve(import.meta.dirname, '..', '.e2e')
const FAST = process.env.FAST === '1'
const PHOTO = process.env.PHOTO || path.resolve(import.meta.dirname, 'fixtures', 'product.jpg')

fs.mkdirSync(SHOTS, { recursive: true })

const errors = []
const results = []
let step = 0

function log(ok, name, extra = '') {
  results.push({ ok, name, extra })
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${extra ? ' — ' + extra : ''}`)
}

/**
 * Активная кнопка с точной подписью. Анкоры делаем пробел-терпимыми:
 * внутри кнопок есть иконки и переводы строк, поэтому /^Текст$/ не сработает.
 * :not([disabled]) отсекает неактивные шаги прогресс-бара с похожими подписями.
 */
function btn(page, text) {
  return page
    .locator('button:not([disabled])', { hasText: new RegExp(`^\\s*${text}\\s*$`) })
    .first()
}

async function shot(page, name) {
  step += 1
  await page.screenshot({
    path: path.join(SHOTS, `${String(step).padStart(2, '0')}-${name}.png`),
    fullPage: true,
  })
}

const run = async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })

  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))
  // Внешние шрифты в офлайн-песочнице не грузятся — блокируем, чтобы не ждать таймауты.
  await page.route('**://fonts.g*/**', (r) => r.abort())

  const goto = (p) => page.goto(BASE + p, { waitUntil: 'domcontentloaded', timeout: 20000 })

  /* ---------- 1. Логин ---------- */
  await goto('/studios/product-cards')
  await page.waitForTimeout(600)
  if (page.url().includes('/login')) {
    // Демо-учётка из stores/auth.ts
    await page.fill('input[placeholder="Введите логин"]', 'admin')
    await page.fill('input[placeholder="Введите пароль"]', 'admin')
    await page.locator('button[type="submit"]').first().click()
    await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 })
  }
  log(!page.url().includes('/login'), 'Авторизация', page.url().replace(BASE, ''))

  /* ---------- 2. Лендинг (экран 1) ---------- */
  await goto('/studios/product-cards')
  await page.waitForSelector('text=Карточки товара', { timeout: 15000 })
  const hasCta = await page.locator('text=Создать карточку товара').count()
  const hasScenarios = await page.locator('text=Быстрые сценарии').count()
  log(hasCta > 0 && hasScenarios > 0, 'Экран 1: лендинг с CTA и сценариями')
  await shot(page, 'landing')

  /* ---------- 3. Загрузка фото → шаг 2 ---------- */
  if (!fs.existsSync(PHOTO)) throw new Error(`нет тестового фото: ${PHOTO}`)
  await page.setInputFiles('input[type="file"]', PHOTO)
  await page.waitForURL('**/studios/product-cards/new', { timeout: 15000 })
  log(true, 'Переход в мастер после загрузки фото')

  /* ---------- 4. Шаг 2: AI-анализ ---------- */
  await page.waitForSelector('text=Уверенность', { timeout: 120000 })
  const conf = (await page.locator('text=/Уверенность:\\s*\\d+%/').first().textContent()) || ''
  log(true, 'Шаг 2: AI-анализ завершён', conf.trim())
  await shot(page, 'step2-analysis')

  /* ---------- 4a. Проверка восстановления после перезагрузки ---------- */
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('text=Уверенность', { timeout: 60000 })
  log(
    page.url().includes('/studios/product-cards/new'),
    'Восстановление после F5 на шаге 2 (черновик не потерян)',
  )

  /* ---------- 5. Шаг 3: генерация контента ---------- */
  await page.locator('button:has-text("Сгенерировать контент и перейти")').first().click()
  await page.waitForSelector('text=Название товара', { timeout: 180000 })
  await page.waitForTimeout(1500)

  // Название — <input>, краткое/полное описание — <textarea>
  const nameInput = page.locator('input[maxlength="150"]')
  const shortArea = page.locator('textarea[maxlength="200"]')
  const fullArea = page.locator('textarea[maxlength="3000"]')

  const nameVal = await nameInput.inputValue()
  const shortVal = await shortArea.inputValue()
  const fullVal = await fullArea.inputValue()
  log(
    nameVal.length > 5 && nameVal.length <= 150,
    'Шаг 3: название в пределах лимита',
    `${nameVal.length}/150`,
  )
  log(shortVal.length > 5 && shortVal.length <= 200, 'Шаг 3: краткое описание', `${shortVal.length}/200`)
  log(fullVal.length > 100 && fullVal.length <= 3000, 'Шаг 3: полное описание', `${fullVal.length}/3000`)

  const skuText = (await page.locator('text=/SKU-[A-Z0-9]{6}/').first().textContent()) || ''
  log(/SKU-[A-Z0-9]{6}/.test(skuText), 'SKU присвоен и показан на шаге 3', skuText.trim())

  // Переключение языков: у каждого должно быть непустое название
  for (const l of ['EN', 'UZ', 'TR']) {
    const btn = page.locator(`button:has-text("${l}")`).first()
    if (await btn.count()) {
      await btn.click()
      await page.waitForTimeout(400)
      const v = await nameInput.inputValue()
      log(v.length > 3, `Язык ${l} заполнен`, `название ${v.length} симв.`)
    }
  }
  await page.locator('button:has-text("RU")').first().click()
  await page.waitForTimeout(300)

  // Характеристики. Ищем по точному тексту и только среди активных кнопок —
  // иначе селектор попадает в подпись шага прогресс-бара («Текст, характеристики, SEO»).
  const specsTab = btn(page, 'Характеристики')
  if (await specsTab.count()) {
    await specsTab.click()
    await page.waitForTimeout(500)
    const rows = await page.locator('input[placeholder="Значение"]').count()
    log(rows > 0, 'Шаг 3: характеристики сгенерированы', `${rows} строк`)
    await btn(page, 'Контент').click()
    await page.waitForTimeout(300)
  }
  await shot(page, 'step3-content')

  /* ---------- 6. Шаг 4: изображения ---------- */
  await btn(page, 'Продолжить').click()
  await page.waitForSelector('text=Дополнительные изображения', { timeout: 20000 })
  log(true, 'Шаг 4: экран подготовки изображений открыт')
  await shot(page, 'step4-images')

  if (FAST) {
    log(true, 'Шаг 4: генерация пропущена (FAST=1)')
  } else {
    await page.locator('button:has-text("Создать изображения и продолжить")').first().click()

    // Опрашиваем черновик в localStorage — это источник истины.
    // Текст страницы для этого не годится: «Генерация контента» есть в
    // прогресс-баре всегда и даёт ложное срабатывание.
    const draftImages = () =>
      page.evaluate(() => {
        const d = JSON.parse(localStorage.getItem('coolay_sku_draft') || '{}')
        return (d.images || []).map((i) => i.state)
      })

    // 1) задачи созданы
    await page
      .waitForFunction(
        () => {
          const d = JSON.parse(localStorage.getItem('coolay_sku_draft') || '{}')
          return (d.images || []).length > 0
        },
        null,
        { timeout: 90000, polling: 1000 },
      )
      .catch(() => {})
    log((await draftImages()).length > 0, 'Шаг 4: задачи генерации созданы', `${(await draftImages()).length} шт.`)

    // 2) ни одна не осталась в processing
    await page
      .waitForFunction(
        () => {
          const d = JSON.parse(localStorage.getItem('coolay_sku_draft') || '{}')
          const im = d.images || []
          return im.length > 0 && im.every((i) => i.state !== 'processing')
        },
        null,
        { timeout: 420000, polling: 3000 },
      )
      .catch(() => {})
    await page.waitForTimeout(1000)

    const imgStates = await draftImages()
    const okImgs = imgStates.filter((s) => s === 'success').length
    log(
      okImgs >= 5,
      'Шаг 4: изображения сгенерированы',
      `success=${okImgs}/${imgStates.length}`,
    )
    await shot(page, 'step4-done')

    /* ---------- 7. Шаг 5: готовая карточка ---------- */
    const next = btn(page, 'Завершить карточку')
    await next.waitFor({ state: 'visible', timeout: 60000 })
    await next.click()
    await page.waitForSelector('text=успешно создана', { timeout: 30000 }).catch(() => {})
    const banner = await page.locator('text=успешно создана').count()
    log(banner > 0, 'Шаг 5: карточка создана')
    await shot(page, 'step5-ready')
  }

  /* ---------- 8. История ---------- */
  await goto('/studios/product-cards/history')
  await page.waitForSelector('text=История карточек товара', { timeout: 15000 })
  await page.waitForTimeout(500)
  const empty = await page.locator('text=Пока нет созданных карточек').count()
  log(FAST ? true : empty === 0, 'История: список карточек', FAST ? '(FAST)' : 'есть записи')
  await shot(page, 'history')

  /* ---------- 9. Страница карточки (экран 6) ---------- */
  if (!FAST) {
    const first = page.locator('article').first()
    if (await first.count()) {
      await first.click()
      await page.waitForTimeout(1200)
      const tabs = await page.locator('button:has-text("Маркетплейсы")').count()
      const hasSku = await page.locator('text=/SKU:\\s*SKU-/').count()
      log(tabs > 0 && hasSku > 0, 'Экран 6: страница карточки с табами')
      await shot(page, 'card-detail')

      for (const t of ['Контент', 'Изображения', 'Характеристики', 'SEO', 'Маркетплейсы', 'Версии', 'История']) {
        await btn(page, t).click()
        await page.waitForTimeout(300)
      }
      log(errors.length === 0, 'Экран 6: все табы открываются без ошибок')
      await shot(page, 'card-tabs')
    }
  }

  await browser.close()

  /* ---------- Итог ---------- */
  const bad = results.filter((r) => !r.ok)
  console.log('\n' + '='.repeat(60))
  console.log(`Проверок: ${results.length}, провалено: ${bad.length}`)
  if (errors.length) {
    console.log(`\nОшибки консоли (${errors.length}):`)
    ;[...new Set(errors)].slice(0, 10).forEach((e) => console.log('  · ' + e.slice(0, 200)))
  }
  console.log(`Скриншоты: ${SHOTS}`)
  if (bad.length || errors.length) process.exitCode = 1
}

run().catch((e) => {
  console.error('\nСБОЙ ПРОГОНА:', e.message)
  process.exitCode = 1
})
