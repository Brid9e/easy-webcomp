import type { ComponentMeta } from '@ew/runtime'

export interface ComponentEntry {
  name: string
  workspace: string
  framework: 'vue' | 'react'
  meta: ComponentMeta | undefined
  source: unknown
}

export interface WorkspaceGroup {
  id: string
  title: string
  items: ComponentEntry[]
}

function segments(path: string): string[] {
  return path.split('/')
}

/**
 * 把 glob 的产物（路径 → 模块）整理成组件条目。
 *
 * 入参是 glob 的结果而不是目录：`import.meta.glob` 只有 Vite 认得，留在 component-index.ts，
 * 这里只做路径解析，于是一个不碰 Vite 的纯函数，能在普通 Vitest 里单测。
 *
 * 段位下标是 `workspaces/<空间>/components/<组件>/` 的固有位置，与 key 前缀写成长什么样无关。
 */
export function buildComponents(
  sources: Record<string, { default: unknown }>,
  metas: Record<string, { default: ComponentMeta }>,
): ComponentEntry[] {
  // 以**源码文件**为准枚举组件，而不是 meta.ts —— 组件是否存在的判据是 Component.vue / Component.tsx
  // （构建期与文档站都是这么判的）。缺 meta.ts 的组件不该从列表里消失，只是一时没有 tag 与属性。
  return Object.entries(sources)
    .map(([path, mod]) => {
      const parts = segments(path)
      const name = parts.at(-2) ?? ''
      const metaPath = Object.keys(metas).find((p) => segments(p).at(-2) === name)
      return {
        name,
        workspace: parts.at(-4) ?? '',
        framework: path.endsWith('.vue') ? 'vue' : 'react',
        meta: metaPath ? metas[metaPath]?.default : undefined,
        source: mod.default,
      } satisfies ComponentEntry
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** 空间 id → 展示名。取 workspace.ts 里的 title，取不到就回落目录名。 */
export function buildWorkspaceTitles(
  modules: Record<string, { default: { title?: string } }>,
): Map<string, string> {
  return new Map(
    Object.entries(modules).map(([path, mod]) => [
      segments(path).at(-2) ?? '',
      mod.default?.title ?? segments(path).at(-2) ?? '',
    ]),
  )
}

/** 按空间分组，组内保持 `entries` 的先后顺序。 */
export function buildGroups(
  entries: ComponentEntry[],
  titles: Map<string, string>,
): WorkspaceGroup[] {
  const groups = new Map<string, WorkspaceGroup>()

  for (const entry of entries) {
    const group = groups.get(entry.workspace) ?? {
      id: entry.workspace,
      title: titles.get(entry.workspace) ?? entry.workspace,
      items: [],
    }
    group.items.push(entry)
    groups.set(entry.workspace, group)
  }

  return [...groups.values()]
}
