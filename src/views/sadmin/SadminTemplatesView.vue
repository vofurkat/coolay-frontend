<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { sadminApi, isFail, type Template } from '@/data/platformApi'

const templates = ref<Template[]>([])
const error = ref('')
const showForm = ref(false)
const form = ref({ name: '', category: '', description: '', prompt: '', image: '' })

async function loadAll() {
  const res = await sadminApi.templates()
  if (isFail(res)) { error.value = res.error; return }
  templates.value = res.templates
}
onMounted(loadAll)

function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  const r = new FileReader()
  r.onload = () => { form.value.image = String(r.result) }
  r.readAsDataURL(f)
}
async function createTpl() {
  error.value = ''
  const res = await sadminApi.createTemplate({
    name: form.value.name,
    category: form.value.category,
    description: form.value.description,
    references: [{ image: form.value.image, prompt: form.value.prompt }],
  })
  if (isFail(res)) { error.value = res.error; return }
  showForm.value = false
  form.value = { name: '', category: '', description: '', prompt: '', image: '' }
  await loadAll()
}
async function removeTpl(id: string) {
  if (!confirm('Удалить системный шаблон?')) return
  const res = await sadminApi.deleteTemplate(id)
  if (isFail(res)) { error.value = res.error; return }
  await loadAll()
}
</script>
<template>
  <div>
    <div class="flex items-center justify-between mb-2">
      <h1 class="text-2xl font-extrabold text-ink-900">Системные шаблоны</h1>
      <button class="btn btn-accent btn-md" @click="showForm = !showForm">+ Новый шаблон</button>
    </div>
    <p class="text-sm text-ink-400 mb-6">Видны всем клиентам в разделе «Шаблоны» (только чтение — клиент может сделать копию)</p>
    <div v-if="error" class="rounded-xl bg-red-50 text-red-600 px-4 py-3 mb-4">{{ error }}</div>
    <div v-if="showForm" class="card p-5 mb-6 space-y-3">
      <div class="grid sm:grid-cols-2 gap-3">
        <div><label class="label">Название</label><input v-model="form.name" class="input" /></div>
        <div><label class="label">Категория (через /)</label><input v-model="form.category" class="input" placeholder="Одежда / Футболки" /></div>
      </div>
      <div><label class="label">Описание</label><input v-model="form.description" class="input" /></div>
      <div><label class="label">Промт референса</label><textarea v-model="form.prompt" class="input" rows="3" /></div>
      <div><label class="label">Фото референса</label><input type="file" accept="image/*" class="input" @change="onFile" /></div>
      <button class="btn btn-dark btn-md" @click="createTpl">Создать</button>
    </div>
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div v-for="t in templates" :key="t.id" class="card p-4">
        <img v-if="t.references[0]?.image" :src="t.references[0].image" class="w-full h-36 object-cover rounded-lg mb-3" />
        <div class="font-bold text-ink-900">{{ t.name }}</div>
        <div class="text-xs text-ink-400 mb-2">{{ t.categoryPath }} · использован {{ t.usageCount }} раз</div>
        <p v-if="t.description" class="text-sm text-ink-500 mb-3 line-clamp-2">{{ t.description }}</p>
        <button class="btn btn-outline btn-sm !text-red-600" @click="removeTpl(t.id)">Удалить</button>
      </div>
    </div>
    <div v-if="!templates.length" class="text-sm text-ink-400 py-8 text-center">Системных шаблонов пока нет</div>
  </div>
</template>
