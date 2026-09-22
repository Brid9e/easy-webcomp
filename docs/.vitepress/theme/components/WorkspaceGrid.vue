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

const components = computed(() =>
  Object.keys(componentModules)
    .filter((p) => segments(p).at(-4) === props.ws)
    .map((p) => ({
      name: segments(p).at(-2) ?? '',
      framework: p.endsWith('.vue') ? ('vue' as const) : ('react' as const),
    }))
    .sort((a, b) => a.name.localeCompare(b.name)),
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
    <ComponentCard
      v-for="c in components"
      :key="c.name"
      :ws="ws"
      :name="c.name"
      :framework="c.framework"
    />
  </div>
</template>

<style scoped>
.desc {
  color: var(--ew-color-text-secondary);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  margin-top: 24px;
}
.empty {
  color: var(--ew-color-text-secondary);
}
</style>
