<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { sadminApi, isFail, type SadminPlan } from '@/data/platformApi'

const plans = ref<SadminPlan[]>([])
const error = ref('')
const form = ref({ key: '', label: '', monthlyCredits: 100, price: 0, description: '' })
const showForm = ref(false)

async function loadAll() {
  const res = await sadminApi.plans()
  if (isFail(res)) { error.value = res.error; return }
  plans.value = res.plans
}
onMounted(loadAll)

async function savePlan(p: SadminPlan) {
  const res = await sadminApi.updatePlan(p.key, { label: p.label, monthlyCredits: p.monthlyCredits, price: p.price, description: p.description })
  if (isFail(res)) { error.value = res.error; return }
  await loadAll()
}
async function createPlan() {
  const res = await sadminApi.createPlan(form.value)
  if (isFail(res)) { error.value = res.error; return }
  showForm.value = false
  form.value = { key: '', label: '', monthlyCredits: 100, price: 0, description: '' }
  await loadAll()
}
async function removePlan(key: string) {
  if (!confirm('Удалить тариф ' + key + '?')) return
  const res = await sadminApi.deletePlan(key)
  if (isFail(res)) { error.value = res.error; return }
  await loadAll()
}
</script>
<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-extrabold text-ink-900">Тарифы</h1>
      <button class="btn btn-accent btn-md" @click="showForm = !showForm">+ Новый тариф</button>
    </div>
    <div v-if="error" class="rounded-xl bg-red-50 text-red-600 px-4 py-3 mb-4">{{ error }}</div>
    <div v-if="showForm" class="card p-5 mb-6 grid sm:grid-cols-5 gap-3 items-end">
      <div><label class="label">Ключ</label><input v-model="form.key" class="input" placeholder="premium" /></div>
      <div><label class="label">Название</label><input v-model="form.label" class="input" placeholder="Premium" /></div>
      <div><label class="label">Кредитов / мес</label><input v-model.number="form.monthlyCredits" type="number" class="input" /></div>
      <div><label class="label">Цена, $</label><input v-model.number="form.price" type="number" class="input" /></div>
      <button class="btn btn-dark btn-md" @click="createPlan">Создать</button>
    </div>
    <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div v-for="p in plans" :key="p.key" class="card p-5">
        <div class="flex items-center justify-between mb-3">
          <span class="chip bg-ink-900 text-white">{{ p.key }}</span>
          <span class="text-xs text-ink-400">{{ p.clients || 0 }} клиент(ов)</span>
        </div>
        <label class="label">Название</label>
        <input v-model="p.label" class="input mb-2" />
        <label class="label">Кредит-токенов в месяц</label>
        <input v-model.number="p.monthlyCredits" type="number" class="input mb-2" />
        <label class="label">Цена, $</label>
        <input v-model.number="p.price" type="number" class="input mb-3" />
        <div class="flex gap-2">
          <button class="btn btn-accent btn-sm flex-1" @click="savePlan(p)">Сохранить</button>
          <button class="btn btn-outline btn-sm !text-red-600" :disabled="!!p.clients" @click="removePlan(p.key)">✕</button>
        </div>
      </div>
    </div>
  </div>
</template>
