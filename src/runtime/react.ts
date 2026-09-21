import { createContext, createElement, useContext, type Context } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ElementAdapter } from './types'

export type EmitFn = (name: string, detail?: unknown) => void

export const CtcEmitContext: Context<EmitFn> = createContext<EmitFn>(() => {})

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
            CtcEmitContext.Provider,
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

export function useEmit(): EmitFn {
  return useContext(CtcEmitContext)
}
