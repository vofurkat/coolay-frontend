/**
 * Telegram-бот @coolay_bot + Mini App.
 *
 * КАК РАБОТАЕТ ДОСТУП. Администратор добавляет сотрудника с номером телефона в
 * разделе «Настройки → Пользователи». При /start бот просит поделиться контактом
 * (кнопка request_contact) и сверяет номер с базой:
 *   - номера нет в базе       → доступ закрыт, объясняем, что делать;
 *   - сотрудник заблокирован  → доступ закрыт;
 *   - номер найден            → привязываем telegram_id и открываем работу.
 *
 * ПОЧЕМУ ИМЕННО request_contact, а не ввод номера текстом: текст пользователь
 * может написать любой, включая чужой. Контакт же формирует сам Telegram из
 * аккаунта, подделать его в обычном сообщении нельзя.
 *
 * ПРОВЕРКА ПОДЛИННОСТИ у Mini App обязательна (validateInitData): initData
 * приходит из браузера, и без проверки HMAC любой мог бы подставить чужой
 * telegram_id в запросе и получить доступ к данным другого сотрудника.
 *
 * Эндпоинты:
 *   POST /api/telegram/webhook        — приём обновлений от Telegram
 *   POST /api/telegram/setup          — установка webhook и кнопки меню
 *   GET  /api/telegram/status         — состояние подключения
 *   POST /api/telegram/miniapp/auth   — вход в мини-приложение по initData
 *   POST /api/telegram/miniapp/sku    — создание SKU из мини-приложения
 */
import crypto from 'node:crypto'
import { load, save, uid, nowIso, saveDataUrl, readUploadAsDataUrl } from './store.js'
import { normPhone, usageState, logActivity } from './team.js'
import { consumeCredits } from './plans.js'
import { skuAnalyze, skuContent } from './sku.js'
import { createSkuJob, getSkuJob } from './skujobs.js'
import { buildCard } from './cards.js'

const API = 'https://api.telegram.org'

function token() {
  return process.env.TELEGRAM_BOT_TOKEN || ''
}
function webhookSecret() {
  return process.env.TELEGRAM_WEBHOOK_SECRET || ''
}
function publicBase() {
  return (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '')
}

/**
 * Загрузки хранятся под относительным путём `/api/files/<имя>`, а kie.ai
 * скачивает картинку сам — ему нужен абсолютный HTTPS-адрес. Поэтому перед
 * постановкой задания путь достраивается до полного через PUBLIC_BASE_URL.
 */
function absUpload(u) {
  const v = String(u || '')
  if (!v) return ''
  if (/^https?:\/\//.test(v)) return v
  const base = publicBase()
  return base && v.startsWith('/') ? `${base}${v}` : ''
}

/** Обратное преобразование: абсолютный адрес загрузки → относительный путь. */
function relUpload(u) {
  const v = String(u || '')
  if (v.startsWith('/api/files/')) return v
  const i = v.indexOf('/api/files/')
  return i >= 0 ? v.slice(i) : ''
}

async function tg(method, payload) {
  const t = token()
  if (!t) throw new Error('TELEGRAM_BOT_TOKEN не задан')
  const resp = await fetch(`${API}/bot${t}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  })
  const data = await resp.json().catch(() => ({}))
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description || resp.status}`)
  return data.result
}

/** Скачивание файла из Telegram → data URL (для передачи в существующий SKU-конвейер). */
async function downloadTelegramFile(fileId) {
  const t = token()
  const info = await tg('getFile', { file_id: fileId })
  const resp = await fetch(`${API}/file/bot${t}/${info.file_path}`)
  if (!resp.ok) throw new Error(`Не удалось скачать файл: ${resp.status}`)
  const buf = Buffer.from(await resp.arrayBuffer())
  const ext = (info.file_path.split('.').pop() || 'jpg').toLowerCase()
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
  return `data:${mime};base64,${buf.toString('base64')}`
}

/* ─────────────────── Проверка подлинности Mini App ─────────────────── */

/**
 * Проверка initData по алгоритму Telegram:
 *   secret = HMAC_SHA256(key="WebAppData", data=bot_token)
 *   hash   = HMAC_SHA256(key=secret, data=отсортированные пары k=v через \n)
 *
 * Сравнение через timingSafeEqual — обычное === утекает информацию по времени
 * выполнения и теоретически позволяет подобрать хеш побайтово.
 */
export function validateInitData(initData, maxAgeSec = 86400) {
  const t = token()
  if (!t || typeof initData !== 'string' || !initData) return null
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return null
  params.delete('hash')
  // signature появляется у Telegram-подписи третьей стороной и в расчёт не входит
  params.delete('signature')

  const pairs = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join('\n')

  const secret = crypto.createHmac('sha256', 'WebAppData').update(t).digest()
  const calc = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex')

  const a = Buffer.from(calc, 'hex')
  const b = Buffer.from(hash, 'hex')
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null

  // Просроченный initData отклоняем: перехваченная строка иначе работала бы вечно.
  const authDate = Number(params.get('auth_date') || 0)
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null

  try {
    return JSON.parse(params.get('user') || 'null')
  } catch {
    return null
  }
}

/* ─────────────────── Доступ сотрудника ─────────────────── */

function findByPhone(db, phone) {
  const p = normPhone(phone)
  if (!p) return null
  // Сверяем и по последним 9 цифрам: у одного и того же номера может отличаться
  // код страны/оператора в записи администратора и в аккаунте Telegram.
  const tail = p.slice(-9)
  return (
    db.employees.find((e) => e.phone === p) ||
    db.employees.find((e) => e.phone.slice(-9) === tail && tail.length === 9) ||
    null
  )
}


/**
 * Клиент, которому принадлежит сотрудник бота. Квота и кредиты теперь
 * на клиенте, поэтому все проверки в боте идут через него.
 */
function clientOf(db, emp) {
  return db.clients.find((c) => c.id === emp?.clientId) || db.clients.find((c) => c.id === 'cli_demo') || db.clients[0] || null
}

function findByTelegramId(db, tgId) {
  return db.employees.find((e) => e.telegramId === tgId) || null
}

const KB_CONTACT = {
  keyboard: [[{ text: '📱 Поделиться номером', request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
}

function mainKeyboard() {
  const base = publicBase()
  const rows = [[{ text: '🖼 Создать карточку' }, { text: '📊 Мои проекты' }]]
  if (base) {
    // web_app работает только по HTTPS — иначе Telegram кнопку не покажет.
    rows.push([{ text: '🚀 Открыть приложение', web_app: { url: `${base}/tg` } }])
  }
  rows.push([{ text: 'ℹ️ Помощь' }])
  return { keyboard: rows, resize_keyboard: true }
}

function session(db, chatId) {
  let s = db.botSessions.find((x) => x.chatId === chatId)
  if (!s) {
    s = { chatId, state: 'idle', photos: [], updatedAt: nowIso() }
    db.botSessions.push(s)
  }
  return s
}

async function send(chatId, text, extra = {}) {
  return tg('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    ...extra,
  })
}

const DENIED =
  'У вас нет доступа к Coolay.\n\n' +
  'Доступ выдаёт администратор: он добавляет вас в разделе «Настройки → Пользователи» ' +
  'и указывает <b>тот же номер</b>, что привязан к вашему Telegram.\n\n' +
  'Если вас уже добавили — проверьте, что номер совпадает, и нажмите /start ещё раз.'

/* ─────────────────── Обработка обновлений ─────────────────── */

async function handleUpdate(db, update) {
  const msg = update.message || update.edited_message
  if (!msg) return
  const chatId = msg.chat.id
  const from = msg.from || {}
  const s = session(db, chatId)
  s.updatedAt = nowIso()

  // 1. Контакт — единственный способ подтвердить номер.
  if (msg.contact) {
    // Чужой контакт не принимаем: user_id в контакте должен совпасть с отправителем.
    if (msg.contact.user_id && msg.contact.user_id !== from.id) {
      await send(chatId, 'Нужен именно ваш номер. Нажмите кнопку «Поделиться номером».', {
        reply_markup: KB_CONTACT,
      })
      return
    }
    const emp = findByPhone(db, msg.contact.phone_number)
    if (!emp) {
      await send(chatId, DENIED, { reply_markup: { remove_keyboard: true } })
      return
    }
    if (emp.status === 'blocked') {
      await send(chatId, 'Ваш доступ приостановлен. Обратитесь к администратору.', {
        reply_markup: { remove_keyboard: true },
      })
      return
    }
    emp.telegramId = from.id
    emp.telegramUsername = from.username || ''
    emp.botVerifiedAt = nowIso()
    emp.status = emp.status === 'invited' ? 'active' : emp.status
    emp.lastActive = nowIso()
    s.employeeId = emp.id
    s.state = 'idle'
    logActivity(db, {
      type: 'bot_login',
      employeeId: emp.id,
      text: `${emp.fullName} вошёл через Telegram`,
    })
    await save()
    await send(
      chatId,
      `Доступ подтверждён, ${emp.fullName}! 🎉\n\n` +
        'Отправьте фото товара — соберу карточку: название, описание, характеристики и SEO.',
      { reply_markup: mainKeyboard() },
    )
    return
  }

  const emp = s.employeeId
    ? db.employees.find((e) => e.id === s.employeeId)
    : findByTelegramId(db, from.id)
  const text = (msg.text || '').trim()

  // 2. /start — приветствие и проверка доступа.
  if (text.startsWith('/start')) {
    if (emp && emp.status !== 'blocked') {
      s.employeeId = emp.id
      emp.lastActive = nowIso()
      await save()
      await send(
        chatId,
        `С возвращением, ${emp.fullName}!\n\nОтправьте фото товара, и я соберу карточку.`,
        { reply_markup: mainKeyboard() },
      )
      return
    }
    await save()
    await send(
      chatId,
      '<b>Coolay</b> — карточки товара для маркетплейсов.\n\n' +
        'Чтобы начать, подтвердите номер телефона — по нему я проверю доступ в базе сотрудников.',
      { reply_markup: KB_CONTACT },
    )
    return
  }

  // Дальше всё только для подтверждённых сотрудников.
  if (!emp || emp.status === 'blocked') {
    await send(chatId, DENIED, { reply_markup: KB_CONTACT })
    return
  }
  s.employeeId = emp.id
  emp.lastActive = nowIso()

  // 3. Фото товара.
  if (msg.photo && msg.photo.length) {
    if (emp.canGenerate === false) {
      await save()
      await send(chatId, 'Генерации для вашей учётной записи отключены администратором.')
      return
    }
    const st = usageState(db, clientOf(db, emp))
    if (st.left <= 0) {
      await save()
      await send(
        chatId,
        `Генерации на плане <b>${st.planLabel}</b> закончились (${st.used} из ${st.limit}).\n` +
          'Обратитесь к администратору для смены плана.',
      )
      return
    }
    // Берём самое большое разрешение — последний элемент массива.
    const best = msg.photo[msg.photo.length - 1]
    let dataUrl
    try {
      dataUrl = await downloadTelegramFile(best.file_id)
    } catch (e) {
      await send(chatId, `Не удалось получить фото: ${e.message}`)
      return
    }
    const url = await saveDataUrl(dataUrl, 'tg')
    s.photos = [...(s.photos || []), url].slice(-10)
    s.state = 'has_photo'
    await save()

    const base = publicBase()
    const extra = base
      ? {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🚀 Собрать карточку', web_app: { url: `${base}/tg?photo=${encodeURIComponent(url)}` } }],
            ],
          },
        }
      : {}
    await send(
      chatId,
      `Фото принято ✅ (всего ${s.photos.length})\n\n` +
        `Осталось генераций: <b>${st.left}</b> из ${st.limit}.\n` +
        'Нажмите «Собрать карточку» — откроется приложение с этим фото.',
      extra,
    )
    return
  }

  // 4. Кнопки главного меню.
  if (text === '🖼 Создать карточку' || text === '/new') {
    await save()
    await send(chatId, 'Отправьте фото товара — можно несколько подряд.', {
      reply_markup: mainKeyboard(),
    })
    return
  }

  if (text === '📊 Мои проекты' || text === '/projects') {
    const mine = db.projects.filter(
      (p) => p.ownerId === emp.id || db.shares.some((sh) => sh.projectId === p.id && sh.employeeId === emp.id),
    )
    await save()
    if (!mine.length) {
      await send(chatId, 'Пока нет проектов. Отправьте фото товара, чтобы создать первый.')
      return
    }
    const list = mine
      .slice(0, 10)
      .map((p, i) => `${i + 1}. <b>${p.name}</b> — карточек: ${(p.cardIds || []).length}`)
      .join('\n')
    await send(chatId, `Ваши проекты:\n\n${list}`)
    return
  }

  if (text === 'ℹ️ Помощь' || text === '/help') {
    const st = usageState(db, clientOf(db, emp))
    await save()
    await send(
      chatId,
      '<b>Как работать</b>\n\n' +
        '1. Отправьте фото товара\n' +
        '2. Нажмите «Собрать карточку»\n' +
        '3. Проверьте результат и сохраните в проект\n\n' +
        `План: <b>${st.planLabel}</b>, осталось ${st.left} из ${st.limit}.\n` +
        `Вы вошли как: ${emp.fullName}`,
      { reply_markup: mainKeyboard() },
    )
    return
  }

  await save()
  await send(
    chatId,
    'Отправьте <b>фото товара</b>, чтобы собрать карточку, или выберите действие на клавиатуре.',
    { reply_markup: mainKeyboard() },
  )
}

/* ─────────────────── Роутер ─────────────────── */

export async function telegramRouter(req, res, { url, sendJson, readBody }) {
  const p = url.pathname
  const db = load()

  if (p === '/api/telegram/webhook' && req.method === 'POST') {
    // Проверка секрета: без неё любой мог бы отправить поддельное обновление и
    // выдать себе доступ от имени сотрудника.
    const got = req.headers['x-telegram-bot-api-secret-token']
    if (webhookSecret() && got !== webhookSecret()) {
      sendJson(res, 401, { ok: false })
      return true
    }
    let update
    try {
      update = JSON.parse(await readBody(req))
    } catch {
      sendJson(res, 200, { ok: true }) // Telegram не должен повторять битое обновление
      return true
    }
    // Отвечаем сразу: Telegram ждёт ответ за секунды, иначе повторяет доставку.
    sendJson(res, 200, { ok: true })
    handleUpdate(db, update).catch((e) => console.error('[telegram] ошибка обработки:', e.message))
    return true
  }

  if (p === '/api/telegram/status' && req.method === 'GET') {
    const t = token()
    if (!t) {
      sendJson(res, 200, { ok: true, configured: false, error: 'TELEGRAM_BOT_TOKEN не задан' })
      return true
    }
    try {
      const me = await tg('getMe', {})
      const hook = await tg('getWebhookInfo', {})
      sendJson(res, 200, {
        ok: true,
        configured: true,
        bot: { id: me.id, username: me.username, name: me.first_name },
        webhook: { url: hook.url || '', pending: hook.pending_update_count || 0, lastError: hook.last_error_message || '' },
        miniAppUrl: publicBase() ? `${publicBase()}/tg` : '',
        verified: db.employees.filter((e) => e.telegramId).length,
        total: db.employees.length,
      })
    } catch (e) {
      sendJson(res, 200, { ok: true, configured: false, error: e.message })
    }
    return true
  }

  if (p === '/api/telegram/setup' && req.method === 'POST') {
    const base = publicBase()
    if (!base) {
      sendJson(res, 400, { ok: false, error: 'PUBLIC_BASE_URL не задан в .env' })
      return true
    }
    try {
      await tg('setWebhook', {
        url: `${base}/api/telegram/webhook`,
        secret_token: webhookSecret() || undefined,
        allowed_updates: ['message', 'edited_message'],
        drop_pending_updates: true,
      })
      await tg('setChatMenuButton', {
        menu_button: { type: 'web_app', text: 'Coolay', web_app: { url: `${base}/tg` } },
      })
      await tg('setMyCommands', {
        commands: [
          { command: 'start', description: 'Начало работы и проверка доступа' },
          { command: 'new', description: 'Создать карточку товара' },
          { command: 'projects', description: 'Мои проекты' },
          { command: 'help', description: 'Помощь' },
        ],
      })
      sendJson(res, 200, { ok: true, webhook: `${base}/api/telegram/webhook` })
    } catch (e) {
      sendJson(res, 500, { ok: false, error: e.message })
    }
    return true
  }

  if (p === '/api/telegram/miniapp/auth' && req.method === 'POST') {
    let d
    try {
      d = JSON.parse(await readBody(req))
    } catch {
      sendJson(res, 400, { ok: false, error: 'Некорректный JSON' })
      return true
    }
    const tgUser = validateInitData(d.initData)
    if (!tgUser) {
      sendJson(res, 401, { ok: false, error: 'Проверка Telegram не пройдена' })
      return true
    }
    const emp = findByTelegramId(db, tgUser.id)
    if (!emp) {
      sendJson(res, 403, {
        ok: false,
        error: 'Доступ не выдан. Откройте бота, нажмите /start и подтвердите номер телефона.',
        needsPhone: true,
      })
      return true
    }
    if (emp.status === 'blocked') {
      sendJson(res, 403, { ok: false, error: 'Доступ приостановлен администратором' })
      return true
    }
    emp.lastActive = nowIso()
    const s = session(db, tgUser.id)
    s.employeeId = emp.id
    await save()
    sendJson(res, 200, {
      ok: true,
      employee: {
        id: emp.id,
        fullName: emp.fullName,
        role: emp.role,
        canGenerate: emp.canGenerate !== false,
      },
      photos: s.photos || [],
      usage: usageState(db, clientOf(db, emp)),
      telegram: { id: tgUser.id, firstName: tgUser.first_name, username: tgUser.username || '' },
    })
    return true
  }

  if (p === '/api/telegram/miniapp/photos' && req.method === 'POST') {
    let d
    try {
      d = JSON.parse(await readBody(req))
    } catch {
      sendJson(res, 400, { ok: false, error: 'Некорректный JSON' })
      return true
    }
    const tgUser = validateInitData(d.initData)
    if (!tgUser) {
      sendJson(res, 401, { ok: false, error: 'Проверка Telegram не пройдена' })
      return true
    }
    const s = session(db, tgUser.id)
    if (d.clear) s.photos = []
    await save()
    sendJson(res, 200, { ok: true, photos: s.photos || [] })
    return true
  }

  /**
   * Создание карточки из Mini App.
   *
   * ПОЧЕМУ ОТДЕЛЬНЫЙ ЭНДПОИНТ, а не переиспользование /api/sku/*: у мини-
   * приложения нет cookie-сессии Coolay — сотрудник вообще может не иметь
   * пароля на сайте. Право на работу подтверждается initData + привязанным
   * номером телефона. Поэтому здесь своя авторизация, но конвейер генерации,
   * списание кредитов и хранилище карточек — ровно те же, что у сайта.
   *
   * Шаги (step): 'analyze' → 'generate' → 'poll' → 'save'.
   */
  if (p === '/api/telegram/miniapp/sku' && req.method === 'POST') {
    let d
    try {
      d = JSON.parse(await readBody(req))
    } catch (e) {
      const tooBig = e.message === 'PAYLOAD_TOO_LARGE'
      sendJson(res, tooBig ? 413 : 400, {
        ok: false,
        error: tooBig ? 'Фото слишком большое' : 'Некорректный JSON',
      })
      return true
    }

    const tgUser = validateInitData(d.initData)
    if (!tgUser) {
      sendJson(res, 401, { ok: false, error: 'Проверка Telegram не пройдена' })
      return true
    }

    // Доступ: сотрудник должен быть найден по привязанному telegram_id,
    // не заблокирован и иметь право на генерацию.
    const emp = findByTelegramId(db, tgUser.id)
    if (!emp) {
      sendJson(res, 403, {
        ok: false,
        error: 'Доступ не выдан. Откройте бота, нажмите /start и подтвердите номер телефона.',
        needsPhone: true,
      })
      return true
    }
    if (emp.status === 'blocked') {
      sendJson(res, 403, { ok: false, error: 'Доступ приостановлен администратором' })
      return true
    }
    if (emp.canGenerate === false) {
      sendJson(res, 403, { ok: false, error: 'Генерации для вашей учётной записи отключены' })
      return true
    }

    const client = clientOf(db, emp)
    if (!client) {
      sendJson(res, 403, { ok: false, error: 'Аккаунт клиента не найден' })
      return true
    }
    emp.lastActive = nowIso()

    /** Списание кредитов сотрудника — та же функция, что на сайте, source='telegram'. */
    const charge = (count, tool) =>
      consumeCredits(load(), client, {
        count,
        tool,
        accountId: null,
        source: 'telegram',
        meta: { employeeId: emp.id, telegramId: tgUser.id },
      })

    const step = String(d.step || '')

    try {
      /* ── Анализ фото ── */
      if (step === 'analyze') {
        // Фото бот уже сохранил в uploads и прислал URL — читаем обратно в
        // data URL, потому что анализатору нужны сами байты изображения.
        let dataUrl = typeof d.image === 'string' && d.image.startsWith('data:image/') ? d.image : ''
        if (!dataUrl && d.imageUrl) {
          dataUrl = await readUploadAsDataUrl(relUpload(d.imageUrl))
        }
        if (!dataUrl) {
          sendJson(res, 400, { ok: false, error: 'Нужно фото товара' })
          return true
        }
        if (!(await charge(1, 'sku:analyze'))) {
          sendJson(res, 402, { ok: false, error: 'Генерации закончились — обратитесь к администратору' })
          return true
        }
        const r = await skuAnalyze({ image: dataUrl })
        await save()
        sendJson(res, r.status, r.body)
        return true
      }

      /* ── Запуск генерации кадров ── */
      if (step === 'generate') {
        const slots = Array.isArray(d.slots) && d.slots.length ? d.slots : ['main', 'front']
        const imageUrl = absUpload(d.imageUrl)
        if (!imageUrl) {
          sendJson(res, 400, {
            ok: false,
            error: publicBase()
              ? 'Нужно фото товара'
              : 'PUBLIC_BASE_URL не задан — генерация из Telegram недоступна',
          })
          return true
        }
        const r = await createSkuJob({
          clientId: client.id,
          accountId: null,
          items: [
            {
              imageUrl,
              productPrompt: d.productPrompt || '',
              gender: d.gender || '',
              templateId: d.templateId || '',
              slots,
              label: d.label || '',
            },
          ],
          charge,
        })
        // Привязываем задание к сессии, чтобы мини-приложение могло вернуться
        // к нему после закрытия окна Telegram.
        if (r.job) {
          const s = session(db, tgUser.id)
          s.jobId = r.job.id
          s.employeeId = emp.id
        }
        await save()
        sendJson(res, r.status, r.body)
        return true
      }

      /* ── Опрос состояния ── */
      if (step === 'poll') {
        const r = await getSkuJob({ clientId: client.id, id: String(d.jobId || '') })
        sendJson(res, r.status, r.body)
        return true
      }

      /* ── Текстовое наполнение ── */
      if (step === 'content') {
        if (!d.analysis || typeof d.analysis !== 'object') {
          sendJson(res, 400, { ok: false, error: 'Нет данных анализа' })
          return true
        }
        if (!(await charge(1, 'sku:content'))) {
          sendJson(res, 402, { ok: false, error: 'Генерации закончились — обратитесь к администратору' })
          return true
        }
        const r = await skuContent({
          analysis: d.analysis,
          tone: d.tone,
          userNotes: d.userNotes,
          withAdvantages: d.withAdvantages,
          langs: d.langs,
        })
        await save()
        sendJson(res, r.status, r.body)
        return true
      }

      /* ── Сохранение карточки ── */
      if (step === 'save') {
        const card = buildCard(d.card || {}, {
          clientId: client.id,
          author: emp.fullName,
          source: 'telegram',
        })
        db.skuCards.unshift(card)
        if (db.skuCards.length > 2000) db.skuCards.length = 2000
        logActivity(db, {
          clientId: client.id,
          type: 'card_created',
          employeeId: emp.id,
          text: `${emp.fullName} создал карточку ${card.sku} через Telegram`,
        })
        // Сессия отработала: фото и задание больше не нужны, иначе при
        // следующем запуске мини-приложение подхватит прошлый товар.
        const s = session(db, tgUser.id)
        s.photos = []
        s.jobId = null
        s.state = 'idle'
        await save()
        sendJson(res, 200, { ok: true, card, usage: usageState(db, client) })
        return true
      }

      sendJson(res, 400, { ok: false, error: `Неизвестный шаг: ${step || '—'}` })
      return true
    } catch (e) {
      console.error('[telegram/sku]', e.message)
      sendJson(res, 502, { ok: false, error: 'Не удалось обработать запрос — попробуйте ещё раз' })
      return true
    }
  }

  /** Уведомление сотрудника в Telegram — например, о выдаче доступа к проекту. */
  if (p === '/api/telegram/notify' && req.method === 'POST') {
    let d
    try {
      d = JSON.parse(await readBody(req))
    } catch {
      sendJson(res, 400, { ok: false, error: 'Некорректный JSON' })
      return true
    }
    const emp = db.employees.find((e) => e.id === d.employeeId)
    if (!emp?.telegramId) {
      sendJson(res, 400, { ok: false, error: 'Сотрудник не подключил Telegram' })
      return true
    }
    try {
      await send(emp.telegramId, String(d.text || '').slice(0, 3500))
      sendJson(res, 200, { ok: true })
    } catch (e) {
      sendJson(res, 500, { ok: false, error: e.message })
    }
    return true
  }

  return false
}
