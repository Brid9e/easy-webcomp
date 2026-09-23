<script setup lang="ts">
import { computed } from 'vue'
import ComponentCard from './ComponentCard.vue'

interface WorkspaceMetaShape {
  title?: string
  description?: string
}

const props = defineProps<{ ws: string }>()

const metaModules = import.meta.glob('@src/workspaces/*/workspace.ts', { eager: true }) as Record<
  string,
  { default: WorkspaceMetaShape }
>
const componentModules = import.meta.glob('@src/workspaces/*/components/*/Component.{vue,tsx}', {
  eager: true,
})

const segments = (path: string) => path.split('/')

const meta = computed<WorkspaceMetaShape>(
  () => Object.entries(metaModules).find(([p]) => segments(p).at(-2) === props.ws)?.[1].default ?? {},
)

// 只枚举组件名，不判框架：卡片上区分 Vue/React 的是依赖标签里第一枚（框架包），
// 那份数据由组件自己的源码扫出来，比从文件后缀推断更贴近「作者引了什么」。
const components = computed(() =>
  Object.keys(componentModules)
    .filter((p) => segments(p).at(-4) === props.ws)
    .map((p) => segments(p).at(-2) ?? '')
    .sort((a, b) => a.localeCompare(b)),
)
</script>

<template>
  <h1>{{ meta.title ?? ws }}</h1>
  <p v-if="meta.description" class="desc">{{ meta.description }}</p>

  <p v-if="components.length === 0" class="empty">
    这个工作空间下还没有组件。在 <code>src/workspaces/{{ ws }}/components/</code> 下新建一个目录、
    放入五个文件即可，不需要改任何配置。
  </p>
  <div v-else class="grid">
    <ComponentCard v-for="name in components" :key="name" :ws="ws" :name="name" />
  </div>
</template>

<style scoped>
/* 文档站外壳走 --vp-*：--ew-* 不响应站点明暗切换 */
.desc {
  color: var(--vp-c-text-2);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
  margin-top: 24px;
}
.empty {
  color: var(--vp-c-text-2);
}
</style>
