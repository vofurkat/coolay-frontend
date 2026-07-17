export interface User {
  id: string
  name: string
  email: string
  role: string
  company: string
  avatar?: string
}

export type ToolCategory = 'photo' | 'background' | 'model' | 'enhance' | 'batch' | 'card'

export interface Tool {
  id: string
  slug: string
  title: string
  description: string
  category: ToolCategory
  icon: string
  badge?: string
  isNew?: boolean
  isPro?: boolean
  accent?: boolean
}

export type DeviceSource = 'web' | 'app' | 'telegram'

export interface SimilarMatch {
  id: string
  title: string
  thumbnail: string
  similarity: number // 0..100 — процент схожести
  author: string
  createdAt: string
}

export interface Generation {
  id: string
  toolSlug: string
  toolTitle: string
  status: 'completed' | 'processing' | 'failed'
  thumbnail: string
  createdAt: string
  credits: number
  author: string
  source: DeviceSource
  // Максимальный процент схожести с ранее загруженными товарами (0 = уникальный)
  similarity: number
  similarMatches?: SimilarMatch[]
}

export interface StatPoint {
  label: string
  value: number
}

export type IntegrationCategory = 'erp' | 'telegram' | 'whatsapp'

export interface ErpIntegration {
  id: string
  name: string
  logo: string
  connected: boolean
  description: string
  productsSynced?: number
  category: IntegrationCategory
}

// === Telegram-бот: конфигурация и сотрудники с доступом ===
export interface TelegramBotConfig {
  token: string
  connected: boolean
  botUsername?: string // @имя_бота
  botName?: string
  miniAppUrl?: string // ссылка на мини-апп инструментов в боте
}

// Статус проверки сотрудника в Telegram по номеру телефона
export type BotEmployeeStatus = 'verified' | 'pending' | 'not_found'

export interface BotEmployee {
  id: string
  fullName: string // ФИО
  phone: string // номер телефона (как в Telegram)
  status: BotEmployeeStatus
  telegramId?: number // найденный chat id в Telegram
  telegramUsername?: string
  canGenerate: boolean // выдан ли доступ к генерациям через бота
  addedAt: string
}

export type MemberRole = 'owner' | 'admin' | 'editor' | 'viewer'
export type MemberStatus = 'active' | 'blocked' | 'invited'

export interface TeamMember {
  id: string
  name: string
  email: string
  role: MemberRole
  status: MemberStatus
  source: DeviceSource
  lastActive?: string
}

export interface ModelOption {
  id: string
  name: string
  image: string
}

export interface PoseOption {
  id: string
  name: string
  image: string
}
