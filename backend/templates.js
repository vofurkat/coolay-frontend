/**
 * Шаблоны карточек товара.
 *
 * Модель данных. Шаблон привязан к пути категории — массиву уровней, например
 * ['Мужское', 'Рубашки', 'Классические']. Путь хранится массивом, а не строкой
 * «Мужское / Рубашки / Классические», потому что:
 *   - шаблон можно искать по любому префиксу (все шаблоны «Мужское»);
 *   - в названии категории может встретиться разделитель, и разбор строки
 *     сломался бы;
 *   - глубина не ограничена тремя уровнями.
 *
 * Внутри шаблона — набор референсов (references): фото + промт. Их несколько,
 * потому что карточка товара состоит из нескольких кадров (основное фото, вид
 * сзади, детали ткани), и для каждого нужен свой образец и своё описание.
 *
 * Эндпоинты:
 *   GET    /api/templates                 — список (?category=A/B/C, ?q=поиск)
 *   GET    /api/templates/categories      — дерево категорий со счётчиками
 *   POST   /api/templates                 — создать
 *   PATCH  /api/templates/:id             — изменить
 *   DELETE /api/templates/:id             — удалить (с файлами референсов)
 *   POST   /api/templates/:id/duplicate   — копия шаблона
 */
import { load, save, uid, nowIso, saveDataUrl, removeUploadByUrl } from './store.js'

const MAX_NAME = 120
const MAX_PROMPT = 4000
const MAX_REFS = 12
const MAX_LEVELS = 6

function clean(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

/** Нормализация пути категории: убираем пустые уровни и ограничиваем глубину. */
export function normCategory(input) {
  let arr = input
  // Допускаем и строку «Мужское / Рубашки» — так удобнее звать из бота.
  if (typeof input === 'string') arr = input.split('/')
  if (!Array.isArray(arr)) return []
  return arr
    .map((s) => clean(String(s), 60))
    .filter(Boolean)
    .slice(0, MAX_LEVELS)
}

/**
 * Референсы: фото (data URL или уже готовый путь) + промт.
 * Возвращает готовый массив со сохранёнными файлами.
 */
export async function normRefs(input, existing = []) {
  if (!Array.isArray(input)) return existing
  const byId = new Map(existing.map((r) => [r.id, r]))
  const out = []
  for (const raw of input.slice(0, MAX_REFS)) {
    if (!raw || typeof raw !== 'object') continue
    const prompt = clean(raw.prompt, MAX_PROMPT)
    const label = clean(raw.label, MAX_NAME)
    const prev = raw.id ? byId.get(raw.id) : null
    let image = prev?.image || ''

    if (typeof raw.image === 'string' && raw.image.startsWith('data:')) {
      // Новое фото: сохраняем на диск, старое удаляем, чтобы не копить мусор.
      image = await saveDataUrl(raw.image, 'ref')
      if (prev?.image) await removeUploadByUrl(prev.image)
    } else if (typeof raw.image === 'string' && raw.image.startsWith('/api/files/')) {
      image = raw.image
    } else if (typeof raw.image === 'string' && /^https?:\/\//.test(raw.image)) {
      image = raw.image
    }

    // Референс без фото и без промта смысла не имеет.
    if (!image && !prompt) continue
    out.push({ id: prev?.id || raw.id || uid('ref'), image, prompt, label })
  }
  return out
}

export function publicTemplate(t) {
  return {
    id: t.id,
    name: t.name,
    category: t.category,
    categoryPath: t.category.join(' / '),
    description: t.description,
    references: t.references,
    slotHints: t.slotHints || {},
    usageCount: t.usageCount || 0,
    isSystem: !!t.isSystem,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    createdBy: t.createdBy || null,
  }
}

/** Совпадает ли шаблон с запрошенной категорией (по префиксу пути). */
function matchesCategory(tpl, wanted) {
  if (!wanted.length) return true
  if (tpl.category.length < wanted.length) return false
  return wanted.every((lvl, i) => tpl.category[i].toLowerCase() === lvl.toLowerCase())
}

/** Дерево категорий со счётчиком шаблонов на каждом узле. */
export function buildTree(templates) {
  const root = { name: '', path: [], children: [], count: 0 }
  for (const t of templates) {
    let node = root
    root.count++
    for (const level of t.category) {
      let child = node.children.find((c) => c.name.toLowerCase() === level.toLowerCase())
      if (!child) {
        child = { name: level, path: [...node.path, level], children: [], count: 0 }
        node.children.push(child)
      }
      child.count++
      node = child
    }
  }
  const sortRec = (n) => {
    n.children.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    n.children.forEach(sortRec)
  }
  sortRec(root)
  return root.children
}

export async function templatesRouter(req, res, { url, sendJson, readBody, auth }) {
  const path_ = url.pathname
  if (!path_.startsWith('/api/templates')) return false

  if (!auth) {
    sendJson(res, 401, { ok: false, error: 'Требуется вход' })
    return true
  }

  const db = load()
  const cid = auth.client.id
  // Клиент видит свои шаблоны + системные (isSystem — общие для всех, read-only).
  const isVisible = (t) => t.isSystem || t.clientId === cid
  const isMine = (t) => !t.isSystem && t.clientId === cid
  const visible = () => db.templates.filter(isVisible)

  if (path_ === '/api/templates/categories' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, categories: buildTree(visible()) })
    return true
  }

  if (path_ === '/api/templates' && req.method === 'GET') {
    const wanted = normCategory(url.searchParams.get('category') || '')
    const q = (url.searchParams.get('q') || '').trim().toLowerCase()
    let list = visible().filter((t) => matchesCategory(t, wanted))
    if (q) {
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.category.join(' ').toLowerCase().includes(q) ||
          (t.description || '').toLowerCase().includes(q),
      )
    }
    list = [...list].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    sendJson(res, 200, { ok: true, templates: list.map(publicTemplate) })
    return true
  }

  if (path_ === '/api/templates' && req.method === 'POST') {
    let payload
    try {
      payload = JSON.parse(await readBody(req))
    } catch {
      sendJson(res, 400, { ok: false, error: 'Некорректный JSON' })
      return true
    }
    const name = clean(payload.name, MAX_NAME)
    const category = normCategory(payload.category)
    if (!name) {
      sendJson(res, 400, { ok: false, error: 'Укажите название шаблона' })
      return true
    }
    if (!category.length) {
      sendJson(res, 400, { ok: false, error: 'Укажите категорию' })
      return true
    }
    let references
    try {
      references = await normRefs(payload.references, [])
    } catch (e) {
      sendJson(res, 400, { ok: false, error: `Фото референса: ${e.message}` })
      return true
    }
    if (!references.length) {
      sendJson(res, 400, { ok: false, error: 'Добавьте хотя бы один референс — фото или промт' })
      return true
    }
    const tpl = {
      id: uid('tpl'),
      clientId: cid,
      isSystem: false,
      name,
      category,
      description: clean(payload.description, 600),
      references,
      slotHints: payload.slotHints && typeof payload.slotHints === 'object' ? payload.slotHints : {},
      usageCount: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      createdBy: clean(payload.createdBy, 80) || null,
    }
    db.templates.push(tpl)
    await save()
    sendJson(res, 200, { ok: true, template: publicTemplate(tpl) })
    return true
  }

  const mId = /^\/api\/templates\/([A-Za-z0-9_]+)$/.exec(path_)
  if (mId) {
    const tpl = db.templates.find((t) => t.id === mId[1] && isVisible(t))
    if (!tpl) {
      sendJson(res, 404, { ok: false, error: 'Шаблон не найден' })
      return true
    }

    if (req.method === 'GET') {
      sendJson(res, 200, { ok: true, template: publicTemplate(tpl) })
      return true
    }

    // Системные шаблоны клиент менять не может — только дублировать к себе.
    if ((req.method === 'PATCH' || req.method === 'DELETE') && !isMine(tpl)) {
      sendJson(res, 403, { ok: false, error: 'Системный шаблон нельзя изменить — сделайте копию' })
      return true
    }

    if (req.method === 'PATCH') {
      let payload
      try {
        payload = JSON.parse(await readBody(req))
      } catch {
        sendJson(res, 400, { ok: false, error: 'Некорректный JSON' })
        return true
      }
      if (payload.name !== undefined) {
        const n = clean(payload.name, MAX_NAME)
        if (!n) {
          sendJson(res, 400, { ok: false, error: 'Название не может быть пустым' })
          return true
        }
        tpl.name = n
      }
      if (payload.category !== undefined) {
        const c = normCategory(payload.category)
        if (!c.length) {
          sendJson(res, 400, { ok: false, error: 'Категория не может быть пустой' })
          return true
        }
        tpl.category = c
      }
      if (payload.description !== undefined) tpl.description = clean(payload.description, 600)
      if (payload.references !== undefined) {
        let refs
        try {
          refs = await normRefs(payload.references, tpl.references)
        } catch (e) {
          sendJson(res, 400, { ok: false, error: `Фото референса: ${e.message}` })
          return true
        }
        if (!refs.length) {
          sendJson(res, 400, { ok: false, error: 'Нужен хотя бы один референс' })
          return true
        }
        // Файлы удалённых референсов подчищаем, иначе каталог растёт бесконечно.
        const keep = new Set(refs.map((r) => r.image))
        for (const old of tpl.references) {
          if (old.image && !keep.has(old.image)) await removeUploadByUrl(old.image)
        }
        tpl.references = refs
      }
      if (payload.slotHints !== undefined && typeof payload.slotHints === 'object') {
        tpl.slotHints = payload.slotHints
      }
      tpl.updatedAt = nowIso()
      await save()
      sendJson(res, 200, { ok: true, template: publicTemplate(tpl) })
      return true
    }

    if (req.method === 'DELETE') {
      db.templates = db.templates.filter((t) => t.id !== tpl.id)
      // Файл удаляем только если на него не ссылается другой шаблон
      // (дубликаты переиспользуют изображения оригинала).
      const stillUsed = new Set(db.templates.flatMap((t) => t.references.map((r) => r.image)))
      for (const r of tpl.references) {
        if (r.image && !stillUsed.has(r.image)) await removeUploadByUrl(r.image)
      }
      await save()
      sendJson(res, 200, { ok: true })
      return true
    }
  }

  const mDup = /^\/api\/templates\/([A-Za-z0-9_]+)\/duplicate$/.exec(path_)
  if (mDup && req.method === 'POST') {
    const src = db.templates.find((t) => t.id === mDup[1] && isVisible(t))
    if (!src) {
      sendJson(res, 404, { ok: false, error: 'Шаблон не найден' })
      return true
    }
    // Файлы референсов переиспользуем: копия ссылается на те же изображения.
    // Копия системного шаблона становится личным шаблоном клиента.
    const copy = {
      ...src,
      id: uid('tpl'),
      clientId: cid,
      isSystem: false,
      name: `${src.name} (копия)`.slice(0, MAX_NAME),
      references: src.references.map((r) => ({ ...r, id: uid('ref') })),
      usageCount: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    db.templates.push(copy)
    await save()
    sendJson(res, 200, { ok: true, template: publicTemplate(copy) })
    return true
  }

  const mUse = /^\/api\/templates\/([A-Za-z0-9_]+)\/use$/.exec(path_)
  if (mUse && req.method === 'POST') {
    const tpl = db.templates.find((t) => t.id === mUse[1] && isVisible(t))
    if (!tpl) {
      sendJson(res, 404, { ok: false, error: 'Шаблон не найден' })
      return true
    }
    tpl.usageCount = (tpl.usageCount || 0) + 1
    tpl.lastUsedAt = nowIso()
    await save()
    sendJson(res, 200, { ok: true, usageCount: tpl.usageCount })
    return true
  }

  return false
}
