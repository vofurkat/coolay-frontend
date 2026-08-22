<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { sadminApi, isFail, type SadminClientRow, type SadminPlan, type UsageLogItem } from '@/data/platformApi'

const route = useRoute()
const id = route.params.id as string
const client = ref<SadminClientRow | null>(null)
const accounts = ref<Array<{ id: string; email: string; name: string; role: string; provider: string }>>([])
const usage = ref<UsageLogItem[]>([])
const plans = ref<SadminPlan[]>([])
const error = ref('')
const msg = ref('')
const creditAmount = ref(100)
const creditComment = ref('')

async function loadAll() {
  const res = await sadminApi.client(id)
  if (isFail(res)) { error.value = res.error; return }
  client.value = res.client
  accounts.value = res.accounts
  usage.value = res.usage
  plans.value = res.plans
}
onMounted(loadAll)

async function setPlan(plan: string) {
  msg.value = ''
  const res = await sadminApi.updateClient(id, { plan })
  if (isFail(res)) { error.value = res.error; return }
  client.value = res.client
  msg.value = 'Тариф обновлён — новый пакет кредитов начислен'
}
async function toggleBlock() {
  if (!client.value) return
  const res = await sadminApi.updateClient(id, { status: client.value.status === 'active' ? 'blocked' : 'active' })
  if (isFail(res)) { error.value = res.error; return }
  client.value = res.client
}
async function addCredits(sign: number) {
  msg.value = ''
  const res = await sadminApi.addCredits(id, sign * Math.abs(creditAmount.value), creditComment.value)
  if (isFail(res)) { error.value = res.error; return }
  client.value = res.client
  msg.value = 'Кредиты обновлены'
}
const fmt = (s: string) => new Date(s).toLocaleString('ru-RU')
</script>
<template>
  <div v-if="client">
    <RouterLink to="/sadmin/clients" class="text-sm text-ink-400 hover:text-ink-900">← Все клиенты</RouterLink>
    <div class="flex items-center justify-between mt-2 mb-6">
      <div>
        <h1 class="text-2xl font-extrabold text-ink-900">{{ client.name }}</h1>
        <p class="text-sm text-ink-400">{{ client.email }} · с {{ new Date(client.createdAt).toLocaleDateString('ru-RU') }}</p>
      </div>
      <button class="btn btn-md" :class="client.status === 'active' ? 'btn-outline !text-red-600 !border-red-200' : 'btn-dark'" @click="toggleBlock">
        {{ client.status === 'active' ? 'Заблокировать' : 'Разблокировать' }}
      </button>
    </div>
    <div v-if="error" class="rounded-xl bg-red-50 text-red-600 px-4 py-3 mb-4">{{ error }}</div>
    <div v-if="msg" class="rounded-xl bg-green-50 text-green-700 px-4 py-3 mb-4">{{ msg }}</div>

    <div class="grid lg:grid-cols-3 gap-6">
      <div class="card p-5">
        <h2 class="font-bold text-ink-900 mb-3">Тариф и кредиты</h2>
        <div class="text-sm text-ink-700 mb-1">Осталось <b>{{ client.credits.left }}</b> из {{ client.credits.limit }} (бонусных: {{ client.credits.extra }})</div>
        <div class="h-2 rounded-full bg-ink-100 mb-4"><div class="h-2 rounded-full bg-accent" :style="{ width: (client.credits.limit ? Math.min(100, Math.round(client.credits.left / client.credits.limit * 100)) : 0) + '%' }" /></div>
        <label class="label">Тариф</label>
        <select class="input" :value="client.plan" @change="setPlan(($event.target as HTMLSelectElement).value)">
          <option v-for="p in plans" :key="p.key" :value="p.key">{{ p.label }} — {{ p.monthlyCredits }} кр. / ${{ p.price }}</option>
        </select>
        <div class="mt-4 pt-4 border-t border-ink-100">
          <label class="label">Начислить / списать кредиты</label>
          <input v-model.number="creditAmount" type="number" class="input mb-2" min="1" />
          <input v-model="creditComment" type="text" class="input mb-2" placeholder="Комментарий (необязательно)" />
          <div class="flex gap-2">
            <button class="btn btn-accent btn-sm flex-1" @click="addCredits(1)">+ Начислить</button>
            <button class="btn btn-outline btn-sm flex-1" @click="addCredits(-1)">− Списать</button>
          </div>
        </div>
      </div>
      <div class="card p-5">
        <h2 class="font-bold text-ink-900 mb-3">Аккаунты ({{ accounts.length }})</h2>
        <div v-for="a in accounts" :key="a.id" class="py-2 border-b border-ink-50 last:border-0">
          <div class="text-sm font-bold text-ink-900">{{ a.name }} <span class="chip bg-ink-50 text-ink-500 ml-1">{{ a.role }}</span></div>
          <div class="text-xs text-ink-400">{{ a.email }} · {{ a.provider }}</div>
        </div>
        <div class="mt-4 pt-3 border-t border-ink-100 text-sm text-ink-500 space-y-1">
          <div>Сотрудников: <b class="text-ink-900">{{ client.employees }}</b></div>
          <div>Проектов: <b class="text-ink-900">{{ client.projects }}</b></div>
          <div>Своих шаблонов: <b class="text-ink-900">{{ client.templates }}</b></div>
        </div>
      </div>
      <div class="card p-5">
        <h2 class="font-bold text-ink-900 mb-3">Последние списания</h2>
        <div v-for="u in usage" :key="u.id" class="flex justify-between py-2 border-b border-ink-50 last:border-0 text-sm">
          <span class="text-ink-700">{{ u.tool }}</span>
          <span class="text-ink-400 text-xs">−{{ u.credits }} · {{ fmt(u.at) }}</span>
        </div>
        <div v-if="!usage.length" class="text-sm text-ink-400 py-4 text-center">Списаний нет</div>
      </div>
    </div>
  </div>
  <div v-else-if="error" class="rounded-xl bg-red-50 text-red-600 px-4 py-3">{{ error }}</div>
</template>
