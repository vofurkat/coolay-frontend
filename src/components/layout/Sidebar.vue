<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { computed, type Component } from 'vue'
import {
  CreditCard,
  Folder,
  Gift,
  History,
  House,
  LayoutGrid,
  Users,
  WandSparkles,
} from '@lucide/vue'
import Logo from '@/components/ui/Logo.vue'
import { useAppStore } from '@/stores/app'
import { dashboardStats } from '@/data/mock'

type NavItem = {
  name: string
  label: string
  icon: Component
  to: string
  badge?: string
  exact?: boolean
  /**
   * Вложенные пути, которые НЕ должны подсвечивать этот пункт.
   * Нужно потому, что «Карточки товара» (/studios/product-cards) является
   * префиксом для «История карточек» (/studios/product-cards/history) —
   * без исключения подсвечивались бы сразу два пункта.
   */
  exclude?: string[]
}

type NavSection = {
  key: string
  label: string
  items: NavItem[]
}

const app = useAppStore()
const route = useRoute()

const homeItem: NavItem = {
  name: 'home',
  label: 'Главная',
  icon: House,
  to: '/',
  exact: true,
}

/**
 * Скрытые разделы (по запросу заказчика): Фото-студия, Fashion-студия,
 * Каталог-студия, Маркетплейсы, Пакетная обработка, Медиа библиотека.
 * Пункты убраны из навигации, а их маршруты редиректят на главную —
 * см. HIDDEN_PATHS в router/index.ts. Возврат = раскомментировать пункт
 * здесь и убрать путь из HIDDEN_PATHS.
 */
const sections: NavSection[] = [
  {
    key: 'studios',
    label: 'AI-студии',
    items: [
      {
        name: 'studio-product-cards',
        label: 'Карточки товара',
        icon: CreditCard,
        to: '/studios/product-cards',
        badge: 'Новое',
        exclude: ['/studios/product-cards/history'],
      },
      {
        name: 'studio-product-cards-history',
        label: 'История карточек',
        icon: History,
        to: '/studios/product-cards/history',
      },
    ],
  },
  {
    key: 'tools',
    label: 'Инструменты',
    items: [
      { name: 'tools', label: 'Все инструменты', icon: LayoutGrid, to: '/tools' },
      { name: 'templates', label: 'Шаблоны', icon: WandSparkles, to: '/templates' },
    ],
  },
  {
    key: 'projects',
    label: 'Проекты',
    items: [
      { name: 'projects', label: 'Мои проекты', icon: Folder, to: '/projects', exact: true },
      {
        name: 'projects-shared',
        label: 'Общие со мной',
        icon: Users,
        to: '/projects/shared',
      },
    ],
  },
]

const collapsed = computed(() => app.sidebarCollapsed)
const creditsPct = computed(() =>
  Math.round((dashboardStats.creditsLeft / dashboardStats.creditsTotal) * 100),
)

function isActive(item: NavItem) {
  if (item.exact || item.to === '/') return route.path === item.to
  if (item.exclude?.some((p) => route.path === p || route.path.startsWith(p + '/'))) return false
  return route.path === item.to || route.path.startsWith(item.to + '/')
}

function linkClass(item: NavItem) {
  const active = isActive(item)
  return [
    'group relative flex items-center gap-3 rounded-xl px-3 h-11 font-semibold text-sm transition-all',
    active
      ? 'bg-white/[0.08] text-white'
      : 'text-white/65 hover:text-white hover:bg-white/[0.06]',
  ]
}
</script>

<template>
  <aside
    class="h-full bg-sidebar text-white flex flex-col transition-all duration-300 ease-out"
    :class="collapsed ? 'w-[76px]' : 'w-[280px]'"
  >
    <!-- Logo -->
    <div class="h-[68px] flex items-center px-5 shrink-0 border-b border-white/10">
      <RouterLink to="/">
        <Logo :collapsed="collapsed" dark />
      </RouterLink>
    </div>

    <!-- Nav -->
    <nav class="flex-1 overflow-y-auto no-scrollbar px-3 py-4 space-y-5">
      <!-- Главная -->
      <ul class="space-y-1">
        <li>
          <RouterLink
            :to="homeItem.to"
            :class="linkClass(homeItem)"
            :title="collapsed ? homeItem.label : ''"
          >
            <span
              class="grid place-items-center w-8 h-8 rounded-lg shrink-0 transition-colors"
              :class="isActive(homeItem) ? 'bg-accent text-ink-900' : 'bg-white/[0.06] text-white/80'"
            >
              <component :is="homeItem.icon" :size="18" :stroke-width="1.8" />
            </span>
            <span v-if="!collapsed" class="truncate">{{ homeItem.label }}</span>
          </RouterLink>
        </li>
      </ul>

      <!-- Sections -->
      <div v-for="section in sections" :key="section.key">
        <p
          v-if="!collapsed"
          class="px-3 mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/35"
        >
          {{ section.label }}
        </p>
        <ul class="space-y-0.5">
          <li v-for="item in section.items" :key="item.name">
            <RouterLink
              :to="item.to"
              :class="linkClass(item)"
              :title="collapsed ? item.label : ''"
            >
              <span
                class="grid place-items-center w-8 h-8 rounded-lg shrink-0 transition-colors"
                :class="
                  isActive(item)
                    ? 'bg-accent text-ink-900'
                    : 'text-white/70 group-hover:text-white'
                "
              >
                <component :is="item.icon" :size="18" :stroke-width="1.8" />
              </span>
              <span v-if="!collapsed" class="truncate flex-1">{{ item.label }}</span>
              <span
                v-if="!collapsed && item.badge"
                class="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#7C5CFF] text-white leading-none"
              >
                {{ item.badge }}
              </span>
            </RouterLink>
          </li>
        </ul>
      </div>
    </nav>

    <!-- Plan / Upgrade -->
    <div class="p-3 shrink-0 border-t border-white/10">
      <div
        v-if="!collapsed"
        class="rounded-2xl bg-white/[0.05] border border-white/10 p-4 mb-3"
      >
        <p class="text-xs text-white/50">
          Ваш план:
          <span class="font-bold text-white">{{ dashboardStats.planName }}</span>
        </p>
        <div class="flex items-center justify-between mt-3 mb-2">
          <span class="text-xs font-medium text-white/60">Осталось генераций</span>
          <span class="text-xs font-bold text-white tabular-nums">
            {{ dashboardStats.creditsLeft }}
            <span class="text-white/40">/</span>
            {{ dashboardStats.creditsTotal }}
          </span>
        </div>
        <div class="h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            class="h-full bg-accent rounded-full transition-all"
            :style="{ width: creditsPct + '%' }"
          />
        </div>
      </div>

      <button
        type="button"
        class="btn btn-accent w-full"
        :class="collapsed ? 'h-11 px-0 justify-center' : 'h-11'"
        :title="collapsed ? 'Улучшить план' : ''"
      >
        <Gift :size="18" :stroke-width="1.8" />
        <span v-if="!collapsed">Улучшить план</span>
      </button>
    </div>
  </aside>
</template>
