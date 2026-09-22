<script setup lang="ts">
import { computed } from 'vue'
import { VPLink } from 'vitepress/theme'

interface WorkspaceMetaShape {
  title?: string
  description?: string
}

const metaModules = import.meta.glob('@src/workspaces/*/workspace.ts', { eager: true }) as Record<
  string,
  { default: WorkspaceMetaShape }
>
const componentModules = import.meta.glob('@src/workspaces/*/components/*/Component.{vue,tsx}', {
  eager: true,
})

// glob 生成的 key 形状是实现细节，只按路径段取值：
// .../workspaces/<ws>/workspace.ts 与 .../workspaces/<ws>/components/<name>/Component.vue
const wsOfMeta = (path: string) => path.split('/').at(-2) ?? ''
const wsOfComponent = (path: string) => path.split('/').at(-4) ?? ''

// 空间页是 index 路由，产物在 workspaces/<id>/index.html —— 末尾这个斜杠不能省。
// normalizeLink 只对以 `/` 结尾的链接不加 .html；少了它会拼成 workspaces/<id>.html，
// 那个文件不存在，直接访问或中键新开都会 404（SPA 内点击被客户端路由接管，看不出来）。
const wsHref = (id: string) => `/workspaces/${id}/`

// 两边取并集：只有清单没组件的空间、以及（手建时）只有组件没清单的空间都要出现
const ids = computed(() => {
  const all = new Set<string>()
  for (const path of Object.keys(metaModules)) all.add(wsOfMeta(path))
  for (const path of Object.keys(componentModules)) all.add(wsOfComponent(path))
  return [...all].filter(Boolean).sort((a, b) => a.localeCompare(b))
})

const workspaces = computed(() =>
  ids.value.map((id) => {
    const meta = Object.entries(metaModules).find(([p]) => wsOfMeta(p) === id)?.[1].default ?? {}
    return {
      id,
      title: meta.title ?? id,
      description: meta.description ?? '',
      count: Object.keys(componentModules).filter((p) => wsOfComponent(p) === id).length,
    }
  }),
)
</script>

<template>
  <p v-if="workspaces.length === 0" class="empty">还没有任何工作空间。</p>
  <div v-else class="grid">
    <VPLink v-for="ws in workspaces" :key="ws.id" :href="wsHref(ws.id)" class="ws-card">
      <span class="ws-title">{{ ws.title }}</span>
      <span v-if="ws.description" class="ws-desc">{{ ws.description }}</span>
      <span class="ws-count">{{ ws.count }} 个组件</span>
    </VPLink>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
  margin-top: 24px;
}
.ws-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 20px;
  border: 1px solid var(--ew-color-border);
  border-radius: var(--ew-radius-md);
  color: var(--ew-color-text);
  text-decoration: none;
  transition: border-color 0.2s;
}
.ws-card:hover {
  border-color: var(--ew-color-primary);
}
.ws-title {
  font-size: var(--ew-font-size-lg);
  font-weight: 600;
}
.ws-desc {
  color: var(--ew-color-text-secondary);
  font-size: var(--ew-font-size-sm);
}
.ws-count {
  color: var(--ew-color-text-secondary);
  font-size: var(--ew-font-size-sm);
}
.empty {
  color: var(--ew-color-text-secondary);
}
</style>
