<script setup lang="ts">
import type { EventEntry } from '@devtools/preview-state'

defineProps<{ entries: EventEntry[] }>()
</script>

<template>
  <section class="panel">
    <h2>事件日志</h2>

    <p v-if="entries.length === 0" class="empty">操作组件试试</p>
    <ul v-else>
      <li v-for="(entry, i) in entries" :key="i">
        <code>ew-{{ entry.name }}</code> · {{ entry.at }} · {{ JSON.stringify(entry.detail) }}
      </li>
    </ul>
  </section>
</template>

<style scoped>
.panel h2 {
  margin: 0 0 12px;
  font-size: var(--ew-font-size-md);
}
ul {
  margin: 0;
  padding-left: 18px;
  font-size: var(--ew-font-size-sm);
}
.empty {
  margin: 0;
  color: var(--ew-color-text-secondary);
  font-size: var(--ew-font-size-sm);
}
</style>
