<script setup lang="ts">
/**
 * Добавление и редактирование сотрудника.
 *
 * ТЕЛЕФОН ОБЯЗАТЕЛЕН. Именно по номеру Telegram-бот пускает сотрудника внутрь:
 * при /start бот просит поделиться контактом и сверяет его с базой. Без номера
 * сотрудник физически не сможет работать через бота, поэтому поле не
 * опциональное — иначе администратор добавил бы человека и потом долго искал,
 * почему бот его не узнаёт.
 *
 * EMAIL, наоборот, необязателен: часть сотрудников работает только через бота
 * и почты у них в системе нет.
 */
import { computed, ref, watch } from 'vue'
import Icon from '@/components/ui/Icon.vue'
import type { Employee, EmployeeRole } from '@/data/platformApi'

const props = defineProps<{ member: Employee | null; saving?: boolean; serverError?: string }>()
const emit = defineEmits<{ close: []; save: [payload: Partial<Employee>] }>()

const roles: { key: EmployeeRole; label: string; desc: string }[] = [
  { key: 'admin', label: 'Администратор', desc: 'Полный доступ, управление участниками' },
  { key: 'editor', label: 'Редактор', desc: 'Создание и редактирование генераций' },
  { key: 'viewer', label: 'Наблюдатель', desc: 'Только просмотр истории и статистики' },
]

const isEdit = computed(() => !!props.member)

const form = ref({
  fullName: '',
  phone: '',
  email: '',
  role: 'editor' as EmployeeRole,
  canGenerate: true,
})

watch(
  () => props.member,
  (m) => {
    form.value = m
      ? {
          fullName: m.fullName,
          phone: m.phone ? '+' + m.phone.replace(/^\+/, '') : '',
          email: m.email || '',
          role: m.role,
          canGenerate: m.canGenerate !== false,
        }
      : { fullName: '', phone: '', email: '', role: 'editor', canGenerate: true }
    error.value = ''
  },
  { immediate: true },
)

const error = ref('')

/** Только цифры — в том же виде номер хранит бэкенд (team.js normPhone). */
const digits = computed(() => form.value.phone.replace(/\D/g, ''))

/** Смена номера у существующего сотрудника отвяжет его Telegram. */
const phoneChanged = computed(
  () => isEdit.value && !!props.member?.telegramId && digits.value !== props.member?.phone,
)

function submit() {
  if (!form.value.fullName.trim()) {
    error.value = 'Укажите ФИО сотрудника'
    return
  }
  if (digits.value.length < 9) {
    error.value = 'Укажите корректный номер телефона — по нему работает Telegram-бот'
    return
  }
  if (form.value.email.trim() && !/^\S+@\S+\.\S+$/.test(form.value.email.trim())) {
    error.value = 'Некорректный email'
    return
  }
  error.value = ''
  emit('save', {
    fullName: form.value.fullName.trim(),
    phone: digits.value,
    email: form.value.email.trim(),
    role: form.value.role,
    canGenerate: form.value.canGenerate,
  })
}
</script>

<template>
  <div class="fixed inset-0 z-50 grid place-items-center p-4" @click.self="emit('close')">
    <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="emit('close')" />
    <div class="relative w-full max-w-md card shadow-pop animate-scale-in max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between p-5 border-b border-ink-100">
        <h3 class="font-extrabold text-lg text-ink-900">
          {{ isEdit ? 'Редактировать сотрудника' : 'Добавить сотрудника' }}
        </h3>
        <button
          class="grid place-items-center w-9 h-9 rounded-xl text-ink-500 hover:bg-ink-100"
          @click="emit('close')"
        >
          <Icon name="x" :size="18" />
        </button>
      </div>

      <div class="p-5 space-y-4">
        <div>
          <label class="label">ФИО</label>
          <input v-model="form.fullName" class="input" placeholder="Иван Иванов" />
        </div>

        <div>
          <label class="label">
            Телефон <span class="text-red-500">*</span>
          </label>
          <input v-model="form.phone" class="input" placeholder="+7 900 123-45-67" inputmode="tel" />
          <p class="text-xs text-ink-400 mt-1 flex items-start gap-1.5">
            <Icon name="send" :size="13" class="mt-0.5 shrink-0" />
            <span>
              По этому номеру сотрудник войдёт в бота
              <span class="font-semibold text-ink-600">@coolay_bot</span>. Укажите тот же номер,
              что привязан к его Telegram.
            </span>
          </p>
        </div>

        <div>
          <label class="label">Email <span class="text-ink-400 font-normal">— необязательно</span></label>
          <input v-model="form.email" class="input" placeholder="ivan@company.ru" />
        </div>

        <!-- Статус подключения к боту: администратору важно видеть, дошёл ли
             сотрудник до бота, иначе непонятно, почему он не работает. -->
        <div
          v-if="isEdit"
          class="rounded-xl px-3 py-2.5 text-xs flex items-start gap-2"
          :class="member?.telegramId ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'"
        >
          <Icon :name="member?.telegramId ? 'check' : 'alert'" :size="14" class="mt-0.5 shrink-0" />
          <span v-if="member?.telegramId">
            Telegram подключён<template v-if="member?.telegramUsername">
              — @{{ member.telegramUsername }}</template
            >
          </span>
          <span v-else>
            Telegram не подключён. Сотруднику нужно открыть @coolay_bot, нажать /start и
            поделиться номером.
          </span>
        </div>

        <div>
          <label class="label">Роль</label>
          <div class="space-y-2">
            <button
              v-for="r in roles"
              :key="r.key"
              type="button"
              @click="form.role = r.key"
              class="w-full text-left rounded-xl border px-3 py-2.5 transition"
              :class="form.role === r.key ? 'border-ink-900 bg-ink-50' : 'border-ink-200 hover:border-ink-300'"
            >
              <div class="flex items-center justify-between">
                <span class="font-bold text-sm text-ink-900">{{ r.label }}</span>
                <span
                  v-if="form.role === r.key"
                  class="grid place-items-center w-5 h-5 rounded-full bg-ink-900 text-accent"
                >
                  <Icon name="check" :size="12" />
                </span>
              </div>
              <p class="text-xs text-ink-400 mt-0.5">{{ r.desc }}</p>
            </button>
          </div>
        </div>

        <label class="flex items-center justify-between gap-3 rounded-xl border border-ink-200 px-3 py-2.5 cursor-pointer">
          <span>
            <span class="font-bold text-sm text-ink-900">Разрешить генерации</span>
            <span class="block text-xs text-ink-400 mt-0.5">Списывает кредиты с баланса компании</span>
          </span>
          <input v-model="form.canGenerate" type="checkbox" class="w-5 h-5 accent-ink-900 shrink-0" />
        </label>

        <p v-if="phoneChanged" class="text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2">
          Номер изменён — привязка Telegram сбросится, сотруднику нужно будет заново
          подтвердить номер в боте.
        </p>

        <p v-if="error || serverError" class="text-sm text-red-600">{{ error || serverError }}</p>
      </div>

      <div class="flex justify-end gap-3 p-5 border-t border-ink-100">
        <button class="btn btn-ghost btn-md" :disabled="saving" @click="emit('close')">Отмена</button>
        <button class="btn btn-accent btn-md" :disabled="saving" @click="submit">
          <Icon v-if="saving" name="loader" :size="16" class="animate-spin" />
          {{ saving ? 'Сохранение…' : isEdit ? 'Сохранить' : 'Добавить сотрудника' }}
        </button>
      </div>
    </div>
  </div>
</template>
