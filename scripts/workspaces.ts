import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 空间 = `packages/workspaces/` 下带 workspace.ts 的目录。
 *
 * 判据不是「有 components/ 目录」：那一层里还有 runtime 与 utils 之外的各种包，
 * 而任何包都可能长出一个叫 components 的目录，被误认成空间。workspace.ts 是空间独有的
 * 清单 —— 写它才算注册了一个空间。
 *
 * 构建、产物校验、截图、文档站侧边栏、调试页、脚手架六处都按这一条枚举空间。
 * 判据各写各的，迟早会漂成「构建认它是空间、文档站不认」。
 */
export function isWorkspace(workspacesDir: string, id: string): boolean {
  return existsSync(join(workspacesDir, id, 'workspace.ts'))
}

/** `packages/workspaces/` 下所有空间的目录名，按名字排序 */
export function workspaceIdsOf(workspacesDir: string): string[] {
  if (!existsSync(workspacesDir)) return []
  return readdirSync(workspacesDir)
    .filter((id) => statSync(join(workspacesDir, id)).isDirectory())
    .filter((id) => isWorkspace(workspacesDir, id))
    .sort()
}
