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

// glob 生成的 key 形状（别名前缀 / 绝对路径 / 相对路径）是实现细节，只取倒数第几段目录名 ——
// `workspaces/<空间>/…` 这一段的相对位置不变，两种 key 形状下标一致。
const metaModules = import.meta.glob('@src/workspaces/*/components/*/meta.ts', {
  eager: true,
}) as Record<string, { default: ComponentMeta }>

const sourceModules = import.meta.glob('@src/workspaces/*/components/*/Component.{vue,tsx}', {
  eager: true,
}) as Record<string, { default: unknown }>

const workspaceModules = import.meta.glob('@src/workspaces/*/workspace.ts', {
  eager: true,
}) as Record<string, { default: { title?: string } }>

function segments(path: string): string[] {
  return path.split('/')
}

// 以**源码文件**为准枚举组件，而不是 meta.ts —— 组件是否存在的判据是 Component.vue / Component.tsx
// （构建期与文档站都是这么判的）。缺 meta.ts 的组件不该从列表里消失，只是一时没有 tag 与属性。
export const components: ComponentEntry[] = Object.entries(sourceModules)
  .map(([path, mod]) => {
    const parts = segments(path)
    const name = parts.at(-2) ?? ''
    const metaPath = Object.keys(metaModules).find((p) => segments(p).at(-2) === name)
    return {
      name,
      workspace: parts.at(-4) ?? '',
      framework: path.endsWith('.vue') ? 'vue' : 'react',
      meta: metaPath ? metaModules[metaPath]?.default : undefined,
      source: mod.default,
    } satisfies ComponentEntry
  })
  .sort((a, b) => a.name.localeCompare(b.name))

export function componentByName(name: string): ComponentEntry | undefined {
  return components.find((c) => c.name === name)
}

const workspaceTitles = new Map(
  Object.entries(workspaceModules).map(([path, mod]) => [
    segments(path).at(-2) ?? '',
    mod.default?.title ?? segments(path).at(-2) ?? '',
  ]),
)

export function groupByWorkspace(): WorkspaceGroup[] {
  const groups = new Map<string, WorkspaceGroup>()

  for (const entry of components) {
    const group = groups.get(entry.workspace) ?? {
      id: entry.workspace,
      title: workspaceTitles.get(entry.workspace) ?? entry.workspace,
      items: [],
    }
    group.items.push(entry)
    groups.set(entry.workspace, group)
  }

  return [...groups.values()]
}
