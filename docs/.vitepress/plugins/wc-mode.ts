import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Plugin } from 'vite'

const COMPONENTS_PREFIX = 'virtual:ctc-wc/'
const INDEX_ID = 'virtual:ctc-wc-index'
const RESOLVED_PREFIX = '\0ctc-wc/'
const RESOLVED_INDEX = '\0ctc-wc-index'

interface ComponentInfo {
  name: string
  framework: 'vue' | 'react'
}

function listComponents(componentsDir: string): ComponentInfo[] {
  return readdirSync(componentsDir)
    .filter((name) => statSync(join(componentsDir, name)).isDirectory())
    .map((name) => ({
      name,
      framework: existsSync(join(componentsDir, name, 'Component.vue'))
        ? ('vue' as const)
        : ('react' as const),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * 生成的代码一律用绝对路径引用源码。Vite root 是 `docs/`，写 `/src/...`
 * 会被解析成 `docs/src/...`，找不到文件。
 */
export function wcModePlugin(componentsDir: string): Plugin {
  const srcDir = resolve(componentsDir, '..')

  return {
    name: 'ctc-wc-mode',

    resolveId(id) {
      if (id === INDEX_ID) return RESOLVED_INDEX
      if (id.startsWith(COMPONENTS_PREFIX)) {
        return RESOLVED_PREFIX + id.slice(COMPONENTS_PREFIX.length)
      }
      return null
    },

    load(id) {
      if (id === RESOLVED_INDEX) {
        const components = listComponents(componentsDir)
        const imports = components
          .map((c, i) => `import * as m${i} from '${COMPONENTS_PREFIX}${c.name}'`)
          .join('\n')
        const entries = components.map((c, i) => `  '${c.name}': m${i}`).join(',\n')
        return `${imports}\n\nexport default {\n${entries}\n}\n`
      }

      if (id.startsWith(RESOLVED_PREFIX)) {
        const name = id.slice(RESOLVED_PREFIX.length)
        const dir = join(componentsDir, name)
        if (!existsSync(dir)) return null

        const isVue = existsSync(join(dir, 'Component.vue'))
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
