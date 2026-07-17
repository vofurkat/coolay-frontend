import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const section = (path: string, name: string, title: string, description: string, icon: string) => ({
  path,
  name,
  component: () => import('@/views/SectionView.vue'),
  meta: { title, description, icon },
})

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
        section(
          'studios/product-cards',
          'studio-product-cards',
          'Карточки товара',
          'Создание и улучшение товарных карточек: фото, название, описание, характеристики, SEO.',
          'card',
        ),
        section(
          'studios/photo',
          'studio-photo',
          'Фото-студия',
          'Подготовка продающих фото товара: фон, свет, ракурс и качество.',
          'camera',
        ),
        section(
          'studios/fashion',
          'studio-fashion',
          'Fashion-студия',
          'Работа с одеждой и fashion-каталогом: модель, посадка, образ, ткань и ракурс.',
          'shirt',
        ),
        section(
          'studios/catalog',
          'studio-catalog',
          'Каталог-студия',
          'Массовая работа с ассортиментом: десятки и сотни SKU в одном потоке.',
          'layers',
        ),
        section(
          'studios/marketplaces',
          'studio-marketplaces',
          'Маркетплейсы',
          'Адаптация фото и карточек под Wildberries, Ozon, Shopify и другие площадки.',
          'shoppingBag',
        ),
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
          'batch',
          'batch',
          'Пакетная обработка',
          'Массовая обработка файлов — быстрый сценарий для больших объёмов.',
          'layers',
        ),
        section(
          'templates',
          'templates',
          'Шаблоны',
          'Готовые форматы и пресеты, чтобы не настраивать одно и то же каждый раз.',
          'layout',
        ),
        section(
          'media',
          'media',
          'Медиа библиотека',
          'Хранилище изображений, фонов, моделей, карточек и результатов генераций.',
          'folder',
        ),
        // Проекты
        section(
          'projects',
          'projects',
          'Мои проекты',
          'Личное рабочее пространство: товары, изображения, карточки и история работы.',
          'folder',
        ),
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
  document.title = to.meta.title ? `${to.meta.title} · Coolay Studio` : 'Coolay Studio'
})

export default router
