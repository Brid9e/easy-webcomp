/**
 * 空间包里 `.d.ts` 的生成规则。
 *
 * 手写模板而不是上 vite-plugin-dts：产物里的声明**一个字都不能引 `@ew/runtime`** ——
 * 那个包 private、不发，消费方解析不到它；而从源码图生成的声明必然带着这个说明符
 * （包装层与组件 index.ts 都 import 它）。这里只描述产物自身的形状，需要引用的运行时类型
 * 就地内联：下面那三个接口是 packages/runtime/src/types.ts 里同名接口的副本。
 *
 * 代价是这份形状与 @ew/runtime 是两份，可能漂。兜底放在
 * tests/integration/consumer-types.test.ts：那条用例会真实执行一次 tsc，声明丢失或形状不符
 * 都会失败。比起引入一个构建期依赖，这样代价更低，也更贴合本仓库「产物自己描述自己」的做法。
 */

import { toIdentifier } from '@ew/utils'
import { propsInterface, type FrameworkComponent } from './framework-entries.ts'

/**
 * @ew/runtime 的公开类型在产物里的副本。interface 是结构化的，两份同名接口彼此可赋值，
 * 所以消费方拿 `@ew/runtime` 那边的值传进来不会报错 —— 但它们**不 export**：
 * 导出会使 `export * as MyList` 的命名空间多出 `ComponentMeta` 这类运行时并不存在的名字。
 */
const RUNTIME_TYPES = `type PropType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'function'

interface PropDefinition {
  type: PropType
  attr?: string
  default?: unknown
}

interface ComponentMeta {
  tag: string
  shadow?: boolean
  props?: Record<string, PropDefinition>
  events?: string[]
}

interface EwElementConstructor extends CustomElementConstructor {
  refresh: () => void
}
`

/** ESM 侧一个组件模块的对外形状 —— 与组件 index.ts 的三个导出一一对应 */
export function wcDeclarationSource(name: string): string {
  return `${RUNTIME_TYPES}
export declare const meta: ComponentMeta
export declare const ${toIdentifier(name)}Element: EwElementConstructor
export declare function register(): void
`
}

/**
 * ESM 桶。与 build 生成的 `export * as <Id>` 一一对应 —— 桶里每个名字是个命名空间，
 * 不是组件本身，所以这里也写 `export * as` 而不是 `export`。
 */
export function barrelDeclarationSource(names: readonly string[]): string {
  const lines = names.map((name) => `export * as ${toIdentifier(name)} from './${name}.js'`)
  return `${lines.join('\n')}\n`
}

/**
 * 框架桶。props 类型与包装层用同一份 `propsInterface`，两处不可能漂。
 *
 * Vue 侧写成 `DefineComponent<Props>` 而不是包装层实际推出来的空 props：包装层是把 attrs
 * 原样透传给内层组件的，meta 里的 props 才是它对外承诺的契约，声明按契约写、消费方才有补全。
 */
export function frameworkDeclarationSource(
  components: readonly FrameworkComponent[],
  framework: 'vue' | 'react',
): string {
  const blocks = components.map((c) => {
    const id = toIdentifier(c.name)
    const declaration =
      framework === 'vue'
        ? `export declare const ${id}: DefineComponent<${id}Props>`
        : `export declare function ${id}(props: ${id}Props): ReactElement`
    return `${propsInterface(c)}${declaration}\n`
  })
  const runtimeType = framework === 'vue' ? 'DefineComponent' : 'ReactElement'
  return `import type { ${runtimeType} } from '${framework}'\n\n${blocks.join('\n')}`
}

/**
 * 配置入口的声明。与 wcDeclarationSource 同理，**不许出现 `@ew/runtime`** ——
 * `EwConfig` 的形状照上面 RUNTIME_TYPES 的做法就地写一份。
 *
 * 只声明 configure / getConfig：生成的入口就导这两个，`resetConfig` 是测试专用的，
 * 不在产物的 API 面上。
 */
export function configDeclarationSource(): string {
  return `export interface EwConfig {
  baseURL?: string
  timeout?: number
  headers?: Record<string, string>
}

export declare function configure(patch: EwConfig): EwConfig
export declare function getConfig(): EwConfig
`
}
