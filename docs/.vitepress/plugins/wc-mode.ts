import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Plugin } from 'vite'

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

  for (const workspace of readdirSync(workspacesDir)) {
    const wsDir = join(workspacesDir, workspace)
    if (!statSync(wsDir).isDirectory()) continue

    const componentsDir = join(wsDir, 'components')
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
 * 生成的代码一律用绝对路径引用源码。Vite root 是 `docs/`，写 `/src/...`
 * 会被解析成 `docs/src/...`，找不到文件。
 */
export function wcModePlugin(workspacesDir: string): Plugin {
  const srcDir = resolve(workspacesDir, '..')

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
        const adapterCall = isVue ? 'vueAdapter' : 'reactAdapter'

        const refs = {
          element: join(srcDir, 'runtime', 'element.ts'),
          adapter: join(srcDir, 'runtime', isVue ? 'vue.ts' : 'react.ts'),
          meta: join(dir, 'meta.ts'),
          css: `${join(dir, 'style.css')}?inline`,
          component: componentPath,
        }

        return `
import { createElementClass } from ${JSON.stringify(refs.element)}
import { ${adapterCall} } from ${JSON.stringify(refs.adapter)}
import meta from ${JSON.stringify(refs.meta)}
import css from ${JSON.stringify(refs.css)}
import * as ComponentModule from ${JSON.stringify(refs.component)}

const componentRef = { current: ComponentModule.default }
export { meta }
export const Element = createElementClass(meta, ${adapterCall}(() => componentRef.current), css)

if (import.meta.hot) {
  import.meta.hot.accept(${JSON.stringify(refs.component)}, (updated) => {
    if (!updated) return
    componentRef.current = updated[0].default
    Element.refresh()
  })
}
`
      }

      return null
    },
  }
}
