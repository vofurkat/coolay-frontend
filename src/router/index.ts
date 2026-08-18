import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

/**
 * SectionView (страница-заглушка «раздел в разработке») больше не используется:
 * /templates и /projects/shared получили настоящие экраны. Хелпер section()
 * удалён вместе с ними — он маскировал отсутствие функциональности, а держать
 * его «на будущее» значит рисковать, что новый раздел снова выйдет заглушкой.
 */

/**
 * Разделы, скрытые по запросу заказчика.
 * Маршруты удалены, но прямые ссылки (закладки, история браузера, внешние
 * ссылки) не должны приводить в пустоту — beforeEach уводит их на главную.
 * Чтобы вернуть раздел: убрать путь отсюда и добавить обычный маршрут.
 */
const HIDDEN_PATHS = [
  '/studios/photo',
  '/studios/fashion',
  '/studios/catalog',
  '/studios/marketplaces',
  '/batch',
  '/media',
  '/projects/shared',
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
        {
          path: 'templates',
          name: 'templates',
          component: () => import('@/views/TemplatesView.vue'),
          meta: {
            title: 'Шаблоны',
            description:
              'Референсы и промты по категориям товара — подставляются при генерации карточки.',
            icon: 'layout',
          },
        },

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
        {
          path: 'projects/shared',
          name: 'projects-shared',
          component: () => import('@/views/SharedProjectsView.vue'),
          meta: {
            title: 'Общие со мной',
            description:
              'Проекты, которыми с вами поделились — совместная работа команды.',
            icon: 'folderShared',
          },
        },
        // Служебные (доступ из топбара / настроек)
        {
          path: 'history',
          name: 'history',
          component: () => import('@/views/HistoryView.vue'),
          meta: { title: 'История' },
        },
        {
          path: 'usage',
          name: 'usage',
          component: () => import('@/views/UsageLogView.vue'),
          meta: {
            title: 'Журнал списаний',
            description: 'История трат кредит-токенов по операциям.',
            icon: 'bolt',
          },
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
    // Супер-админка платформы — отдельный контур авторизации (cookie админа),
    // клиентский гард её не касается (meta.sadmin).
    {
      path: '/sadmin/login',
      name: 'sadmin-login',
      component: () => import('@/views/sadmin/SadminLoginView.vue'),
      meta: { public: true, sadmin: true, title: 'Вход в админку' },
    },
    {
      path: '/sadmin',
      component: () => import('@/layouts/SadminLayout.vue'),
      meta: { sadmin: true },
      children: [
        {
          path: '',
          name: 'sadmin-dashboard',
          component: () => import('@/views/sadmin/SadminDashboardView.vue'),
          meta: { sadmin: true, title: 'Админка · Обзор' },
        },
        {
          path: 'clients',
          name: 'sadmin-clients',
          component: () => import('@/views/sadmin/SadminClientsView.vue'),
          meta: { sadmin: true, title: 'Админка · Клиенты' },
        },
        {
          path: 'clients/:id',
          name: 'sadmin-client',
          component: () => import('@/views/sadmin/SadminClientDetailView.vue'),
          meta: { sadmin: true, title: 'Админка · Клиент' },
        },
        {
          path: 'plans',
          name: 'sadmin-plans',
          component: () => import('@/views/sadmin/SadminPlansView.vue'),
          meta: { sadmin: true, title: 'Админка · Тарифы' },
        },
        {
          path: 'usage',
          name: 'sadmin-usage',
          component: () => import('@/views/sadmin/SadminUsageView.vue'),
          meta: { sadmin: true, title: 'Админка · Списания' },
        },
        {
          path: 'templates',
          name: 'sadmin-templates',
          component: () => import('@/views/sadmin/SadminTemplatesView.vue'),
          meta: { sadmin: true, title: 'Админка · Системные шаблоны' },
        },
        {
          path: 'admins',
          name: 'sadmin-admins',
          component: () => import('@/views/sadmin/SadminAdminsView.vue'),
          meta: { sadmin: true, title: 'Админка · Администраторы' },
        },
        {
          path: 'log',
          name: 'sadmin-log',
          component: () => import('@/views/sadmin/SadminLogView.vue'),
          meta: { sadmin: true, title: 'Админка · Журнал' },
        },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

router.beforeEach(async (to) => {
  // Админка живёт на своём контуре: проверку сессии делает SadminLayout
  // (свой cookie, свой /api/sadmin/auth/me) — клиентский гард её пропускает.
  if (to.meta.sadmin) {
    document.title = to.meta.title ? `${to.meta.title} · Coolay` : 'Coolay Admin'
    return
  }

  const auth = useAuthStore()
  // Сессия в httpOnly cookie — узнать о ней можно только запросом к серверу.
  // Ждём первую проверку, иначе залогиненного пользователя при F5
  // выкинет на /login до того, как ответит /api/auth/me.
  if (!auth.checked) await auth.restore()

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
