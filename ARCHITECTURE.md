# Coolay Studio — Архитектура проекта (As-Is)

> Аудит на 2026-07-31. Описывает то, что **фактически** развёрнуто на
> https://demo.coolay.website/ и лежит на сервере.

---

## 0. Главное, что нужно понять сразу

Под именем «Coolay» на сервере живут **ДВА независимых проекта**. Это
основной источник путаницы.

| | **A. Coolay Studio (демо)** | **B. Coolay SaaS (полный продукт)** |
|---|---|---|
| Что отдаёт demo.coolay.website | ✅ **ДА, это он** | ❌ нет, не подключён к nginx |
| Код | `/var/www/webapp/coolay-frontend` | `/var/www/demo.coolay.website/webapp` |
| Git | `github.com/vofurkat/coolay-frontend` | `github.com/vofurkat/coolay.git` |
| Frontend | Vue 3 + Vite + Tailwind (SPA) | Next.js 14 (App Router) + статические HTML |
| Backend | Node.js `http` (~310 строк), прокси к kie.ai | Django 4.2 + DRF + Celery + PostgreSQL + Redis |
| Данные | mock-файлы + `localStorage` | реальная БД, 8 Django-приложений |
| Авторизация | фейковая `admin/admin` в браузере | JWT (SimpleJWT) + Google OAuth |
| Целевой домен | demo.coolay.website | app.coolay.website (на этом сервере не запущен) |

**Вывод:** правки «по демо-сайту» → проект **A**. Правки «по продукту с
БД, тарифами, организациями» → проект **B**.

---

## 1. Проект A — Coolay Studio (то, что видно на demo.coolay.website)

### 1.1 Цепочка деплоя

```
/var/www/webapp/coolay-frontend          ← исходники (git: coolay-frontend)
        │  npm run build   (vue-tsc + vite)
        ▼
     dist/                                ← сборка
        │  копирование
        ▼
/var/www/demo.coolay.website/dist         ← root в nginx (проверено: идентичны)

/var/www/webapp/coolay-backend/server.js  ← исходник Node-прокси
        │  копирование
        ▼
/var/www/demo.coolay.website/backend/server.js   ← идентичен, запущен под pm2
        pm2 name: coolay-backend, порт 127.0.0.1:8821
```

nginx (`/etc/nginx/sites-available/demo.coolay.website`):

```
443 ssl (Let's Encrypt)
├── /api/         → proxy_pass 127.0.0.1:8821   (timeout 360s, body 35M)
├── /assets/      → кэш 30d, immutable
├── /index.html   → no-cache
└── /             → try_files ... /index.html   (SPA fallback)
```

⚠️ Рядом лежит `demo.coolay.website.bak` — старая версия конфига **без**
блока `/api/`. Не перепутать при правках.

### 1.2 Стек frontend

- Vue 3.5 (`<script setup>`, Composition API), TypeScript 5.7
- Vite 6, alias `@` → `src`, dev-порт **5174**
- Pinia 2.3 (3 стора), Vue Router 4.5 (`createWebHistory`)
- Tailwind 3.4 + `@lucide/vue` (иконки)
- Шрифт Montserrat с Google Fonts (внешняя зависимость в `index.html`)
- ~4 700 строк в `src/`

### 1.3 Дерево исходников

```
src/
├── main.ts                  # createApp + Pinia + Router
├── App.vue                  # RouterView + page-transition
├── layouts/AppLayout.vue    # Sidebar + Topbar + <main> (h-screen, overflow hidden)
├── router/index.ts          # 17 маршрутов + guard
├── stores/
│   ├── auth.ts              # ФЕЙКОВЫЙ логин admin/admin, localStorage
│   ├── app.ts               # collapse sidebar / mobile drawer
│   └── generations.ts       # история генераций + ВСЯ аналитика (computed)
├── data/
│   ├── tools.ts             # 12 инструментов (каталог)
│   ├── mock.ts              # 352 строки демо-данных
│   ├── generateApi.ts       # HTTP-клиент к /api
│   ├── similarity.ts        # порог дублей (DUPLICATE_THRESHOLD)
│   ├── sources.ts           # web / app / telegram
│   └── placeholder.ts       # генератор SVG-заглушек
├── types/index.ts           # 20+ интерфейсов — единая модель данных
├── components/
│   ├── layout/     Sidebar.vue (241), Topbar.vue (176)
│   ├── ui/         Logo, Icon, Avatar, ToolCard, GenerationCard,
│   │               StatCard, SelectField, PageHeader
│   ├── tool/       PickerModal.vue, SimilarModal.vue
│   ├── settings/   UserModal.vue
│   ├── integrations/ TelegramBotPanel.vue (337)
│   └── charts/     Sparkline.vue (свой SVG, без chart-библиотек)
└── views/
    ├── LoginView.vue            (170)
    ├── DashboardView.vue        (263)
    ├── ToolsView.vue            (78)
    ├── ToolWorkspaceView.vue    (600) ← ядро продукта
    ├── HistoryView.vue          (292)
    ├── IntegrationsView.vue     (142)
    ├── SettingsView.vue         (274)
    └── SectionView.vue          (41)  ← УНИВЕРСАЛЬНАЯ ЗАГЛУШКА
```

### 1.4 Карта маршрутов

| Путь | View | Состояние |
|---|---|---|
| `/login` | LoginView | работает (фейк-авторизация) |
| `/` | DashboardView | UI готов, данные из `mock.ts` |
| `/studios/product-cards` | SectionView | 🔶 **заглушка** |
| `/studios/photo` | SectionView | 🔶 **заглушка** |
| `/studios/fashion` | SectionView | 🔶 **заглушка** |
| `/studios/catalog` | SectionView | 🔶 **заглушка** |
| `/studios/marketplaces` | SectionView | 🔶 **заглушка** |
| `/tools` | ToolsView | работает (фильтр + поиск) |
| `/tools/:slug` | ToolWorkspaceView | ✅ **реально генерирует** |
| `/batch` | SectionView | 🔶 **заглушка** |
| `/templates` | SectionView | 🔶 **заглушка** |
| `/media` | SectionView | 🔶 **заглушка** |
| `/projects` | SectionView | 🔶 **заглушка** |
| `/projects/shared` | SectionView | 🔶 **заглушка** |
| `/history` | HistoryView | работает на `localStorage` |
| `/integrations` | IntegrationsView | UI-макет, кнопки без backend |
| `/settings` | SettingsView | UI-макет, 4 таба |

**11 из 17 маршрутов — заглушки** (`SectionView` рисует заголовок из
`route.meta` + текст «Раздел в разработке»).

Guard в `router/index.ts`: `restore()` из localStorage → если нет токена и
маршрут не `public` → редирект на `/login`; `document.title` из `meta.title`.

### 1.5 Единственный рабочий сценарий — ToolWorkspaceView

```
1. Пользователь загружает фото (input / drag&drop) → FileReader → data URL
2. scanDuplicates()  ⚠️ ФЕЙК: setTimeout 1400ms + Math.random() > 0.45
3. Настройки: модель, поза, качество (0.5K/1K/2K/4K),
   фон, соотношение сторон, свой prompt, «фирменный стиль»
4. generate() → POST /api/generate-smart
       │
       ├─ backend: uploadImage() → kieai.redpandaai.co (base64 → публичный URL)
       ├─ backend: buildPromptWithGemini() — gemini-3-flash смотрит фото +
       │           инструкцию инструмента + текст юзера → пишет финальный prompt
       │           (при сбое → fallbackPrompt(), флаг promptedBy:'fallback')
       ├─ backend: createTask() → api.kie.ai /api/v1/jobs/createTask, model=nano-banana-2
       └─ backend: pollTask() — опрос recordInfo каждые 3с, таймаут 5 мин
5. Результат → лайтбокс + addGeneration() в Pinia → localStorage
```

Индикатор этапов на фронте — по таймеру (`analyze` → `render` через 6с), а
не по реальному статусу задачи.

### 1.6 Backend (Node.js, 310 строк, без зависимостей)

`coolay-backend/server.js` — голый `node:http`, **ни одного npm-пакета**.

| Эндпоинт | Назначение |
|---|---|
| `GET /api/health` | `{ok:true, service:'coolay-backend'}` |
| `POST /api/generate` | прямая генерация с готовым prompt |
| `POST /api/generate-smart` | Gemini → prompt → Nano Banana 2 (**используется**) |

Внешние сервисы: `api.kie.ai` (Nano Banana 2 + Gemini 3 Flash),
`kieai.redpandaai.co` (загрузка файлов).

Валидация: `ALLOWED_RES` {1K,2K,4K}, `ALLOWED_AR` (15 значений),
`ALLOWED_FMT` {png,jpg}, `MAX_BODY` 35 МБ. Ошибки kie.ai маппятся в
русские сообщения (`errorResponse`).

`TOOL_INSTRUCTIONS` — 9 инструкций по slug инструмента.

### 1.7 Модель данных (`src/types/index.ts`)

Уже описана целевая бизнес-логика, шире чем реализовано:

- `User` (id, name, email, role, company, avatar)
- `Tool` + `ToolCategory` = photo | background | model | enhance | batch | card
- `Generation` (status, credits, author, `source`: web|app|telegram, `similarity`, `similarMatches[]`)
- `SimilarMatch` — процент схожести, автор, дата → анти-дубликаты
- `ErpIntegration` + `IntegrationCategory` = erp | telegram | whatsapp
- `TelegramBotConfig` (token, botUsername, miniAppUrl)
- `BotEmployee` + `BotEmployeeStatus` = verified | pending | not_found — доступ сотрудников к боту по номеру телефона
- `TeamMember` + `MemberRole` = owner|admin|editor|viewer, `MemberStatus` = active|blocked|invited
- `ModelOption`, `PoseOption`, `StatPoint`

### 1.8 Дизайн-система (`tailwind.config.js` + `assets/main.css`)

- Акцент: **лаймовый `#E7FE17`** (палитра 50–900)
- Сайдбар: `#232427` (+ `light`, `border`)
- `ink` — нейтральная шкала, база `#0A0A0A`
- Шрифт: Montserrat 300–900
- Тени: `soft`, `card`, `pop`, `glow` (лаймовое кольцо)
- ⚠️ **`borderRadius` глобально переопределён** (последний коммит,
  «−5px»): `sm`/`DEFAULT` = **0px**, `md`=1px, `lg`=3px, `xl`=9px,
  `2xl`=15px, `3xl`=23px. Любая новая вёрстка автоматически получает почти
  прямые углы — это нужно учитывать.
- CSS-компоненты в `@layer components`: `.btn` + `.btn-sm/md/lg` +
  `.btn-accent/dark/ghost/outline`, `.card`, `.input`, `.label`, `.chip`,
  `.skeleton` (shimmer)
- Анимации: `fade-in`, `scale-in`

### 1.9 Git-состояние проекта A

- Ветки: `main` (`b29d245` initial commit), `genspark_ai_developer` (`5ae6f9d`)
- Текущая: `genspark_ai_developer`, чистая, синхронна с origin
- В production развёрнут **`5ae6f9d`** (проверено по значениям
  border-radius в собранном CSS)
- Итого **2 коммита** — истории почти нет

---

## 2. Проект B — Coolay SaaS (полноценная платформа, исходники на сервере)

Лежит в `/var/www/demo.coolay.website/webapp`. **Не обслуживается nginx и
не запущен** (нет gunicorn/celery-процессов Coolay, нет БД `coolay_db`).
Целевой домен по документации — `app.coolay.website`.

### 2.1 Backend

Django 4.2 LTS + DRF 3.15 + PostgreSQL 15 + Redis 7 + Celery 5.4, Docker.
Настройки разделены: `config/settings/{base,development,staging,production}.py`.

**9 Django-приложений** (`apps/`):

| App | Ключевые модели |
|---|---|
| `accounts` | `User` (UUID PK, email-login, 2FA-поля, lock-out, `onboarding_status`), `OrganizationMembership`, `AuditLog` |
| `organizations` | `Organization` (multi-tenant, `trial_cards_used/limit`, soft-delete), `OrganizationInvitation` |
| `products` | `Category` (дерево + `translations`), `Product` (SKU), `ProductCard` (версионирование, `seo_data`, `multilingual_content`, `embeddings`, `marketplace_data`), `ProductImage`, `ProductVideo` |
| `ai_processing` | `AIProvider` (шифр. ключ, лимиты, fallback, priority), `GenerationJob` (celery_task_id, retry, progress), `AIUsageLog` (токены, `cost_usd`, latency), `AITemplate` |
| `billing` | `Plan` (Stripe price ids), `Subscription`, `Usage`, `Invoice`, платежи |
| `integrations` | `APIKey` (hash + prefix, rate-limit), `APIRequestLog`, вебхуки, ERP |
| `analytics` | статистика, метрики, отчёты |
| `onboarding` | `OnboardingState`, `Brand`, `LibraryModel` (gender/age/ethnicity), `LibraryBackground` |
| `admin_panel` | API супер-админа |
| `core` | базовые модели, `permissions.py`, `mixins.py`, `pagination.py` |

### 2.2 API v1 (`api/v1/`)

`auth/`, `users/`, `organizations/`, `products/`, `ai/`, `billing/`,
`integrations/`, `analytics/`, `admin/`, `callback/` (вебхуки kie.ai).
Swagger: `/api/docs/`, ReDoc: `/api/redoc/`.

### 2.3 Роли и доступ

```
SUPER_ADMIN · BUSINESS_OWNER · BUSINESS_MANAGER · READ_ONLY · API_CLIENT
```

Permission-классы: `IsSuperAdmin`, `IsEmailVerified`, `IsOrganizationMember`,
`IsOrganizationOwner`, `IsOrganizationManager`, `HasOrganizationRole`,
`CanManageOrganizationObject`, `APIClientPermission`.

Multi-tenant изоляция — фильтрация по заголовку `X-Organization-Id`.

Токены **раздельные**: супер-админ — `admin_auth_token` /
`admin_refresh_token`; пользователь — `access_token` (3 дня) /
`refresh_token` (30 дней).

### 2.4 Frontend проекта B

Два фронта:

1. **Next.js 14** (`webapp/frontend/`) — App Router, 31 страница
   (`(auth)`, `(onboarding)`, `(dashboard)`, `(admin)`), Radix UI +
   shadcn-стиль, TanStack Query + Table, Zustand (4 стора),
   react-hook-form + Zod, next-intl, recharts. Есть Jest + Playwright.
2. **Статические HTML** (`webapp/*.html`) — ~25 файлов по 20–110 КБ:
   `dashboard.html`, `products.html`, `settings.html`, `superadmin-*.html`.
   Похоже на более раннюю итерацию / прототип админки.

### 2.5 Ключевой бизнес-флоу проекта B (SKU-генерация)

`/dashboard/generations/new`:
```
Upload → POST /ai/analyze-product/ (Gemini, мультиязычный контент + SEO)
       → выбор LibraryModel + LibraryBackground
       → POST /ai/generate-images/ (kie.ai)
       → POST /ai/create-sku/  → Product + ProductCard + ProductImage
```

### 2.6 Документация проекта B (читать перед правками)

```
webapp/CLAUDE.md                 ← точка входа, правила и команды
webapp/ARCHITECTURE.md           ← 48 КБ, 14 разделов (as-is)
webapp/docs/ARCHITECTURE.auth.md
webapp/docs/ARCHITECTURE.generations.md      ← критично
webapp/docs/ARCHITECTURE.sku-generation.md
webapp/docs/ARCHITECTURE.image-generation-step2.md
webapp/docs/ARCHITECTURE.ai-errors.md
webapp/docs/QA-CHECKLIST-generations.md
webapp/frontend/CLAUDE.md + ARCHITECTURE{,.sidebar,.team}.md
```

Ветки репозитория B: `main`, `genspark_ai_developer`, `super_admin`,
`user_dashboard`. Последние коммиты — мобильная адаптация дашборда и
фиксы SKU-сохранения.

---

## 3. Найденные проблемы

### 3.1 Критично — безопасность

1. **API-ключ kie.ai захардкожен** в `coolay-backend/server.js:16`
   как fallback значения `process.env.KIE_API_KEY`. Ключ виден в исходниках
   и лежит на диске в открытом виде.
2. **`/api/generate-smart` полностью открыт** — нет авторизации, нет
   rate-limit, нет привязки к пользователю. Любой человек в интернете может
   жечь платные кредиты kie.ai бесконечно.
3. **`Access-Control-Allow-Origin: *`** на всех ответах API — эндпоинт
   можно вызывать с любого сайта.
4. **Авторизация целиком на клиенте**: логин/пароль `admin/admin` лежат в
   бандле, «токен» — строка `demo-token-<timestamp>` в localStorage.
   Обходится за 5 секунд через DevTools.

### 3.2 Функциональные разрывы

5. **Проверка дубликатов — фикция**: `scanDuplicates()` в
   `ToolWorkspaceView.vue` — это `Math.random() > 0.45`. При этом в UI это
   показано пользователю как реальный поиск по базе товаров.
6. **3 инструмента из 12 не имеют инструкции на бэкенде** —
   `product-stage`, `batch`, `product-card` молча падают в
   `DEFAULT_INSTRUCTION`, т.е. работают не так, как обещает их описание.
7. **11 из 17 маршрутов — заглушки** (все AI-студии, пакетная обработка,
   шаблоны, медиа-библиотека, проекты).
8. **Вся аналитика дашборда — из `mock.ts`**, не из реальных генераций
   (при этом `stores/generations.ts` уже умеет считать всё честно:
   `successRate`, `creditsSpent`, `activityByDay`, `byTool`, `bySource`).
9. **История генераций живёт в `localStorage`** — чистка кэша браузера
   стирает всю работу; между устройствами и сотрудниками ничего не видно.
10. **Интеграции (1С, МойСклад, Telegram-бот) — только UI**, backend нет.
    При этом лендинг на `/login` обещает «Прямая интеграция с 1С и МойСклад».

### 3.3 Технический долг

11. **Мёртвый код** в `data/generateApi.ts`: `generateImage()`,
    `buildPrompt()`, `BG_PROMPT`, `PromptOptions` — не используются нигде
    (рабочий путь только `generateSmart`).
12. **В dev-режиме генерация не работает**: в `vite.config.ts` нет
    `server.proxy` для `/api` → запросы уходят на `:5174` и падают.
13. **Артефакты сборки в git**: `vite.config.js`, `vite.config.d.ts`,
    `tsconfig*.tsbuildinfo`.
14. **Прогресс генерации имитируется таймером** (6 сек), реальный статус
    задачи kie.ai на фронт не транслируется. Для 2К/4К генераций
    (до 5 минут) пользователь не видит настоящего прогресса.
15. **Рассинхрон лимитов**: `MAX_BODY` = 35 МБ, nginx = 35M, а текст ошибки
    пользователю — «макс. 30 МБ».
16. **`0.5K` в UI молча превращается в `1K`** (минимум у API) — пользователь
    выбирает несуществующий режим.
17. **Нет тестов, линтера и CI** в проекте A (в проекте B — Jest + Playwright есть).
18. **Полное дублирование имени пакета** `coolay-frontend` в обоих
    проектах — легко перепутать директорию.
19. **Локализация вшита в код** — только русский, ни i18n, ни ключей
    (в проекте B — `next-intl` + мультиязычные поля в БД).
20. **Висячий процесс**: `node server.js` на порту 8793 (pid с 30 июня) —
    старый дубль coolay-backend, не используется nginx.

---

## 4. Как работать дальше

### 4.1 Обязательный выбор перед любой задачей

**Вопрос №1: какой из двух проектов правим?**

- «Поправь демо / кнопку / экран, который я вижу» → **проект A**
- «Нужны реальные пользователи, тарифы, БД, организации» → **проект B**
- «Демо должно перестать быть демо» → это **миграция A → B**, отдельный
  большой трек: подключить Vue SPA к Django API вместо mock и Node-прокси.

### 4.2 Команды проекта A

```bash
# Разработка
cd /var/www/webapp/coolay-frontend
npm run dev                 # :5174  (⚠️ /api не проксируется — см. проблему 12)

# Сборка (с проверкой типов)
npm run build               # vue-tsc -b && vite build
npm run build:nocheck       # только vite build

# Публикация на demo.coolay.website
cp -r dist/* /var/www/demo.coolay.website/dist/

# Backend
cp ../coolay-backend/server.js /var/www/demo.coolay.website/backend/server.js
pm2 restart coolay-backend
pm2 logs coolay-backend --nostream

# Проверка
curl -s https://demo.coolay.website/api/health
```

### 4.3 Команды проекта B (по `webapp/CLAUDE.md`)

```bash
kill -HUP $(cat /tmp/coolay-gunicorn.pid)   # reload Django
pm2 restart coolay-celery-worker            # reload Celery
pm2 restart coolay-frontend                 # reload Next.js
```

### 4.4 Рекомендуемый порядок исправлений в проекте A

**Сначала безопасность** (проблемы 1–4): вынести ключ в env/pm2, закрыть
`/api/*` авторизацией и rate-limit, ограничить CORS доменом.

**Потом честность UI** (5, 6, 16): либо реализовать проверку дублей, либо
убрать её из интерфейса; дописать 3 инструкции; убрать `0.5K`.

**Потом данные** (8, 9): перевести дашборд с `mock.ts` на
`stores/generations.ts` (там всё уже посчитано), историю — на серверное
хранилище.

**Потом покрытие** (7, 10): наполнить `SectionView`-заглушки или скрыть их
из сайдбара, чтобы не обещать лишнего.

**Параллельно гигиена** (11–14, 17): удалить мёртвый код, добавить
vite-proxy, вычистить артефакты из git, поднять ESLint.
