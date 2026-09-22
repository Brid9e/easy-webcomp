/**
 * 包对外的全部 API 面。手写具名 re-export 而不是 `export *`：这个文件就是公开契约，
 * 写出来比通配可控；将来在模块里新增导出也不会意外变成公开 API。
 *
 * 相对 import 一律带 `.ts` 后缀：本包可能被 Node 原生 ESM 解析（Vite 加载配置文件时
 * 会外置裸 import），而 Node 对相对说明符要求显式扩展名。tsconfig 里
 * allowImportingTsExtensions 已开。
 *
 * 测试专用的 resetRegistry / resetStyleCache / applyStyles 一并导出 —— 它们是纯函数，
 * 不用时会被摇掉，为它们单开一个子路径不划算。
 */
export { createElementClass } from './element.ts'
export { registerElement, resetRegistry } from './registry.ts'
export { applyStyles, resetStyleCache } from './style.ts'
export { attrNameFor, coerceAttr, isAttributeChannel } from './props.ts'
export { defineComponentMeta } from './types.ts'
export type {
  ComponentMeta,
  ElementAdapter,
  EmitFn,
  EwElementConstructor,
  PropDefinition,
  PropType,
} from './types.ts'

export { vueAdapter, useVueEmit, EW_EMIT_KEY } from './vue.ts'
export type { VueAdapterOptions } from './vue.ts'

export { reactAdapter, useReactEmit, EwEmitContext } from './react.ts'
