import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const section = (path: string, name: string, title: string, description: string, icon: string) => ({
  path,
  name,
  component: () => import('@/views/SectionView.vue'),
  meta: { title, description, icon },
})

/**
 * Разделы, скрытые по запросу заказчика.
 * Маршруты удалены, но прямые ссылки (закладки, история браузера, внешние
 * ссылки) не должны приводить в пустоту — beforeEach уводит их на главную.
 * Чтобы вернуть раздел: убрать путь отсюда и восстановить его section().
 */
const HIDDEN_PATHS = [
  '/studios/photo',
  '/studios/fashion',
  '/studios/catalog',
  '/studios/marketplaces',
  '/batch',
  '/media',
]

function isHidden(path: string) {
  return HIDDEN_PATHS.some((p) => path === p || path.startsWith(p + '/'))
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true, title: 'Вход' },
    },
    {
      path: '/',
      component: () => import('@/layouts/AppLayout.vue'),
      children: [
        {
          path: '',
          name: 'home',
          component: () => import('@/views/DashboardView.vue'),
          meta: {
            title: 'Главная',
            description:
              'Стартовый экран: быстрые сценарии, недавние проекты и остаток генераций.',
          },
        },
        // AI-студии
        {
          path: 'studios/product-cards',
          name: 'studio-product-cards',
          component: () => import('@/views/studios/ProductCardsStudioView.vue'),
          meta: {
            title: 'Карточки товара',
            description:
              'Создание и улучшение товарных карточек: фото, название, описание, характеристики, SEO.',
            icon: 'card',
          },
        },
        {
          path: 'studios/product-cards/new',
          name: 'studio-product-cards-new',
          component: () => import('@/views/studios/ProductCardWizardView.vue'),
          meta: {
            title: 'Создание карточки товара',
            description: 'AI создаёт карточку с описанием, характеристиками, SEO и изображениями.',
            icon: 'card',
          },
        },
        {
          path: 'studios/product-cards/history',
          name: 'studio-product-cards-history',
          component: () => import('@/views/studios/ProductCardsHistoryView.vue'),
          meta: {
            title: 'История карточек товара',
            description: 'Все созданные SKU-карточки: поиск, фильтры и быстрый переход.',
            icon: 'card',
          },
        },
        {
          path: 'studios/product-cards/:id',
          name: 'studio-product-card',
          component: () => import('@/views/studios/ProductCardDetailView.vue'),
          meta: { title: 'Карточка товара', icon: 'card' },
        },
        // Инструменты
        {
          path: 'tools',
          name: 'tools',
          component: () => import('@/views/ToolsView.vue'),
          meta: {
            title: 'Все инструменты',
            description: 'Полный список функций Coolay без прохождения сценария.',
          },
        },
        {
          path: 'tools/:slug',
          name: 'tool',
          component: () => import('@/views/ToolWorkspaceView.vue'),
          meta: { title: 'Инструмент' },
        },
        section(
          'templates',
          'templates',
          'Шаблоны',
          'Готовые форматы и пресеты, чтобы не настраивать одно и то же каждый раз.',
          'layout',
        ),

        // Проекты — здесь хранятся сгенерированные SKU-карточки
        {
          path: 'projects',
          name: 'projects',
          component: () => import('@/views/ProjectsView.vue'),
          meta: {
            title: 'Мои проекты',
            description:
              'Рабочее пространство: сгенерированные карточки товаров, статусы и история работы.',
            icon: 'folder',
          },
        },
        section(
          'projects/shared',
          'projects-shared',
          'Общие со мной',
          'Проекты, которыми с вами поделились — совместная работа команды.',
          'folderShared',
        ),
        // Служебные (доступ из топбара / настроек)
        {
          path: 'history',
          name: 'history',
          component: () => import('@/views/HistoryView.vue'),
          meta: { title: 'История' },
        },
        {
          path: 'integrations',
          name: 'integrations',
          component: () => import('@/views/IntegrationsView.vue'),
          meta: { title: 'Интеграции' },
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('@/views/SettingsView.vue'),
          meta: { title: 'Настройки' },
        },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (!auth.isAuthenticated) auth.restore()

  if (!to.meta.public && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'home' }
  }
  // Скрытые разделы: уводим на главную явно, не полагаясь на catch-all —
  // иначе такой путь мог бы осесть в ?redirect= и вернуть пользователя в никуда.
  if (isHidden(to.path)) {
    return { name: 'home' }
  }
  document.title = to.meta.title ? `${to.meta.title} · Coolay Studio` : 'Coolay Studio'
})

export default router
