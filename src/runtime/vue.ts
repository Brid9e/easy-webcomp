import { createApp, h, inject, shallowRef, type App, type ShallowRef } from 'vue'
import type { ElementAdapter } from './types'

export const EW_EMIT_KEY: unique symbol = Symbol('ew-emit')

export type EmitFn = (name: string, detail?: unknown) => void

interface VueInstance {
  app: App
  propsRef: ShallowRef<Record<string, unknown>>
}

export function vueAdapter(getComponent: () => unknown): ElementAdapter {
  return {
    mount(host, props, emit) {
      const propsRef = shallowRef<Record<string, unknown>>({ ...props })
      const app = createApp({
        render: () => h(getComponent() as never, propsRef.value),
      })
      app.provide(EW_EMIT_KEY, emit)
      app.mount(host as HTMLElement)
      const instance: VueInstance = { app, propsRef }
      return instance
    },
    update(instance, props) {
      ;(instance as VueInstance).propsRef.value = { ...props }
    },
    unmount(instance) {
      ;(instance as VueInstance).app.unmount()
    },
  }
}

export function useEmit(): EmitFn {
  const emit = inject<EmitFn | null>(EW_EMIT_KEY, null)
  if (!emit) {
    console.warn('[ew] useEmit() 在 EW_EMIT_KEY 未注入的上下文中被调用，事件不会被派发。')
    return () => {}
  }
  return emit
}
