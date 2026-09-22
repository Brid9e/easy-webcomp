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
 * props 类型从 meta.props 生成，精度不如组件自己的声明（object 退化成 Record），
 * 但足够让消费方拿到补全。要做到精确得去解 Vue 的 defineProps<{...}>，那是另一期的事。
 *
 * `body.join('\n')` 在空数组时得到空串，会拼出 `{\n\n}` —— 合法但难看；没有 props 时直接
 * 出 `{}`。这条分支真的会走到：hello-react 那种干净组件之外，新建的组件也可能没有 props。
 */
function propsInterface(c: FrameworkComponent): string {
  const body = Object.entries(c.meta.props ?? {}).map(
    ([name, def]) => `  ${name}?: ${tsTypeOf(def.type)}`,
  )
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
    .map((event) => `  '${event}': 'on${event.charAt(0).toUpperCase()}${event.slice(1)}',`)
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
  // useLayoutEffect 而非 useEffect —— 在 paint 之前同步跑完，首帧就带样式。
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
