import type { Generation, StatPoint, ErpIntegration, ModelOption, PoseOption, TeamMember, TelegramBotConfig, BotEmployee } from '@/types'
import { ph } from './placeholder'

export const recentGenerations: Generation[] = [
  {
    id: 'g1', toolSlug: 'remove-bg', toolTitle: 'Удалить фон', status: 'completed',
    thumbnail: ph('Кроссовки', '#1a1a2e', '#16213e', true), createdAt: '2026-06-10T09:12:00',
    credits: 1, author: 'Алексей Коваль', source: 'web', similarity: 4,
  },
  {
    id: 'g2', toolSlug: 'virtual-model', toolTitle: 'Виртуальная модель', status: 'completed',
    thumbnail: ph('Свитер', '#2d132c', '#801336'), createdAt: '2026-06-10T08:40:00',
    credits: 4, author: 'Мария Лебедева', source: 'app', similarity: 92,
    similarMatches: [
      { id: 's1', title: 'Свитер шерстяной (бежевый)', thumbnail: ph('Свитер', '#2d132c', '#801336'), similarity: 92, author: 'Игорь Сидоров', createdAt: '2026-06-08T14:20:00' },
      { id: 's2', title: 'Свитер вязаный', thumbnail: ph('Свитер 2', '#3d1a2e', '#a01346'), similarity: 71, author: 'Алексей Коваль', createdAt: '2026-06-05T10:05:00' },
    ],
  },
  {
    id: 'g3', toolSlug: 'ai-background', toolTitle: 'AI-фон', status: 'processing',
    thumbnail: ph('Часы', '#0f3460', '#16213e', true), createdAt: '2026-06-10T08:05:00',
    credits: 2, author: 'Алексей Коваль', source: 'telegram', similarity: 12,
  },
  {
    id: 'g4', toolSlug: 'product-card', toolTitle: 'Карточка товара', status: 'completed',
    thumbnail: ph('Сумка', '#1b262c', '#0f4c75'), createdAt: '2026-06-09T19:22:00',
    credits: 3, author: 'Игорь Сидоров', source: 'web', similarity: 86,
    similarMatches: [
      { id: 's3', title: 'Сумка кожаная чёрная', thumbnail: ph('Сумка', '#1b262c', '#0f4c75'), similarity: 86, author: 'Мария Лебедева', createdAt: '2026-06-07T16:40:00' },
    ],
  },
  {
    id: 'g5', toolSlug: 'upscale', toolTitle: 'Апскейл', status: 'completed',
    thumbnail: ph('Парфюм', '#3a0ca3', '#480ca8', true), createdAt: '2026-06-09T17:01:00',
    credits: 1, author: 'Мария Лебедева', source: 'telegram', similarity: 0,
  },
  {
    id: 'g6', toolSlug: 'product-stage', toolTitle: 'Сцена', status: 'failed',
    thumbnail: ph('Кофе', '#432818', '#6f1d1b'), createdAt: '2026-06-09T15:33:00',
    credits: 2, author: 'Игорь Сидоров', source: 'app', similarity: 58,
    similarMatches: [
      { id: 's4', title: 'Кофе зерновой 1кг', thumbnail: ph('Кофе', '#432818', '#6f1d1b'), similarity: 58, author: 'Игорь Сидоров', createdAt: '2026-06-04T09:15:00' },
    ],
  },
  {
    id: 'g7', toolSlug: 'remove-bg', toolTitle: 'Удалить фон', status: 'completed',
    thumbnail: ph('Кресло', '#283618', '#606c38', true), createdAt: '2026-06-09T13:10:00',
    credits: 1, author: 'Алексей Коваль', source: 'web', similarity: 7,
  },
  {
    id: 'g8', toolSlug: 'retouch', toolTitle: 'Ретушь', status: 'completed',
    thumbnail: ph('Очки', '#22223b', '#4a4e69'), createdAt: '2026-06-09T11:48:00',
    credits: 2, author: 'Мария Лебедева', source: 'app', similarity: 95,
    similarMatches: [
      { id: 's5', title: 'Очки солнцезащитные авиаторы', thumbnail: ph('Очки', '#22223b', '#4a4e69'), similarity: 95, author: 'Алексей Коваль', createdAt: '2026-06-06T12:30:00' },
      { id: 's6', title: 'Очки солнцезащитные', thumbnail: ph('Очки 2', '#2a2a4b', '#5a5e89'), similarity: 64, author: 'Игорь Сидоров', createdAt: '2026-06-02T18:00:00' },
    ],
  },
]

// Активность за 14 дней
export const activitySeries: StatPoint[] = [
  { label: '28 май', value: 24 },
  { label: '29', value: 31 },
  { label: '30', value: 18 },
  { label: '31', value: 42 },
  { label: '1 июн', value: 55 },
  { label: '2', value: 38 },
  { label: '3', value: 61 },
  { label: '4', value: 49 },
  { label: '5', value: 72 },
  { label: '6', value: 58 },
  { label: '7', value: 80 },
  { label: '8', value: 64 },
  { label: '9', value: 91 },
  { label: '10', value: 76 },
]

// Распределение по инструментам
export const toolUsage: StatPoint[] = [
  { label: 'Удалить фон', value: 412 },
  { label: 'Виртуальная модель', value: 286 },
  { label: 'AI-фоны', value: 198 },
  { label: 'Карточка товара', value: 164 },
  { label: 'Апскейл', value: 121 },
  { label: 'Прочее', value: 89 },
]

export const erpIntegrations: ErpIntegration[] = [
  // ERP / маркетплейсы
  { id: 'e1', name: '1С', logo: '1C', connected: true, category: 'erp', description: 'Синхронизация номенклатуры и остатков', productsSynced: 1248 },
  { id: 'e2', name: 'МойСклад', logo: 'МС', connected: true, category: 'erp', description: 'Импорт товаров и автообновление карточек', productsSynced: 873 },
  { id: 'e3', name: 'Bitrix24', logo: 'B24', connected: false, category: 'erp', description: 'CRM и каталог товаров' },
  { id: 'e4', name: 'Wildberries', logo: 'WB', connected: true, category: 'erp', description: 'Выгрузка готовых карточек на маркетплейс', productsSynced: 542 },
  { id: 'e5', name: 'Ozon', logo: 'OZ', connected: false, category: 'erp', description: 'Автопубликация карточек товаров' },

  // Telegram-боты
  { id: 't1', name: 'Telegram-бот', logo: 'TG', connected: false, category: 'telegram', description: 'Генерация карточек прямо в чате через бота' },
  { id: 't2', name: 'Telegram-канал', logo: 'TG', connected: false, category: 'telegram', description: 'Автопостинг готовых карточек в канал' },

  // WhatsApp-боты
  { id: 'w1', name: 'WhatsApp Business', logo: 'WA', connected: false, category: 'whatsapp', description: 'Приём фото товара и выдача карточек в WhatsApp' },
  { id: 'w2', name: 'WhatsApp-рассылка', logo: 'WA', connected: false, category: 'whatsapp', description: 'Отправка готовых карточек клиентам' },
]

export const teamMembers: TeamMember[] = [
  { id: 'u1', name: 'Алексей Коваль', email: 'alexey@coolay.app', role: 'owner', status: 'active', source: 'web', lastActive: '2026-06-10T09:12:00' },
  { id: 'u2', name: 'Мария Лебедева', email: 'maria@coolay.app', role: 'admin', status: 'active', source: 'app', lastActive: '2026-06-10T08:40:00' },
  { id: 'u3', name: 'Игорь Сидоров', email: 'igor@coolay.app', role: 'editor', status: 'active', source: 'telegram', lastActive: '2026-06-09T19:22:00' },
  { id: 'u4', name: 'Ольга Новикова', email: 'olga@coolay.app', role: 'viewer', status: 'blocked', source: 'web', lastActive: '2026-06-02T14:05:00' },
  { id: 'u5', name: 'Дмитрий Жуков', email: 'dmitry@coolay.app', role: 'editor', status: 'invited', source: 'web' },
]

// Конфигурация Telegram-бота (демо — пока не подключён)
export const telegramBot: TelegramBotConfig = {
  token: '',
  connected: false,
  botUsername: '',
  botName: '',
  miniAppUrl: 'https://demo.coolay.website/tools',
}

// Сотрудники с доступом к генерациям через Telegram-бота
export const botEmployees: BotEmployee[] = [
  {
    id: 'be1',
    fullName: 'Игорь Сидоров',
    phone: '+7 999 123-45-67',
    status: 'verified',
    telegramId: 482919301,
    telegramUsername: '@igor_s',
    canGenerate: true,
    addedAt: '2026-06-08T11:00:00',
  },
  {
    id: 'be2',
    fullName: 'Мария Лебедева',
    phone: '+7 925 555-10-20',
    status: 'verified',
    telegramId: 271830044,
    telegramUsername: '@maria_l',
    canGenerate: true,
    addedAt: '2026-06-09T15:30:00',
  },
  {
    id: 'be3',
    fullName: 'Павел Орлов',
    phone: '+7 911 700-80-90',
    status: 'pending',
    canGenerate: false,
    addedAt: '2026-06-10T09:00:00',
  },
]

export const models: ModelOption[] = [
  { id: 'm1', name: 'Avery', image: ph('Avery', '#2b2d42', '#8d99ae') },
  { id: 'm2', name: 'Sam', image: ph('Sam', '#3d405b', '#81b29a') },
  { id: 'm3', name: 'Taylor', image: ph('Taylor', '#5f0f40', '#9a031e') },
  { id: 'm4', name: 'Kendall', image: ph('Kendall', '#264653', '#2a9d8f') },
  { id: 'm5', name: 'Jordan', image: ph('Jordan', '#414833', '#a4ac86') },
  { id: 'm6', name: 'Riley', image: ph('Riley', '#6d6875', '#b5838d') },
  { id: 'm7', name: 'Morgan', image: ph('Morgan', '#1d3557', '#457b9d') },
  { id: 'm8', name: 'Casey', image: ph('Casey', '#3c096c', '#7b2cbf') },
]

export const poses: PoseOption[] = [
  { id: 'p1', name: 'Случайный', image: ph('Random', '#495057', '#adb5bd') },
  { id: 'p2', name: 'Стоя', image: ph('Стоя', '#343a40', '#868e96') },
  { id: 'p3', name: 'Поворот 3/4', image: ph('3/4', '#212529', '#6c757d') },
  { id: 'p4', name: 'Мощная поза', image: ph('Power', '#495057', '#ced4da') },
  { id: 'p5', name: 'Вперёд', image: ph('Front', '#343a40', '#adb5bd') },
  { id: 'p6', name: 'Рука в кармане', image: ph('Карман', '#212529', '#868e96') },
  { id: 'p7', name: 'Скрещенные руки', image: ph('Руки', '#495057', '#dee2e6') },
  { id: 'p8', name: 'В движении', image: ph('Motion', '#343a40', '#6c757d') },
]

export const dashboardStats = {
  totalGenerations: 12458,
  thisMonth: 342,
  creditsLeft: 658,
  creditsTotal: 1000,
  planName: 'Pro',
  successRate: 96.4,
  avgTime: 8.2,
  trendGenerations: 18,
  trendMonth: 8.3,
  activeProjects: 28,
  productsInCatalog: 3256,
}

export interface HomeScenario {
  id: string
  title: string
  description: string
  to: string
  icon: string
  tone: 'mint' | 'sky' | 'rose' | 'amber' | 'violet' | 'lime'
  image: string
}

export const homeScenarios: HomeScenario[] = [
  {
    id: 's1',
    title: 'Создать карточку товара',
    description: 'Название, описание, фото и SEO в одном сценарии',
    to: '/studios/product-cards',
    icon: 'card',
    tone: 'mint',
    image: '/dashboard/shirt.webp',
  },
  {
    id: 's2',
    title: 'История карточек',
    description: 'Все созданные SKU: поиск, фильтры и экспорт',
    to: '/studios/product-cards/history',
    icon: 'history',
    tone: 'sky',
    image: '/dashboard/catalog.webp',
  },
  {
    id: 's3',
    title: 'Мои проекты',
    description: 'Сгенерированные карточки и статусы работы',
    to: '/projects',
    icon: 'folder',
    tone: 'violet',
    image: '/dashboard/handbag.webp',
  },
  {
    id: 's6',
    title: 'Улучшить контент товара',
    description: 'Описание, характеристики и продающие тексты',
    to: '/tools/product-card',
    icon: 'magic',
    tone: 'lime',
    image: '/dashboard/content.webp',
  },
]

export interface HomeProject {
  id: string
  title: string
  type: string
  updatedAt: string
  thumbnail: string
  to: string
}

export const homeProjects: HomeProject[] = [
  {
    id: 'p1',
    title: 'Мужская рубашка Blue Pinstripe',
    type: 'Fashion-студия',
    updatedAt: 'Обновлено сегодня',
    thumbnail: '/dashboard/shirt.webp',
    to: '/projects',
  },
  {
    id: 'p2',
    title: 'Сумка кожаная Weekend',
    type: 'Карточки товара',
    updatedAt: 'Обновлено сегодня',
    thumbnail: '/dashboard/handbag.webp',
    to: '/projects',
  },
  {
    id: 'p3',
    title: 'Lookbook SS26 · женский',
    type: 'Fashion-студия',
    updatedAt: 'Вчера',
    thumbnail: '/dashboard/fashion-model.webp',
    to: '/projects',
  },
  {
    id: 'p4',
    title: 'Каталог обувь · 128 SKU',
    type: 'Каталог-студия',
    updatedAt: '2 дня назад',
    thumbnail: '/dashboard/catalog.webp',
    to: '/projects',
  },
]

export interface HomeActivity {
  id: string
  title: string
  time: string
  icon: string
  tone: string
  to: string
}

export const homeActivity: HomeActivity[] = [
  {
    id: 'a1',
    title: 'Создана карточка товара',
    time: 'Сегодня, 11:24',
    icon: 'card',
    tone: 'bg-emerald-50 text-emerald-700',
    to: '/history',
  },
  {
    id: 'a2',
    title: 'Удалён фон с изображения',
    time: 'Сегодня, 10:15',
    icon: 'scissors',
    tone: 'bg-sky-50 text-sky-700',
    to: '/tools/remove-bg',
  },
  {
    id: 'a3',
    title: 'Сгенерировано 4 изображения',
    time: 'Вчера, 16:42',
    icon: 'sparkles',
    tone: 'bg-violet-50 text-violet-700',
    to: '/history',
  },
  {
    id: 'a4',
    title: 'Проект «Lookbook SS26» обновлён',
    time: 'Вчера, 14:08',
    icon: 'folder',
    tone: 'bg-amber-50 text-amber-700',
    to: '/projects',
  },
  {
    id: 'a5',
    title: 'Адаптация под Wildberries',
    time: '2 дня назад',
    icon: 'shoppingBag',
    tone: 'bg-rose-50 text-rose-700',
    to: '/studios/product-cards',
  },
]
