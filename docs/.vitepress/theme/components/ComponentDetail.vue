<script setup lang="ts">
import ComponentDemo from './ComponentDemo.vue'
import ComponentHeader from './ComponentHeader.vue'

defineProps<{ ws: string; name: string }>()
</script>

<template>
  <!-- 标题得由这里给：动态路由的 md 正文只有一行组件调用，没有 `# 标题` 可供 VitePress
       抽取，散文页有的那颗头只能在这里补出来（页面 <title> 在 config.mts 的
       transformPageData 里补）。 -->
  <ComponentHeader :name="name" />
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
