import { toIdentifier } from '@ew/utils'
import type { ComponentMeta, PropType } from '@ew/runtime'

export interface FrameworkComponent {
  name: string
  workspace: string
  framework: 'vue' | 'react'
  /** 样式文件名，由构建期从组件目录里探测 */
  styleFile: string
  meta: ComponentMeta
}

/**
 * 包装组件渲染的那层 div 的类名，也是 `:host` 的改写目标。
 *
 * 为什么是额外一层 div 而不是把类挂到组件自己的根元素上：my-list 的根 `<section>` 已经
 * 带 `class="ew-my-list"`，样式里同时有 `:host { display: block }` 和
 * `.ew-my-list { display: flex }`，两条落到同一个元素上，display 谁赢全看顺序。
 * 这层 div 的角色与 WC 模式里的自定义元素宿主完全等价，height: 100% 的传递链一模一样。
 */
export function hostClassOf(name: string): string {
  return `ew-${name}-host`
}

/** 组件源码目录，相对于 src/.generated/framework/ */
function sourcePath(c: FrameworkComponent): string {
  return `../../workspaces/${c.workspace}/components/${c.name}`
}

function tsTypeOf(type: PropType): string {
  switch (type) {
    case 'string':
      return 'string'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'object':
      return 'Record<string, unknown>'
    case 'array':
      return 'unknown[]'
    case 'function':
      return '(...args: unknown[]) => unknown'
  }
}

/**
 * 事件名 → 消费方写的 prop 名：`select` → `onSelect`。
 *
 * 只把首字母大写，**不做连字符转驼峰**：`row-click` 得到 `onRow-click`（带连字符的 prop，
 * JSX 里写得出来，但接口里要加引号）。事件名取单单词就没这回事。
 *
 * 接口与包装层的映射表共用这一个函数 —— 两处对「哪个 prop 触发哪个事件」必须完全一致，
 * 分头拼迟早会漂成「类型说有、运行时收不到」。
 */
export function eventPropOf(event: string): string {
  return `on${event.charAt(0).toUpperCase()}${event.slice(1)}`
}

/**
 * props 类型从 meta.props 生成，精度不如组件自己的声明（object 退化成 Record），
 * 但足够让消费方拿到补全。要做到精确得去解 Vue 的 defineProps<{...}>，那是另一期的事。
 *
 * 事件也写进接口，形如 `onSelect?: (detail: unknown) => void`。漏掉它们，消费方写
 * `<HelloReact onSelect={...} />` 会直接报「props 上不存在 onSelect」—— 包装层运行时明明认。
 * detail 是 unknown 而不是更具体的形状：meta 里只记事件名，载荷类型无从推断，与其编一个
 * 不如逼消费方窄化一次。
 *
 * `body.join('\n')` 在空数组时得到空串，会拼出 `{\n\n}` —— 合法但难看；两者都没有时直接
 * 出 `{}`。这条分支真的会走到：hello-react 那种干净组件之外，新建的组件也可能两样都没有。
 */
export function propsInterface(c: FrameworkComponent): string {
  const props = Object.entries(c.meta.props ?? {}).map(
    ([name, def]) => `  ${name}?: ${tsTypeOf(def.type)}`,
  )
  const events = (c.meta.events ?? []).map((event) => {
    const prop = eventPropOf(event)
    // `onRow-click` 这种带连字符的键在接口里必须加引号，否则是语法错误
    return `  ${prop.includes('-') ? `'${prop}'` : prop}?: (detail: unknown) => void`
  })

  const body = [...props, ...events]
  const block = body.length === 0 ? '{}' : `{\n${body.join('\n')}\n}`
  return `export interface ${toIdentifier(c.name)}Props ${block}\n\n`
}

export function vueWrapperSource(c: FrameworkComponent): string {
  const id = toIdentifier(c.name)
  const host = hostClassOf(c.name)
  const events = (c.meta.events ?? []).map((event) => `'${event}'`).join(', ')

  return `import { defineComponent, h, provide } from 'vue'
import { EW_EMIT_KEY, applyGlobalStyles, rewriteHost } from '@ew/runtime'
import Component from '${sourcePath(c)}/Component.vue'
import rawCss from '${sourcePath(c)}/${c.styleFile}?inline'
${propsInterface(c)}const css = rewriteHost(rawCss, '.${host}')

export const ${id} = defineComponent({
  name: '${id}',
  // attrs 要落到内层组件上（那里才是视觉根），不关掉的话它会被同时贴到宿主 div 上
  inheritAttrs: false,
  emits: [${events}],
  setup(_props, { attrs, emit, slots }) {
    // 挂载时注入而不是模块顶层：未用到的组件会被 tree-shake 掉，样式不跟着进包。
    // 顶层注入要让 package.json 写 sideEffects: false 才摇得掉，那个字段写错会整包丢样式。
    applyGlobalStyles(css)
    provide(EW_EMIT_KEY, (name: string, detail?: unknown) => emit(name, detail))
    return () => h('div', { class: '${host}' }, [h(Component as never, { ...attrs }, slots)])
  },
})
`
}

export function reactWrapperSource(c: FrameworkComponent): string {
  const id = toIdentifier(c.name)
  const host = hostClassOf(c.name)
  const mapping = (c.meta.events ?? [])
    .map((event) => `  '${event}': '${eventPropOf(event)}',`)
    .join('\n')

  return `import { createElement, useLayoutEffect } from 'react'
import { EwEmitContext, applyGlobalStyles, rewriteHost } from '@ew/runtime'
import Component from '${sourcePath(c)}/Component'
import rawCss from '${sourcePath(c)}/${c.styleFile}?inline'
${propsInterface(c)}const css = rewriteHost(rawCss, '.${host}')

const EVENT_PROPS: Record<string, string> = {
${mapping}
}

export function ${id}(props: ${id}Props): ReturnType<typeof createElement> {
  // 挂载时注入而不是模块顶层：未用到的组件会被 tree-shake 掉，样式不跟着进包。
  // useLayoutEffect 而非 useEffect：在 paint 之前同步执行完毕，首帧即带样式。
  useLayoutEffect(() => applyGlobalStyles(css), [])

  const emit = (name: string, detail?: unknown): void => {
    const key = EVENT_PROPS[name]
    const handler = key === undefined ? undefined : (props as Record<string, unknown>)[key]
    if (typeof handler === 'function') (handler as (detail: unknown) => void)(detail)
  }

  return createElement(
    'div',
    { className: '${host}' },
    // React 没有 attrs 透传，props 原样交给内层组件 —— 它的函数签名就是契约
    createElement(EwEmitContext.Provider, { value: emit }, createElement(Component, props as never)),
  )
}
`
}

/**
 * 桶文件。`src/.generated/framework/` 下每个组件一个文件、两个框架各一个桶。
 * 桶名固定为 index-vue / index-react，与组件名理论上有撞的可能，但组件名要叫
 * "index-vue" 才会发生 —— 与现有 all.ts 是同一量级的风险，不值得为它加前缀。
 */
export function barrelSource(components: FrameworkComponent[], framework: 'vue' | 'react'): string {
  const lines = components
    .filter((c) => c.framework === framework)
    .map((c) => `export { ${toIdentifier(c.name)} } from './${c.name}'`)
  return lines.length > 0 ? `${lines.join('\n')}\n` : 'export {}\n'
}
