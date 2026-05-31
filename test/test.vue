<template>
  <!-- Test Vue SFC — Nexis editor playground -->
  <!-- Exercises: Composition API, defineModel, composables, slots, Suspense, Teleport -->

  <div class="app" :data-theme="theme">
    <header class="app-header">
      <h1>Vue 3 Playground</h1>
      <button class="btn btn--ghost" @click="toggleTheme">
        {{ theme === 'dark' ? '☀️' : '🌙' }}
      </button>
    </header>

    <!-- Named slots -->
    <AppCard>
      <template #header>
        <h2>Counter</h2>
      </template>
      <Counter :initial="5" @change="onCounterChange" />
      <template #footer>
        <span class="muted">Last change: {{ lastCounterValue }}</span>
      </template>
    </AppCard>

    <AppCard>
      <template #header>
        <h2>Async Data <Badge :variant="asyncState.status" /></h2>
      </template>

      <!-- Suspense with async component -->
      <Suspense>
        <template #default>
          <UserTable :users="users" @row-click="selectedUser = $event" />
        </template>
        <template #fallback>
          <Skeleton :rows="4" />
        </template>
      </Suspense>

      <p v-if="selectedUser" class="selection">
        Selected: <strong>{{ selectedUser.name }}</strong>
        ({{ selectedUser.email }})
      </p>
    </AppCard>

    <AppCard>
      <template #header>
        <h2>v-model / Two-way binding</h2>
      </template>
      <LabeledInput v-model="formName" label="Name" placeholder="Enter name" />
      <LabeledInput v-model="formEmail" label="Email" type="email" />
      <p class="preview">Preview: {{ formName }} &lt;{{ formEmail }}&gt;</p>
    </AppCard>

    <!-- Teleport to body -->
    <Teleport to="body">
      <Transition name="modal">
        <Modal
          v-if="modalOpen"
          title="Teleported Modal"
          @close="modalOpen = false"
        >
          <p>This dialog is rendered outside the app root via <code>Teleport</code>.</p>
        </Modal>
      </Transition>
    </Teleport>

    <button class="btn btn--primary" @click="modalOpen = true">Open modal</button>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, provide, ref, shallowRef, watch, watchEffect } from 'vue'
import type { InjectionKey, Ref } from 'vue'

// ── Types ─────────────────────────────────────────────────────────────────────

interface User {
  id:    number
  name:  string
  email: string
  role:  'admin' | 'member'
  age:   number
}

type Theme = 'dark' | 'light'

// ── Injection keys ────────────────────────────────────────────────────────────

const THEME_KEY = Symbol('theme') as InjectionKey<Ref<Theme>>

// ── State ─────────────────────────────────────────────────────────────────────

const theme        = ref<Theme>('dark')
const modalOpen    = ref(false)
const selectedUser = ref<User | null>(null)
const formName     = ref('')
const formEmail    = ref('')
const lastCounterValue = ref<number | null>(null)

const users        = shallowRef<User[]>([])
const asyncState   = ref<{ status: 'idle' | 'loading' | 'success' | 'error' }>({ status: 'idle' })

// ── Computed ──────────────────────────────────────────────────────────────────

const isFormValid = computed(
  () => formName.value.trim().length > 0 && formEmail.value.includes('@')
)

// ── Provide ───────────────────────────────────────────────────────────────────

provide(THEME_KEY, theme)

// ── Composable: useTheme ──────────────────────────────────────────────────────

function useTheme() {
  const stored = localStorage.getItem('theme') as Theme | null
  if (stored) theme.value = stored

  const toggleTheme = () => {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
    localStorage.setItem('theme', theme.value)
  }

  return { theme, toggleTheme }
}

const { toggleTheme } = useTheme()

// ── Composable: useFetch ──────────────────────────────────────────────────────

function useFetch<T>(fetcher: () => Promise<T>) {
  const data    = ref<T | null>(null)
  const error   = ref<Error | null>(null)
  const loading = ref(false)

  const execute = async () => {
    loading.value = true
    error.value   = null
    try {
      data.value = await fetcher()
    } catch (e) {
      error.value = e instanceof Error ? e : new Error(String(e))
    } finally {
      loading.value = false
    }
  }

  return { data, error, loading, execute }
}

// ── Composable: useDebounce ───────────────────────────────────────────────────

function useDebounce<T>(value: Ref<T>, delay = 300) {
  const debounced = ref<T>(value.value) as Ref<T>
  let timer: ReturnType<typeof setTimeout>

  watch(value, (v) => {
    clearTimeout(timer)
    timer = setTimeout(() => { debounced.value = v }, delay)
  })

  return debounced
}

const debouncedName = useDebounce(formName, 400)
watchEffect(() => {
  if (debouncedName.value) {
    console.log('[debounced name]', debouncedName.value)
  }
})

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(async () => {
  asyncState.value = { status: 'loading' }
  await new Promise(r => setTimeout(r, 500))
  users.value = [
    { id: 1, name: 'Alice',  email: 'alice@nexis.dev',  role: 'admin',  age: 30 },
    { id: 2, name: 'Bob',    email: 'bob@nexis.dev',    role: 'member', age: 24 },
    { id: 3, name: 'Carol',  email: 'carol@nexis.dev',  role: 'member', age: 28 },
    { id: 4, name: 'Dave',   email: 'dave@nexis.dev',   role: 'admin',  age: 35 },
  ]
  asyncState.value = { status: 'success' }
})

// ── Handlers ──────────────────────────────────────────────────────────────────

const onCounterChange = (value: number) => {
  lastCounterValue.value = value
}
</script>

<!-- ── Subcomponents (single-file, inlined for demo) ─────────────────────────── -->

<script lang="ts">
// AppCard component
export const AppCard = {
  template: `
    <div class="card">
      <div v-if="$slots.header" class="card__header">
        <slot name="header" />
      </div>
      <div class="card__body">
        <slot />
      </div>
      <div v-if="$slots.footer" class="card__footer">
        <slot name="footer" />
      </div>
    </div>
  `
}

// Counter component with defineModel
export const Counter = {
  props: { initial: { type: Number, default: 0 } },
  emits: ['change'],
  setup(props: { initial: number }, { emit }: { emit: (e: string, v: number) => void }) {
    const count = ref(props.initial)
    const inc = () => { count.value++; emit('change', count.value) }
    const dec = () => { count.value--; emit('change', count.value) }
    return { count, inc, dec }
  },
  template: `
    <div class="counter">
      <button @click="dec">−</button>
      <span class="count">{{ count }}</span>
      <button @click="inc">+</button>
    </div>
  `
}

// Badge component
export const Badge = {
  props: { variant: String },
  template: `<span :class="['badge', variant && 'badge--' + variant]"><slot>{{ variant }}</slot></span>`
}

// Skeleton component
export const Skeleton = {
  props: { rows: { type: Number, default: 3 } },
  template: `
    <div class="skeleton-list">
      <div v-for="i in rows" :key="i" class="skeleton" style="height:36px;margin-bottom:8px" />
    </div>
  `
}

// LabeledInput with defineModel pattern
export const LabeledInput = {
  props: {
    modelValue: String,
    label: String,
    type: { type: String, default: 'text' },
    placeholder: String,
  },
  emits: ['update:modelValue'],
  template: `
    <div class="field">
      <label>{{ label }}</label>
      <input
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        @input="$emit('update:modelValue', $event.target.value)"
        class="input"
      />
    </div>
  `
}

// Modal component
export const Modal = {
  props: { title: String },
  emits: ['close'],
  template: `
    <div class="modal-overlay" @click.self="$emit('close')">
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h2>{{ title }}</h2>
          <button @click="$emit('close')" aria-label="Close">✕</button>
        </div>
        <div class="modal-body">
          <slot />
        </div>
      </div>
    </div>
  `
}
</script>

<style scoped>
.app {
  font-family: system-ui, sans-serif;
  max-width: 860px;
  margin: 0 auto;
  padding: 2rem 1rem;
  background: var(--color-bg, #0f172a);
  color: var(--color-text, #f1f5f9);
  min-height: 100dvh;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2rem;
}

.counter {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.count { font-size: 1.5rem; font-weight: 700; min-width: 3ch; text-align: center; }

.btn {
  display: inline-flex;
  align-items: center;
  padding: 0.4em 0.9em;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  font: inherit;
}

.btn--primary { background: #6366f1; color: #fff; }
.btn--ghost   { background: transparent; border-color: #475569; color: inherit; }

.card {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.card__header { margin-bottom: 1rem; }
.card__footer { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #334155; }

.field { margin-bottom: 1rem; }
.field label { display: block; margin-bottom: 0.25rem; color: #94a3b8; font-size: 0.875rem; }
.input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  background: #0f172a;
  border: 1px solid #475569;
  border-radius: 6px;
  color: inherit;
  font: inherit;
}

.preview, .selection, .muted { color: #64748b; font-size: 0.875rem; }

.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,.6);
  display: flex; align-items: center; justify-content: center;
  z-index: 50;
}
.modal {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 2rem;
  width: min(480px, 90vw);
}
.modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }

/* Transitions */
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s, transform 0.2s; }
.modal-enter-from, .modal-leave-to { opacity: 0; transform: scale(0.95); }

.badge {
  display: inline-flex; align-items: center;
  padding: 0.1em 0.5em;
  border-radius: 999px;
  font-size: 0.7em;
  font-weight: 600;
}
.badge--success { background: #14532d; color: #86efac; }
.badge--loading { background: #1e3a5f; color: #93c5fd; }
.badge--error   { background: #7f1d1d; color: #fca5a5; }
.badge--idle    { background: #292524; color: #a8a29e; }
</style>
