import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { WorkspaceMeta } from '../../src/workspaces/define'

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

const workspacesDirOf = () => join(rootDir, 'src/workspaces')
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

  return readdirSync(workspacesDir)
    .filter((id) => statSync(join(workspacesDir, id)).isDirectory())
    .map((id): WorkspaceInfo => {
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
    .sort((a, b) => a.id.localeCompare(b.id))
}

/**
 * config.mts 由 Vite 用 esbuild 打包后加载，`import.meta.glob` 在那里不可用，而清单是 TS。
 * 这里靠 Node 22.18+ 的原生类型剥离加载：清单只写类型导入（会被剥掉，不产生运行时相对导入），
 * 因此动态 import 能直接求值。读不到就返回空对象，调用方回落到目录名 —— 一个清单文件写错
 * 不该让整个构建失败。
 */
export async function readWorkspaceMeta(
  id: string,
  workspacesDir = workspacesDirOf(),
): Promise<WorkspaceMeta> {
  try {
    const file = pathToFileURL(join(workspacesDir, id, 'workspace.ts')).href
    const mod = (await import(file)) as { default?: WorkspaceMeta }
    return mod.default ?? {}
  } catch {
    return {}
  }
}
