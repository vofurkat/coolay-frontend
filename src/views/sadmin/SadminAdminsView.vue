<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { sadminApi, isFail, type SadminUser } from '@/data/platformApi'

const admins = ref<SadminUser[]>([])
const meId = ref('')
const error = ref('')
const msg = ref('')
const form = ref({ login: '', name: '', password: '' })
const newPass = ref<Record<string, string>>({})

async function loadAll() {
  const res = await sadminApi.admins()
  if (isFail(res)) { error.value = res.error; return }
  admins.value = res.admins
  meId.value = res.meId
}
onMounted(loadAll)

async function createAdmin() {
  error.value = ''; msg.value = ''
  const res = await sadminApi.createAdmin(form.value)
  if (isFail(res)) { error.value = res.error; return }
  form.value = { login: '', name: '', password: '' }
  msg.value = 'Администратор создан'
  await loadAll()
}
async function changePass(id: string) {
  error.value = ''; msg.value = ''
  const res = await sadminApi.updateAdmin(id, { password: newPass.value[id] || '' })
  if (isFail(res)) { error.value = res.error; return }
  newPass.value[id] = ''
  msg.value = 'Пароль изменён'
}
async function removeAdmin(id: string) {
  if (!confirm('Удалить администратора?')) return
  const res = await sadminApi.deleteAdmin(id)
  if (isFail(res)) { error.value = res.error; return }
  await loadAll()
}
</script>
<template>
  <div>
    <h1 class="text-2xl font-extrabold text-ink-900 mb-6">Администраторы панели</h1>
    <div v-if="error" class="rounded-xl bg-red-50 text-red-600 px-4 py-3 mb-4">{{ error }}</div>
    <div v-if="msg" class="rounded-xl bg-green-50 text-green-700 px-4 py-3 mb-4">{{ msg }}</div>
    <div class="card p-5 mb-6 grid sm:grid-cols-4 gap-3 items-end">
      <div><label class="label">Логин</label><input v-model="form.login" class="input" /></div>
      <div><label class="label">Имя</label><input v-model="form.name" class="input" /></div>
      <div><label class="label">Пароль (мин. 8)</label><input v-model="form.password" type="password" class="input" /></div>
      <button class="btn btn-dark btn-md" @click="createAdmin">+ Добавить</button>
    </div>
    <div class="space-y-3">
      <div v-for="a in admins" :key="a.id" class="card p-4 flex flex-wrap items-center gap-3">
        <div class="flex-1 min-w-40">
          <div class="font-bold text-ink-900">{{ a.name }} <span v-if="a.id === meId" class="chip bg-accent text-ink-900 ml-1">это вы</span></div>
          <div class="text-xs text-ink-400">{{ a.login }} · вход: {{ a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString('ru-RU') : 'ещё не входил' }}</div>
        </div>
        <input v-model="newPass[a.id]" type="password" class="input max-w-48" placeholder="Новый пароль" />
        <button class="btn btn-outline btn-sm" @click="changePass(a.id)">Сменить пароль</button>
        <button v-if="a.id !== meId" class="btn btn-outline btn-sm !text-red-600" @click="removeAdmin(a.id)">Удалить</button>
      </div>
    </div>
  </div>
</template>
