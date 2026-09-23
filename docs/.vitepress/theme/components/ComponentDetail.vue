<script setup lang="ts">
import ComponentDemo from './ComponentDemo.vue'

defineProps<{ ws: string; name: string }>()
</script>

<template>
  <p class="hint">
    这个组件还没有独立的说明页。下面是它的实时面板；补充说明页可新建
    <code>docs/workspaces/{{ ws }}/{{ name }}.md</code>。
  </p>
  <ComponentDemo :name="name" />
</template>

<style scoped>
/* 文档站外壳走 --vp-*：--ew-* 不响应站点明暗切换 */
.hint {
  color: var(--vp-c-text-2);
  font-size: var(--ew-font-size-sm);
}
</style>
