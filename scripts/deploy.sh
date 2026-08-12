#!/usr/bin/env bash
#
# Деплой Coolay Studio на demo.coolay.website
#
#   bash scripts/deploy.sh            # собрать и выложить
#   bash scripts/deploy.sh --no-build # выложить уже собранный dist
#   bash scripts/deploy.sh --rollback # откатиться на предыдущую версию
#
# Что делает:
#   1. собирает фронт (vue-tsc + vite)
#   2. делает резервную копию текущего dist
#   3. синхронизирует dist в прод (rsync --delete, старые чанки удаляются)
#   4. проверяет, что сайт отвечает и отдаёт именно новую сборку
#   5. при провале проверки автоматически откатывается
#
set -euo pipefail

SRC="/var/www/webapp/coolay-frontend"
TARGET="/var/www/demo.coolay.website/dist"
BACKUP_DIR="/var/www/demo.coolay.website/dist-backups"
URL="https://demo.coolay.website"
BACKEND_SRC_DIR="/var/www/webapp/coolay-backend"
BACKEND_TARGET_DIR="/var/www/demo.coolay.website/backend"
# Модули бэкенда, которые публикуются на прод.
# ВАЖНО: список должен содержать ВСЕ файлы, которые импортирует server.js.
# Любой пропущенный модуль — это падение процесса при старте (ERR_MODULE_NOT_FOUND),
# потому что импорты в ES-модулях разрешаются сразу при загрузке.
BACKEND_FILES=(server.js sku.js env.js store.js templates.js team.js telegram.js auth.js plans.js sadmin.js)

log()  { printf '\033[1;32m▸\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Нужны права root (пишем в $TARGET)"

# ─────────────── Откат ───────────────
if [[ "${1:-}" == "--rollback" ]]; then
  LAST=$(ls -1d "$BACKUP_DIR"/* 2>/dev/null | tail -1) || true
  [[ -n "${LAST:-}" ]] || die "Нет резервных копий в $BACKUP_DIR"
  log "Откат на $LAST"
  rsync -a --delete "$LAST"/ "$TARGET"/
  chown -R www-data:www-data "$TARGET"
  log "Откат выполнен"
  exit 0
fi

# ─────────────── Сборка ───────────────
cd "$SRC"
if [[ "${1:-}" != "--no-build" ]]; then
  log "Сборка (vue-tsc + vite)…"
  npm run build
else
  log "Сборка пропущена (--no-build)"
fi

[[ -f "$SRC/dist/index.html" ]] || die "Нет $SRC/dist/index.html — сборка не удалась"

# Хэш нового главного бандла — по нему проверим, что прод обновился
NEW_ASSET=$(grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' "$SRC/dist/index.html" | head -1)
[[ -n "$NEW_ASSET" ]] || die "Не удалось определить имя бандла в index.html"
log "Новый бандл: $NEW_ASSET"

# ─────────────── Бэкап ───────────────
STAMP=$(date +%Y-%m-%d_%H-%M-%S)
mkdir -p "$BACKUP_DIR"
if [[ -d "$TARGET" && -n "$(ls -A "$TARGET" 2>/dev/null)" ]]; then
  log "Резервная копия → $BACKUP_DIR/$STAMP"
  rsync -a "$TARGET"/ "$BACKUP_DIR/$STAMP"/
  # держим только 5 последних копий
  ls -1d "$BACKUP_DIR"/*/ 2>/dev/null | head -n -5 | xargs -r rm -rf
else
  warn "Текущий dist пуст — бэкап не нужен"
fi

# ─────────────── Публикация ───────────────
log "Синхронизация в $TARGET"
mkdir -p "$TARGET"
rsync -a --delete "$SRC/dist"/ "$TARGET"/
chown -R www-data:www-data "$TARGET"

# ─────────────── Backend (если менялся) ───────────────
BACKEND_CHANGED=0
for f in "${BACKEND_FILES[@]}"; do
  SRC_F="$BACKEND_SRC_DIR/$f"
  DST_F="$BACKEND_TARGET_DIR/$f"
  # Отсутствующий модуль — фатально, а не предупреждение: server.js импортирует
  # его статически, и после перезапуска прод упал бы с ERR_MODULE_NOT_FOUND.
  [[ -f "$SRC_F" ]] || die "Нет $SRC_F, но он есть в BACKEND_FILES — деплой остановлен"
  if ! cmp -s "$SRC_F" "$DST_F"; then
    log "$f изменился — копирую в backend"
    mkdir -p "$BACKEND_TARGET_DIR"
    cp "$SRC_F" "$DST_F"
    BACKEND_CHANGED=1
  fi
done

if [[ $BACKEND_CHANGED -eq 1 ]]; then
  # Бэкенд теперь требует KIE_API_KEY и падает без него. Проверяем ДО
  # перезапуска, иначе уроним работающий прод.
  if [[ ! -f "$BACKEND_TARGET_DIR/.env" ]] && [[ -z "${KIE_API_KEY:-}" ]]; then
    die "Нет $BACKEND_TARGET_DIR/.env с KIE_API_KEY — перезапуск уронил бы backend.
     Создайте файл: printf 'KIE_API_KEY=<ключ>\\n' > $BACKEND_TARGET_DIR/.env && chmod 600 \$_"
  fi

  log "Перезапуск pm2 coolay-backend"
  pm2 restart coolay-backend >/dev/null 2>&1 || warn "pm2 restart не удался — проверьте вручную"
  sleep 2
  # Бэкенд должен ответить и подтвердить, что SKU-роуты подключены
  HEALTH=$(curl -s --max-time 10 "$URL/api/health" || echo '')
  if ! grep -q '"sku":true' <<<"$HEALTH"; then
    warn "/api/health не подтвердил SKU-роуты: $HEALTH"
  else
    log "Backend здоров, SKU-роуты активны"
  fi
else
  log "Backend без изменений"
fi

# ─────────────── Проверка ───────────────
log "Проверка прода…"
sleep 1

CODE=$(curl -s -o /dev/null -w '%{http_code}' "$URL/" || echo 000)
[[ "$CODE" == "200" ]] || { warn "Главная отдала $CODE — откат"; bash "$0" --rollback; die "Деплой отменён"; }

# index.html на проде должен ссылаться на новый бандл
if ! curl -s "$URL/?cachebust=$STAMP" | grep -q "$NEW_ASSET"; then
  warn "Прод не отдаёт $NEW_ASSET — откат"
  bash "$0" --rollback
  die "Деплой отменён"
fi

# новый чанк студии должен быть доступен
STUDIO=$(ls -1 "$TARGET/assets" | grep -oE 'ProductCardsStudioView-[A-Za-z0-9_-]+\.js' | head -1 || true)
if [[ -n "$STUDIO" ]]; then
  SCODE=$(curl -s -o /dev/null -w '%{http_code}' "$URL/assets/$STUDIO" || echo 000)
  [[ "$SCODE" == "200" ]] && log "Чанк студии отдаётся: $STUDIO" || warn "Чанк студии вернул $SCODE"
fi

# SPA fallback на новом маршруте
RCODE=$(curl -s -o /dev/null -w '%{http_code}' "$URL/studios/product-cards" || echo 000)
[[ "$RCODE" == "200" ]] && log "/studios/product-cards → 200" || warn "/studios/product-cards → $RCODE"

# API живо
API=$(curl -s "$URL/api/health" || echo '')
[[ "$API" == *'"ok":true'* ]] && log "API: $API" || warn "API не ответил ok: $API"

printf '\n\033[1;32m✓ Деплой завершён\033[0m  %s/studios/product-cards\n' "$URL"
printf '  Откат при необходимости: bash scripts/deploy.sh --rollback\n\n'
