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
const metaModules = import.meta.glob('@packages/workspaces/*/components/*/meta.ts', {
  eager: true,
}) as Record<string, { default: ComponentMeta }>

// 只用键（哪些组件存在），模块值不用 —— 枚举以源码文件为准的理由见 component-shape。
// eager 保留：改成动态 import 省不下什么（组件本来就会被 wc-mode 的虚拟模块整包取回），
// 却会让 Rollup 为每个组件报一条「既动态又静态导入」的警告。
const sourceModules = import.meta.glob('@packages/workspaces/*/components/*/Component.{vue,tsx}', {
  eager: true,
})

const workspaceModules = import.meta.glob('@packages/workspaces/*/workspace.ts', {
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
