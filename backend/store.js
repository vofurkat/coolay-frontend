/**
 * Хранилище данных Coolay — JSON-файл + атомарная запись.
 *
 * ПОЧЕМУ НЕ СУБД. Бэкенд намеренно без внешних зависимостей: package.json пуст,
 * node_modules нет, deploy.sh копирует только .js-файлы. Добавление БД сломало бы
 * эту схему деплоя. Конкретно проверено:
 *   - node:sqlite в Node 20 отсутствует (появился в 22);
 *   - better-sqlite3 требует нативной сборки (>2 мин, node-gyp на прод-машине);
 *   - MariaDB на 3306 есть, но это чужой инстанс с посторонними базами.
 * Для объёмов уровня «шаблоны + сотрудники + проекты команды» JSON-файла
 * достаточно с большим запасом.
 *
 * ПОЧЕМУ АТОМАРНО. Прямой fs.writeFile в тот же файл при падении процесса или
 * двух одновременных запросах оставляет обрезанный JSON — данные теряются
 * безвозвратно. Поэтому пишем во временный файл и делаем rename (на одной ФС это
 * атомарная операция), плюс очередь записи, чтобы параллельные запросы не
 * перетирали друг друга.
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

const DATA_DIR = process.env.COOLAY_DATA_DIR || path.join(import.meta.dirname, 'data')
const DB_FILE = path.join(DATA_DIR, 'coolay.json')
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads')

/** Структура базы по умолчанию. Новые ключи добавляются миграцией в load(). */
function emptyDb() {
  return {
    version: 5,
    templates: [],
    employees: [],
    projects: [],
    shares: [],
    activity: [],
    usage: { plan: 'pro', limit: 1000, used: 0, periodStart: new Date().toISOString() },
    botSessions: [],
    // ─── v5: карточки и задания генерации переехали на сервер ───
    // Раньше карточки жили в localStorage браузера, поэтому история была
    // не видна ни другому сотруднику, ни боту, ни после смены устройства —
    // и сравнивать новый товар было не с чем.
    skuCards: [],
    // Задания генерации изображений. Нужны, потому что слоты «на модели»
    // больше не независимы: back/lifestyle ждут готовое фото-якорь front,
    // чтобы переиспользовать ту же модель. Состояние такого конвейера нельзя
    // держать в памяти процесса — pm2 restart потерял бы все активные задания.
    skuJobs: [],
    // ─── v4: мультиклиентность + супер-админка ───
    clients: [], // компании-клиенты SaaS: тариф, кредиты, статус
    accounts: [], // логины клиентов (email+пароль / google)
    sessions: [], // сессии клиентских аккаунтов
    usageLog: [], // журнал генераций: кто, что, сколько кредитов
    plans: [], // тарифы (управляются из /sadmin)
    sadminUsers: [], // пользователи супер-админки
    sadminSessions: [], // их сессии
    sadminLog: [], // журнал действий админов платформы
  }
}

/**
 * Миграция v3 → v4: раньше данные были общие на весь сервер, теперь всё
 * принадлежит клиенту. Существующие данные (demo-стенд) переезжают к
 * первому клиенту «Coolay Demo», чтобы ничего не потерять.
 */
function migrateV4(db) {
  if (db.clients.length) return
  const hasLegacyData =
    db.employees.length || db.projects.length || db.templates.length || (db.usage?.used || 0) > 0
  if (!hasLegacyData) return
  const demo = {
    id: 'cli_demo',
    name: 'Coolay Demo',
    email: 'demo@coolay.studio',
    plan: db.usage?.plan || 'pro',
    credits: {
      limit: db.usage?.limit || 1000,
      used: db.usage?.used || 0,
      extra: 0,
      periodStart: db.usage?.periodStart || new Date().toISOString(),
    },
    status: 'active',
    createdAt: new Date().toISOString(),
    lastActiveAt: null,
  }
  db.clients.push(demo)
  for (const col of ['employees', 'projects', 'shares', 'templates', 'activity']) {
    for (const item of db[col]) {
      if (!item.clientId) item.clientId = demo.id
    }
  }
}

let db = null
/**
 * Цепочка записи. Каждый save() встаёт в конец очереди, поэтому одновременные
 * запросы не перетирают файл друг друга.
 */
let writeChain = Promise.resolve()

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}

/** Загрузка базы с диска (один раз за время жизни процесса). */
export function load() {
  if (db) return db
  ensureDirs()
  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))
    } catch (e) {
      // Битый JSON не удаляем: сохраняем рядом, иначе данные пропадут без следа.
      const bak = `${DB_FILE}.corrupt-${Date.now()}`
      try {
        fs.renameSync(DB_FILE, bak)
        console.error(`[store] битый JSON, сохранён как ${bak}: ${e.message}`)
      } catch {
        console.error(`[store] битый JSON и не удалось сохранить копию: ${e.message}`)
      }
      db = emptyDb()
    }
  } else {
    db = emptyDb()
  }
  // Миграция: дополняем недостающие ключи, не теряя существующие данные.
  const base = emptyDb()
  for (const [k, v] of Object.entries(base)) {
    if (db[k] === undefined) db[k] = v
  }
  migrateV4(db)
  db.version = base.version
  return db
}

/** Атомарное сохранение: пишем во временный файл, затем rename. */
export function save() {
  const snapshot = JSON.stringify(db, null, 2)
  writeChain = writeChain.then(async () => {
    ensureDirs()
    const tmp = `${DB_FILE}.tmp-${process.pid}-${Date.now()}`
    await fsp.writeFile(tmp, snapshot, 'utf8')
    await fsp.rename(tmp, DB_FILE)
  })
  return writeChain
}

export function uid(prefix = 'id') {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`
}

export function nowIso() {
  return new Date().toISOString()
}

/* ─────────────────────────── Загрузка файлов ─────────────────────────── */

const MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}
const MAX_IMAGE_BYTES = 12 * 1024 * 1024

/**
 * Сохраняет data URL как файл и возвращает публичный путь /api/files/<имя>.
 *
 * Референсные фото шаблонов нельзя держать в самой базе: base64 в JSON раздувает
 * файл в разы и заставляет перезаписывать всё при каждом сохранении.
 */
export async function saveDataUrl(dataUrl, tag = 'img') {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(dataUrl || '')
  if (!m) throw new Error('BAD_DATA_URL')
  const ext = MIME_EXT[m[1].toLowerCase()]
  if (!ext) throw new Error('UNSUPPORTED_IMAGE_TYPE')
  const buf = Buffer.from(m[2], 'base64')
  if (!buf.length) throw new Error('EMPTY_IMAGE')
  if (buf.length > MAX_IMAGE_BYTES) throw new Error('IMAGE_TOO_LARGE')
  ensureDirs()
  const name = `${tag}_${crypto.randomBytes(10).toString('hex')}.${ext}`
  await fsp.writeFile(path.join(UPLOAD_DIR, name), buf)
  return `/api/files/${name}`
}

/**
 * Отдаёт ранее сохранённый файл.
 * basename обязателен: без него «../../etc/passwd» вышел бы за пределы каталога.
 */
export function resolveUpload(name) {
  const safe = path.basename(String(name || ''))
  if (!safe || safe.startsWith('.')) return null
  const full = path.join(UPLOAD_DIR, safe)
  if (!full.startsWith(UPLOAD_DIR)) return null
  if (!fs.existsSync(full)) return null
  return full
}

export const CONTENT_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

/**
 * Читает локальную загрузку обратно в data:-URL.
 *
 * Нужно для шаблонов: референсы лежат на нашем диске как /api/files/xxx.png,
 * а генератор изображений (kie.ai) умеет работать только с ПУБЛИЧНЫМИ URL и
 * сам наш файл скачать не может — на демо-стенде путь может быть вообще
 * недоступен извне. Поэтому референс сначала читается в data:-URL, потом
 * заливается в хранилище kie.ai обычным uploadImage().
 *
 * Возвращает null, если файла нет или расширение неизвестно, — вызывающий
 * код тогда просто генерирует без референса, а не падает.
 */
export async function readUploadAsDataUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('/api/files/')) return null
  const full = resolveUpload(url.slice('/api/files/'.length))
  if (!full) return null
  const ext = (full.split('.').pop() || '').toLowerCase()
  const mime = CONTENT_TYPES[ext]
  if (!mime) return null
  try {
    const buf = await fsp.readFile(full)
    if (!buf.length) return null
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

/** Удаляет файл загрузки по публичному пути. Ошибки игнорируем: файла может уже не быть. */
export async function removeUploadByUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('/api/files/')) return
  const full = resolveUpload(url.slice('/api/files/'.length))
  if (!full) return
  try {
    await fsp.unlink(full)
  } catch {
    /* уже удалён */
  }
}
