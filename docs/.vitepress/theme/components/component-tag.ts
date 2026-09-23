/**
 * 组件的注册标签（`my-list` → `ew-my-list`）。
 *
 * 走 glob 读 meta.ts，而不是 virtual 模块：virtual 模块会在顶层 import 运行时，而运行时顶层就
 * `extends HTMLElement`，SSR 期在 Node 里直接炸。glob 只读 meta.ts，是纯数据。
 */
interface MetaShape {
  tag: string
}

const metaModules = import.meta.glob('@src/workspaces/*/components/*/meta.ts', {
  eager: true,
}) as Record<string, { default: MetaShape }>

const dirNameOf = (path: string) => path.split('/').at(-2) ?? ''

export function componentTag(name: string): string | undefined {
  return Object.entries(metaModules).find(([path]) => dirNameOf(path) === name)?.[1].default.tag
}
