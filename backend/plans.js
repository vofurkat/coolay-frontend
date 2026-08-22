/**
 * Тарифы платформы.
 *
 * Раньше планы были захардкожены в team.js (PLANS). Теперь это данные:
 * супер-админ управляет ими из /sadmin/plans, а стартовый набор создаётся
 * миграцией при первом обращении. Каждый тариф даёт месячный пакет
 * кредит-токенов; кредиты списываются при генерациях.
 */
import { load, save, nowIso } from './store.js'

const DEFAULT_PLANS = [
  { key: 'free', label: 'Free', monthlyCredits: 50, price: 0, currency: 'USD', description: 'Для знакомства с платформой' },
  { key: 'start', label: 'Start', monthlyCredits: 300, price: 19, currency: 'USD', description: 'Для небольших магазинов' },
  { key: 'pro', label: 'Pro', monthlyCredits: 1000, price: 49, currency: 'USD', description: 'Для растущих команд' },
  { key: 'business', label: 'Business', monthlyCredits: 5000, price: 149, currency: 'USD', description: 'Для крупных каталогов' },
]

/** Гарантирует, что в базе есть стартовые тарифы (не перетирая правки админа). */
export function ensurePlans(db = load()) {
  if (!db.plans.length) {
    db.plans = DEFAULT_PLANS.map((p) => ({ ...p, updatedAt: nowIso() }))
  }
  return db.plans
}

export function getPlan(key) {
  const plans = ensurePlans()
  return plans.find((p) => p.key === key) || plans[0]
}

export function listPlans() {
  return ensurePlans()
}

/**
 * Состояние кредитов клиента — единый расчёт для клиентской части и админки.
 * extra — кредиты, начисленные админом сверх тарифа (не сгорают при смене плана).
 */
export function clientUsage(client) {
  const plan = getPlan(client.plan)
  const limit = (client.credits?.limit || 0) + (client.credits?.extra || 0)
  const used = Math.max(0, client.credits?.used || 0)
  return {
    plan: client.plan,
    planLabel: plan?.label || client.plan,
    limit,
    used,
    left: Math.max(0, limit - used),
    percent: limit ? Math.min(100, Math.round((used / limit) * 100)) : 0,
    periodStart: client.credits?.periodStart || null,
    plans: listPlans().map((p) => ({
      key: p.key,
      label: p.label,
      limit: p.monthlyCredits,
      price: p.price,
      currency: p.currency,
    })),
  }
}

/**
 * Списание кредитов за генерацию + запись в журнал использования.
 * Возвращает false, если кредитов не хватает — вызывающий роут отвечает 402.
 */
export async function consumeCredits(db, client, { count = 1, tool, accountId, source = 'web', meta }) {
  const u = clientUsage(client)
  if (u.left < count) return false
  client.credits.used = (client.credits.used || 0) + count
  db.usageLog.unshift({
    id: `use_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    clientId: client.id,
    accountId: accountId || null,
    tool: tool || 'generation',
    credits: count,
    source,
    meta: meta || null,
    at: nowIso(),
  })
  // Журнал растёт бесконечно только в СУБД; в JSON-файле держим разумный
  // потолок — 20 000 записей хватает на месяцы работы демо-стенда.
  if (db.usageLog.length > 20000) db.usageLog.length = 20000
  await save()
  return true
}
