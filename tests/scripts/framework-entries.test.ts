import { describe, expect, it } from 'vitest'
import {
  barrelSource,
  hostClassOf,
  propsInterface,
  reactWrapperSource,
  vueWrapperSource,
  type FrameworkComponent,
} from '../../scripts/framework-entries'

function component(overrides: Partial<FrameworkComponent> = {}): FrameworkComponent {
  return {
    name: 'hello-vue',
    workspace: 'demo',
    framework: 'vue',
    styleFile: 'style.scss',
    meta: { tag: 'ew-hello-vue', events: ['select'], props: { name: { type: 'string' } } },
    ...overrides,
  }
}

describe('hostClassOf', () => {
  it('宿主类名由组件名派生', () => {
    expect(hostClassOf('my-list')).toBe('ew-my-list-host')
  })
})

describe('vueWrapperSource', () => {
  const source = vueWrapperSource(component())

  it('从组件目录直接引源码，不经过 index.ts（那会把 createElementClass 一并引入）', () => {
    expect(source).toContain("from '../../../packages/workspaces/demo/components/hello-vue/Component.vue'")
    expect(source).not.toContain("index'")
  })

  it('样式按 ?inline 引，并在模块顶层改写好 :host', () => {
    expect(source).toContain("import rawCss from '../../../packages/workspaces/demo/components/hello-vue/style.scss?inline'")
    expect(source).toContain("rewriteHost(rawCss, '.ew-hello-vue-host')")
  })

  it('导出名是 PascalCase', () => {
    expect(source).toContain('export const HelloVue = defineComponent(')
  })

  it('emits 取自 meta.events，这样派发不会触发 Vue 的未声明事件警告', () => {
    expect(source).toContain("emits: ['select']")
  })

  it('渲染一层带宿主类的 div，并把 attrs 透传给内层组件', () => {
    expect(source).toContain("h('div', { class: 'ew-hello-vue-host' }")
    expect(source).toContain('h(Component as never, { ...attrs }, slots)')
  })

  it('inheritAttrs 关掉 —— 否则 attrs 会同时落到宿主 div 与内层组件上', () => {
    expect(source).toContain('inheritAttrs: false')
  })

  it('包装层提供 EW_EMIT_KEY，把 emit 接到原生 v-on 上', () => {
    expect(source).toContain('provide(EW_EMIT_KEY, (name: string, detail?: unknown) => emit(name, detail))')
  })

  // 挂载时注入是设计前提：移到模块顶层，未用到的组件就无法把它 tree-shake 掉
  it('applyGlobalStyles 在 setup 里调用，不在模块顶层', () => {
    expect(source).toMatch(/setup\([\s\S]*applyGlobalStyles\(css\)/)
    expect(source).not.toMatch(/^applyGlobalStyles\(css\)/m)
  })

  it('props 类型从 meta.props 生成', () => {
    expect(source).toContain('export interface HelloVueProps {')
    expect(source).toContain('  name?: string')
  })

  it('object / array 退化成宽松类型', () => {
    const src = vueWrapperSource(
      component({ meta: { tag: 'x', props: { data: { type: 'object' }, list: { type: 'array' } } } }),
    )
    expect(src).toContain('data?: Record<string, unknown>')
    expect(src).toContain('list?: unknown[]')
  })

  it('number / boolean / function 各自直译，不退化成宽松类型', () => {
    const src = vueWrapperSource(
      component({
        meta: {
          tag: 'x',
          props: {
            count: { type: 'number' },
            flag: { type: 'boolean' },
            onPick: { type: 'function' },
          },
        },
      }),
    )
    expect(src).toContain('count?: number')
    expect(src).toContain('flag?: boolean')
    expect(src).toContain('onPick?: (...args: unknown[]) => unknown')
  })

  it('没有 props 时仍生成一个空接口，消费方 import 得到的东西不会是 undefined', () => {
    const src = vueWrapperSource(component({ meta: { tag: 'x' } }))
    expect(src).toContain('export interface HelloVueProps {}')
  })
})

describe('propsInterface', () => {
  // 漏掉事件是真实踩过的坑：包装层运行时认 onSelect，声明里却没有，消费方一律 ts(2322)
  it('事件也进接口，消费方写 onSelect 不再报 prop 不存在', () => {
    const src = propsInterface(component({ meta: { tag: 'ew-x', events: ['select'] } }))
    expect(src).toContain('onSelect?: (detail: unknown) => void')
  })

  it('多单词事件名不做驼峰转换，带连字符的键加引号', () => {
    const src = propsInterface(component({ meta: { tag: 'ew-x', events: ['row-click'] } }))
    expect(src).toContain("'onRow-click'?: (detail: unknown) => void")
  })

  it('props 与事件都没有时仍出空接口', () => {
    expect(propsInterface(component({ meta: { tag: 'ew-x' } }))).toContain(
      'export interface HelloVueProps {}',
    )
  })
})

describe('reactWrapperSource', () => {
  const source = reactWrapperSource(
    component({ name: 'hello-react', framework: 'react', meta: { tag: 'ew-hello-react', events: ['select'] } }),
  )

  it('不写 JSX —— 生成物是 .ts，交给 react() 插件编译会白搭', () => {
    expect(source).not.toContain('<div')
    expect(source).toContain("'div'")
    expect(source).toContain("{ className: 'ew-hello-react-host' }")
  })

  it('事件名映射到 React 的 onXxx 约定', () => {
    expect(source).toContain("'select': 'onSelect'")
  })

  // useLayoutEffect 而不是 useEffect：它在 paint 之前同步跑完，首帧就已经带上样式，
  // 不会先闪一下无样式的按钮。
  it('挂载后注入样式，且在 paint 之前', () => {
    expect(source).toContain('useLayoutEffect(() => applyGlobalStyles(css), [])')
  })

  it('用 EwEmitContext 而不是 EW_EMIT_KEY', () => {
    expect(source).toContain('EwEmitContext.Provider')
  })
})

describe('barrelSource', () => {
  it('只导出该框架的组件', () => {
    const src = barrelSource(
      [
        component({ name: 'a-one', framework: 'vue' }),
        component({ name: 'b-two', framework: 'react' }),
      ],
      'vue',
    )
    expect(src).toContain("export { AOne } from './a-one'")
    expect(src).not.toContain('BTwo')
  })

  it('没有该框架的组件时是一个合法的空模块', () => {
    expect(barrelSource([], 'react').trim()).toBe('export {}')
  })
})
