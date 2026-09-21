<script setup lang="ts">
import { computed, ref } from 'vue'
import ComponentPage from './ComponentPage.vue'

const metaModules = import.meta.glob('../src/components/*/meta.ts', { eager: true }) as Record<
  string,
  { default: { tag: string } }
>
const sourceModules = import.meta.glob('../src/components/*/Component.{vue,tsx}', {
  eager: true,
}) as Record<string, { default: unknown }>

interface Entry {
  name: string
  tag: string
  sourceComponent: unknown
  framework: 'vue' | 'react'
}

const entries = computed<Entry[]>(() =>
  Object.entries(metaModules).map(([path, mod]) => {
    const name = path.replace('../src/components/', '').replace('/meta.ts', '')
    const vueKey = `../src/components/${name}/Component.vue`
    const reactKey = `../src/components/${name}/Component.tsx`
    const isVue = vueKey in sourceModules
    return {
      name,
      tag: mod.default.tag,
      sourceComponent: sourceModules[isVue ? vueKey : reactKey]?.default,
      framework: isVue ? 'vue' : 'react',
    }
  }),
)

const currentName = ref<string>(entries.value[0]?.name ?? '')
const current = computed(() => entries.value.find((e) => e.name === currentName.value))
</script>

<template>
  <div class="layout">
    <aside class="sidebar">
      <h1>CTC Components</h1>
      <button
        v-for="entry in entries"
        :key="entry.name"
        type="button"
        :class="['nav-item', { active: entry.name === currentName }]"
        @click="currentName = entry.name"
      >
        {{ entry.name }}
        <small>{{ entry.framework }}</small>
      </button>
    </aside>
    <main class="content">
      <ComponentPage v-if="current" :key="current.name" :entry="current" />
    </main>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  min-height: 100vh;
}
.sidebar {
  width: 220px;
  padding: 16px;
  border-right: 1px solid var(--ctc-color-border);
  background: #fafafa;
}
.sidebar h1 {
  font-size: var(--ctc-font-size-md);
  margin: 0 0 16px;
}
.nav-item {
  display: flex;
  justify-content: space-between;
  width: 100%;
  margin-bottom: 4px;
  padding: 8px;
  border: none;
  border-radius: var(--ctc-radius-sm);
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.nav-item.active {
  background: var(--ctc-color-primary);
  color: #fff;
}
.nav-item small {
  opacity: 0.6;
}
.content {
  flex: 1;
  padding: 24px;
}
</style>
