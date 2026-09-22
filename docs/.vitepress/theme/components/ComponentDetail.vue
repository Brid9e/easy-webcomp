<script setup lang="ts">
import ComponentDemo from './ComponentDemo.vue'

defineProps<{ ws: string; name: string }>()
</script>

<template>
  <p class="hint">
    这个组件还没有独立的说明页。下面是它的实时面板 —— 想补散文，新建
    <code>docs/workspaces/{{ ws }}/{{ name }}.md</code> 即可。
  </p>
  <ComponentDemo :name="name" />
</template>

<style scoped>
.hint {
  color: var(--ew-color-text-secondary);
  font-size: var(--ew-font-size-sm);
}
</style>
