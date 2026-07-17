import type { DeviceSource } from '@/types'

export const sourceMeta: Record<DeviceSource, { label: string; icon: string }> = {
  web: { label: 'Веб', icon: 'monitor' },
  app: { label: 'Приложение', icon: 'smartphone' },
  telegram: { label: 'Telegram-бот', icon: 'telegram' },
}
