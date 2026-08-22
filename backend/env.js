// Загрузка секретов из .env рядом с бэкендом (без внешних зависимостей).
// Файл .env НЕ коммитится — ключи не должны попадать в репозиторий.
import fs from 'node:fs'
import path from 'node:path'

const ENV_PATH = path.join(import.meta.dirname, '.env')

if (fs.existsSync(ENV_PATH)) {
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const s = line.trim()
    if (!s || s.startsWith('#')) continue
    const eq = s.indexOf('=')
    if (eq === -1) continue
    const key = s.slice(0, eq).trim()
    let val = s.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    // Переменные окружения процесса имеют приоритет над .env
    if (!process.env[key]) process.env[key] = val
  }
}

/** Обязательный секрет: без него запросы к kie.ai бессмысленны. */
export function requireKieKey() {
  const key = process.env.KIE_API_KEY
  if (!key) {
    throw new Error(
      'KIE_API_KEY не задан. Создайте coolay-backend/.env со строкой KIE_API_KEY=<ключ> ' +
        'или экспортируйте переменную окружения.',
    )
  }
  return key
}
