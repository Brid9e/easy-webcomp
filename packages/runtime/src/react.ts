import { createContext, createElement, useContext, type Context } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ElementAdapter, EmitFn } from './types.ts'

export const EwEmitContext: Context<EmitFn> = createContext<EmitFn>(() => {})

/** 元素是否激活。带 keep-alive 的元素被移出文档时转 false，组件据此停掉后台动作。 */
export const EwActiveContext: Context<boolean> = createContext<boolean>(true)

interface ReactInstance {
  root: Root
  update: (props: Record<string, unknown>) => void
  setActive: (active: boolean) => void
}

export function reactAdapter(getComponent: () => unknown): ElementAdapter {
  return {
    mount(host, props, emit) {
      const root = createRoot(host as unknown as Element | DocumentFragment)
      // 改 props 与改激活状态都只是重渲染，两份状态都留在闭包里
      let current: Record<string, unknown> = { ...props }
      let active = true

      const paint = (): void => {
        root.render(
          createElement(
            EwEmitContext.Provider,
            { value: emit },
            createElement(
              EwActiveContext.Provider,
              { value: active },
              createElement(getComponent() as never, current),
            ),
          ),
        )
      }
      paint()

      const instance: ReactInstance = {
        root,
        update(next) {
          current = { ...next }
          paint()
        },
        setActive(next) {
          active = next
          paint()
        },
      }
      return instance
    },
    update(instance, props) {
      ;(instance as ReactInstance).update(props)
    },
    setActive(instance, active) {
      ;(instance as ReactInstance).setActive(active)
    },
    unmount(instance) {
      ;(instance as ReactInstance).root.unmount()
    },
  }
}

export function useReactEmit(): EmitFn {
  return useContext(EwEmitContext)
}

/**
 * 元素是否处于激活状态。
 *
 * 带 keep-alive 的元素被移出文档时转为 false —— 组件据此停掉轮询、取消请求。不带该属性
 * 的元素断开即卸载，组件根本不会被渲染到「失活」那一刻，用不上这个。
 */
export function useReactActive(): boolean {
  return useContext(EwActiveContext)
}
