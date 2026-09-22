import { createContext, createElement, useContext, type Context } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ElementAdapter, EmitFn } from './types.ts'

export const EwEmitContext: Context<EmitFn> = createContext<EmitFn>(() => {})

interface ReactInstance {
  root: Root
  render: (props: Record<string, unknown>) => void
}

export function reactAdapter(getComponent: () => unknown): ElementAdapter {
  return {
    mount(host, props, emit) {
      const root = createRoot(host as unknown as Element | DocumentFragment)
      const render = (next: Record<string, unknown>): void => {
        root.render(
          createElement(
            EwEmitContext.Provider,
            { value: emit },
            createElement(getComponent() as never, next),
          ),
        )
      }
      render(props)
      const instance: ReactInstance = { root, render }
      return instance
    },
    update(instance, props) {
      ;(instance as ReactInstance).render({ ...props })
    },
    unmount(instance) {
      ;(instance as ReactInstance).root.unmount()
    },
  }
}

export function useReactEmit(): EmitFn {
  return useContext(EwEmitContext)
}
