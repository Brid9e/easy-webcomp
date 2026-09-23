import pkg from '../../../../package.json'
import { bareSpecifiersOf } from '../../../../scripts/workspace-packages'

/**
 * 组件用到的第三方库及版本。
 *
 * 扫源码，而不是读 `dist/<空间>/package.json`：那份清单是**空间**粒度（一个空间一个包），
 * 且要求先跑一次构建 —— docs:dev 单独启动时 dist 可能根本不存在。而 space 粒度的
 * framework 产物同样给不出「哪个组件引了什么」，产物是按框架合并的。
 *
 * 复用 scripts/workspace-packages.ts 的扫描器，与构建期反推 peerDependencies 的是同一个
 * 函数：多加一份实现迟早会与产物清单漂开。
 */
const sources = import.meta.glob('@src/workspaces/*/components/*/*.{ts,tsx,vue}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

/**
 * 版本来源与 scripts/build.ts 的 `versions` 是同一条合并规则（peerDependencies 压过
 * dependencies），显示的版本因此与产物清单里写的一致。
 */
const versions: Record<string, string> = { ...pkg.dependencies, ...pkg.peerDependencies }

/**
 * 框架自身的说明符在源码里看不到：SFC 编译器为 template 生成的渲染函数会 inject
 * `vue`，JSX 自动运行时 inject `react/jsx-runtime`。不补这一层，.tsx 组件会显示成零依赖。
 *
 * **只补作者直接书写的那一个包。** 产物里还引 `react-dom/client`，但它出自 @ew/runtime
 * 的 reactAdapter 而不是组件 —— 列进来会得到两枚一模一样的 React 标记（两个包没有各自的
 * logo），看着像重复。宿主该装什么由产物清单的 peerDependencies 回答，不是这里的问题。
 */
const frameworkDeps: Record<string, readonly string[]> = {
  vue: ['vue'],
  react: ['react'],
}

const componentDirOf = (path: string) => path.split('/').at(-2) ?? ''

function frameworkOf(name: string): 'vue' | 'react' | undefined {
  for (const path of Object.keys(sources)) {
    if (componentDirOf(path) !== name) continue
    if (path.endsWith('/Component.vue')) return 'vue'
    if (path.endsWith('/Component.tsx')) return 'react'
  }
  return undefined
}

export interface ComponentDep {
  name: string
  /** 根 package.json 里没有的包只给出名字 */
  version?: string
}

const cache = new Map<string, ComponentDep[]>()

export function componentDeps(name: string): ComponentDep[] {
  const cached = cache.get(name)
  if (cached) return cached

  const framework = frameworkOf(name)
  const found = new Set(framework ? frameworkDeps[framework] : [])
  for (const [path, code] of Object.entries(sources)) {
    if (componentDirOf(path) !== name) continue
    for (const specifier of bareSpecifiersOf(code)) found.add(specifier)
  }

  const sorted = [...found]
    // @ew/* 是工具链自己的包，随产物内联，消费者不需要单独安装
    .filter((dep) => !dep.startsWith('@ew/'))
    .sort()

  // 框架包排最前：卡片不再单独画 Vue/React 徽标，第一枚标签就要回答「这是哪个框架写的组件」。
  // 它必然在列表里（framework 有值时 frameworkDeps 已把它塞进 found），index > 0 只是判「已在首位」。
  if (framework) {
    const packageName = frameworkDeps[framework][0]
    const at = sorted.indexOf(packageName)
    if (at > 0) sorted.unshift(...sorted.splice(at, 1))
  }

  const deps = sorted
    .map((dep): ComponentDep => {
      const version = versions[dep]
      return version === undefined ? { name: dep } : { name: dep, version }
    })

  cache.set(name, deps)
  return deps
}
