import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export interface ComponentInfo {
  name: string
  framework: 'vue' | 'react'
  documented: boolean
}

export function listComponents(
  componentsDir = join(rootDir, 'src/components'),
  docsDir = join(rootDir, 'docs/components'),
): ComponentInfo[] {
  return readdirSync(componentsDir)
    .filter((name) => statSync(join(componentsDir, name)).isDirectory())
    .map((name): ComponentInfo => {
      const dir = join(componentsDir, name)
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
        documented: existsSync(join(docsDir, `${name}.md`)),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}
