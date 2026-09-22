<script setup lang="ts">
import { computed } from 'vue'
import { componentByName, components } from '@devtools/component-index'
import ComponentPicker from './ComponentPicker.vue'
import { usePersisted } from './use-persisted'

const selected = usePersisted('component', components[0]?.name ?? '')
// 存下来的组件名可能已经被删掉，落回第一个 —— 否则打开就是一片空白
if (!componentByName(selected.value)) selected.value = components[0]?.name ?? ''

const entry = computed(() => componentByName(selected.value))
</script>

<template>
  <div class="app">
    <ComponentPicker v-model="selected" />
    <main class="main">
      <p class="boot">{{ entry ? `${entry.name}（${entry.framework}）` : '左栏选一个组件' }}</p>
    </main>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  height: 100dvh;
}
.main {
  flex: 1;
  min-width: 0;
  padding: 24px;
}
.boot {
  color: var(--ew-color-text-secondary);
}
</style>
