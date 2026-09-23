import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { WorkspaceMeta } from '@ew/utils'
import { workspaceIdsOf } from '../../scripts/workspaces'

export const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export interface ComponentInfo {
  name: string
  framework: 'vue' | 'react'
  documented: boolean
}

export interface WorkspaceInfo {
  id: string
  components: ComponentInfo[]
}

const workspacesDirOf = () => join(rootDir, 'packages/workspaces')
const docsDirOf = () => join(rootDir, 'docs/workspaces')

function readComponent(dir: string, name: string, wsDocsDir: string): ComponentInfo {
  const hasVue = existsSync(join(dir, 'Component.vue'))
  const hasReact = existsSync(join(dir, 'Component.tsx'))
  if (hasVue === hasReact) {
    throw new Error(
      `[docs] ${name} 必须且只能有一个 Component.vue 或 Component.tsx（当前 vue=${hasVue} react=${hasReact}）`,
    )
  }
  return {
    name,
    framework: hasVue ? 'vue' : 'react',
    documented: existsSync(join(wsDocsDir, `${name}.md`)),
  }
}

/**
 * 纯 fs 扫描：只返回能从目录结构推断出的东西。清单里的 title / description 是 TS 模块里的值，
 * 这里读不到 —— 需要它们的地方走 readWorkspaceMeta()。
 */
export function listWorkspaces(
  workspacesDir = workspacesDirOf(),
  docsDir = docsDirOf(),
): WorkspaceInfo[] {
  const seen = new Map<string, string>()

  return workspaceIdsOf(workspacesDir).map((id): WorkspaceInfo => {
    const componentsDir = join(workspacesDir, id, 'components')
    if (!existsSync(componentsDir)) return { id, components: [] }

    const wsDocsDir = join(docsDir, id)
    const components = readdirSync(componentsDir)
      .filter((name) => statSync(join(componentsDir, name)).isDirectory())
      .map((name): ComponentInfo => {
        const owner = seen.get(name)
        if (owner) {
          throw new Error(
            `[docs] 组件名 "${name}" 在 "${owner}" 与 "${id}" 下重复。` +
              'tag 与 package exports 都不带空间前缀，组件名必须全局唯一',
          )
        }
        seen.set(name, id)
        return readComponent(join(componentsDir, name), name, wsDocsDir)
      })
      .sort((a, b) => a.name.localeCompare(b.name))

    return { id, components }
  })
}

/**
 * config.mts 由 Vite 用 esbuild 打包后加载，`import.meta.glob` 在那里不可用，而清单是 TS。
 * tsx 已是既有 devDependency（scripts/build.ts 就跑在它上面）；Vite 打包 config 时会把裸包
 * import 标记为 external，所以这个动态 import 会留给 Node 真正加载。
 * 读不到就返回空对象，调用方回落到目录名 —— 一个清单文件写错不该让整个构建失败。
 */
export async function readWorkspaceMeta(
  id: string,
  workspacesDir = workspacesDirOf(),
): Promise<WorkspaceMeta> {
  try {
    const { tsImport } = await import('tsx/esm/api')
    const file = pathToFileURL(join(workspacesDir, id, 'workspace.ts')).href
    const mod = (await tsImport(file, import.meta.url)) as { default?: WorkspaceMeta }
    return mod.default ?? {}
  } catch (error) {
    // 清单「写坏」与「没写」要分开：前者会让整个侧边栏静默退化成目录名，值得报出来
    // （spec 的验收靠肉眼比对标题，那是兜底不是第一道防线）；后者只是回落，不必刷屏。
    if (existsSync(join(workspacesDir, id, 'workspace.ts'))) {
      console.warn(`[docs] 读取 ${id}/workspace.ts 失败，展示名回落到目录名：`, error)
    }
    return {}
  }
}
