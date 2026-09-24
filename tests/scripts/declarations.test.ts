import { describe, expect, it } from 'vitest'
import {
  barrelDeclarationSource,
  configDeclarationSource,
  frameworkDeclarationSource,
  wcDeclarationSource,
} from '../../scripts/declarations'
import type { FrameworkComponent } from '../../scripts/framework-entries'

function component(over: Partial<FrameworkComponent> = {}): FrameworkComponent {
  return {
    name: 'hello-vue',
    workspace: 'demo',
    framework: 'vue',
    styleFile: 'style.scss',
    meta: { tag: 'ew-hello-vue', props: { name: { type: 'string' } }, events: ['select'] },
    ...over,
  }
}

describe('wcDeclarationSource', () => {
  it('描述 index.ts 的三个导出，组件名按 toIdentifier 展开', () => {
    const dts = wcDeclarationSource('hello-vue')
    expect(dts).toContain('export declare const meta: ComponentMeta')
    expect(dts).toContain('export declare const HelloVueElement: EwElementConstructor')
    expect(dts).toContain('export declare function register(): void')
  })

  it('不引 @ew/runtime —— 那个包 private、不发，消费方解析不到', () => {
    expect(wcDeclarationSource('hello-vue')).not.toContain('@ew/runtime')
  })

  it('运行时类型不 export —— 否则桶的命名空间会多出运行时并不存在的名字', () => {
    const dts = wcDeclarationSource('hello-vue')
    expect(dts).toContain("type PropType = 'string'")
    for (const name of ['PropDefinition', 'ComponentMeta', 'EwElementConstructor']) {
      expect(dts).toContain(`interface ${name}`)
    }
    for (const name of ['PropType', 'PropDefinition', 'ComponentMeta', 'EwElementConstructor']) {
      expect(dts).not.toMatch(new RegExp(`export (?:interface|type) ${name}\\b`))
    }
  })
})

describe('barrelDeclarationSource', () => {
  it('每个组件一个命名空间，与 build 生成的 export * as 一致', () => {
    expect(barrelDeclarationSource(['hello-react', 'hello-vue'])).toBe(
      "export * as HelloReact from './hello-react.js'\n" +
        "export * as HelloVue from './hello-vue.js'\n",
    )
  })
})

describe('frameworkDeclarationSource', () => {
  it('Vue：props 接口 + DefineComponent', () => {
    const dts = frameworkDeclarationSource([component()], 'vue')
    expect(dts).toContain("import type { DefineComponent } from 'vue'")
    expect(dts).toContain(
      'export interface HelloVueProps {\n  name?: string\n  onSelect?: (detail: unknown) => void\n}',
    )
    expect(dts).toContain('export declare const HelloVue: DefineComponent<HelloVueProps>')
  })

  it('React：props 接口 + 返回 ReactElement 的函数', () => {
    const dts = frameworkDeclarationSource(
      [component({ name: 'hello-react', framework: 'react' })],
      'react',
    )
    expect(dts).toContain("import type { ReactElement } from 'react'")
    expect(dts).toContain(
      'export interface HelloReactProps {\n  name?: string\n  onSelect?: (detail: unknown) => void\n}',
    )
    expect(dts).toContain('export declare function HelloReact(props: HelloReactProps): ReactElement')
  })

  it('没有 props 的组件出空接口，不拼出 {} 换行块', () => {
    const dts = frameworkDeclarationSource([component({ meta: { tag: 'ew-x' } })], 'vue')
    expect(dts).toContain('export interface HelloVueProps {}')
  })
})

describe('configDeclarationSource', () => {
  it('就地内联 EwConfig，两个函数的签名与运行时一致', () => {
    const dts = configDeclarationSource()
    expect(dts).toContain('export interface EwConfig {')
    expect(dts).toContain('baseURL?: string')
    expect(dts).toContain('timeout?: number')
    expect(dts).toContain('headers?: Record<string, string>')
    expect(dts).toContain('export declare function configure(patch: EwConfig): EwConfig')
    expect(dts).toContain('export declare function getConfig(): EwConfig')
  })

  it('不引 @ew/runtime —— 那个包 private、不发，消费方解析不到', () => {
    expect(configDeclarationSource()).not.toContain('@ew/runtime')
  })
})
