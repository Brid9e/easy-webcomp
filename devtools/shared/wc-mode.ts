import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import { toIdentifier } from '@ew/utils'
import { workspaceIdsOf } from '../../scripts/workspaces.ts'

const COMPONENTS_PREFIX = 'virtual:ew-wc/'
const INDEX_ID = 'virtual:ew-wc-index'
const RESOLVED_PREFIX = '\0ew-wc/'
const RESOLVED_INDEX = '\0ew-wc-index'

interface Located {
  name: string
  dir: string
  framework: 'vue' | 'react'
}

/**
 * 虚拟模块 id 仍用 `virtual:ew-wc/<name>`，不带空间前缀 —— 组件名在构建期已强制全局唯一
 * （见 scripts/build.ts），加前缀只会让「组件换空间」产生无谓的 import 变动。
 */
function locateComponents(workspacesDir: string): Located[] {
  const found: Located[] = []

  for (const workspace of workspaceIdsOf(workspacesDir)) {
    const componentsDir = join(workspacesDir, workspace, 'components')
    if (!existsSync(componentsDir)) continue

    for (const name of readdirSync(componentsDir)) {
      const dir = join(componentsDir, name)
      if (!statSync(dir).isDirectory()) continue
      found.push({
        name,
        dir,
        framework: existsSync(join(dir, 'Component.vue')) ? 'vue' : 'react',
      })
    }
  }

  return found.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * 生成的代码一律用绝对路径引用源码。使用者（文档站、调试页）各自的 Vite root
 * 都不是仓库根，写 `/src/...` 会被解析成 `<root>/src/...`，找不到文件。
 */
export function wcModePlugin(workspacesDir: string): Plugin {
  return {
    name: 'ew-wc-mode',

    resolveId(id) {
      if (id === INDEX_ID) return RESOLVED_INDEX
      if (id.startsWith(COMPONENTS_PREFIX)) {
        return RESOLVED_PREFIX + id.slice(COMPONENTS_PREFIX.length)
      }
      return null
    },

    load(id) {
      if (id === RESOLVED_INDEX) {
        const components = locateComponents(workspacesDir)
        const imports = components
          .map((c, i) => `import * as m${i} from '${COMPONENTS_PREFIX}${c.name}'`)
          .join('\n')
        const entries = components.map((c, i) => `  '${c.name}': m${i}`).join(',\n')
        return `${imports}\n\nexport default {\n${entries}\n}\n`
      }

      if (id.startsWith(RESOLVED_PREFIX)) {
        const name = id.slice(RESOLVED_PREFIX.length)
        const located = locateComponents(workspacesDir).find((c) => c.name === name)
        if (!located) return null

        const dir = located.dir
        const isVue = located.framework === 'vue'
        const componentPath = join(dir, isVue ? 'Component.vue' : 'Component.tsx')
        const indexPath = join(dir, 'index.ts')
        const elementExport = `${toIdentifier(name)}Element`

        // 直接复用组件自己的 index.ts，**不要**在这里再 createElementClass 一遍。
        // 预览必须等于消费者拿到的东西：选 Element Plus / antd 的组件要在 light DOM 里内联库样式，
        // 选 Pinia 的组件要按实例装插件 —— 这些都在 index.ts 里。早先这里手搓元素只传了
        // meta + style.css，于是 UI 库组件在文档站里永远是裸的，而构建产物是好的。
        return `
import { meta, ${elementExport} as Element } from ${JSON.stringify(indexPath)}
import * as ComponentModule from ${JSON.stringify(componentPath)}

export { meta, Element }

if (import.meta.hot) {
  import.meta.hot.accept(${JSON.stringify(componentPath)}, () => {
    // 保留 ComponentModule 的引用，让上面那条 import 真正成为本模块的依赖边 ——
    // hot.accept(path, cb) 只对已 import 的路径生效。之后强制已挂载实例重渲染。
    void ComponentModule
    Element.refresh()
  })
}
`
      }

      return null
    },
  }
}
