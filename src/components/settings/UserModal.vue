<script setup lang="ts">
import { ref, watch } from 'vue'
import Icon from '@/components/ui/Icon.vue'
import type { TeamMember, MemberRole } from '@/types'

const props = defineProps<{ member: TeamMember | null }>()
const emit = defineEmits<{ close: []; save: [member: TeamMember] }>()

const roles: { key: MemberRole; label: string; desc: string }[] = [
  { key: 'admin', label: 'Администратор', desc: 'Полный доступ, управление участниками' },
  { key: 'editor', label: 'Редактор', desc: 'Создание и редактирование генераций' },
  { key: 'viewer', label: 'Наблюдатель', desc: 'Только просмотр истории и статистики' },
]

const isEdit = ref(false)
const form = ref<TeamMember>({
  id: '',
  name: '',
  email: '',
  role: 'editor',
  status: 'invited',
  source: 'web',
})

watch(
  () => props.member,
  (m) => {
    if (m) {
      isEdit.value = true
      form.value = { ...m }
    } else {
      isEdit.value = false
      form.value = {
        id: 'u' + Date.now(),
        name: '',
        email: '',
        role: 'editor',
        status: 'invited',
        source: 'web',
      }
    }
  },
  { immediate: true },
)

const error = ref('')

function submit() {
  if (!form.value.name.trim() || !form.value.email.trim()) {
    error.value = 'Заполните имя и email'
    return
  }
  if (!/^\S+@\S+\.\S+$/.test(form.value.email)) {
    error.value = 'Некорректный email'
    return
  }
  error.value = ''
  emit('save', { ...form.value })
}
</script>

<template>
  <div class="fixed inset-0 z-50 grid place-items-center p-4" @click.self="emit('close')">
    <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="emit('close')" />
    <div class="relative w-full max-w-md card shadow-pop animate-scale-in">
      <div class="flex items-center justify-between p-5 border-b border-ink-100">
        <h3 class="font-extrabold text-lg text-ink-900">
          {{ isEdit ? 'Редактировать участника' : 'Пригласить участника' }}
        </h3>
        <button class="grid place-items-center w-9 h-9 rounded-xl text-ink-500 hover:bg-ink-100" @click="emit('close')">
          <Icon name="x" :size="18" />
        </button>
      </div>

      <div class="p-5 space-y-4">
        <div>
          <label class="label">Имя</label>
          <input v-model="form.name" class="input" placeholder="Иван Иванов" />
        </div>
        <div>
          <label class="label">Email</label>
          <input v-model="form.email" class="input" placeholder="ivan@company.ru" :disabled="form.role === 'owner'" />
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

        <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
      </div>

      <div class="flex justify-end gap-3 p-5 border-t border-ink-100">
        <button class="btn btn-ghost btn-md" @click="emit('close')">Отмена</button>
        <button class="btn btn-accent btn-md" @click="submit">
          {{ isEdit ? 'Сохранить' : 'Отправить приглашение' }}
        </button>
      </div>
    </div>
  </div>
</template>
