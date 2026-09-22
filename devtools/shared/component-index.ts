import type { ComponentMeta } from '@ew/runtime'
import {
  buildComponents,
  buildGroups,
  buildWorkspaceTitles,
  type ComponentEntry,
  type WorkspaceGroup,
} from './component-shape'

export type { ComponentEntry, WorkspaceGroup }

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

// 本文件是「发现」那一半：哪些文件存在。整理成条目与分组是 component-shape.ts 的纯函数，
// 那半边能单测，这半边不能 —— 它一旦 eager 载入真实组件，就需要完整的 Vue/React 转换管线。
export const components: ComponentEntry[] = buildComponents(sourceModules, metaModules)

const workspaceTitles = buildWorkspaceTitles(workspaceModules)

export function componentByName(name: string): ComponentEntry | undefined {
  return components.find((c) => c.name === name)
}

export function groupByWorkspace(): WorkspaceGroup[] {
  return buildGroups(components, workspaceTitles)
}
