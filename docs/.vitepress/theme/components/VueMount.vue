<script setup lang="ts">
import { createApp, h, onBeforeUnmount, onMounted, ref, shallowRef, watch, type App } from 'vue'
import { EW_EMIT_KEY } from '@ew/runtime'
import { componentStyle } from './source-style'

const props = defineProps<{
  name: string
  component: unknown
  propsData: Record<string, unknown>
  onEvent: (name: string, detail: unknown) => void
}>()

const container = ref<HTMLDivElement | null>(null)
const propsRef = shallowRef<Record<string, unknown>>({})
let app: App | null = null

watch(
  () => props.propsData,
  (next) => {
    propsRef.value = { ...next }
  },
  { deep: true, immediate: true },
)

onMounted(() => {
  if (!container.value) return

  // 挂进 shadow root 并注入组件自己的 style.css，让源码模式与 WC 模式外观一致
  const root = container.value.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = componentStyle(props.name)
  root.appendChild(style)

  app = createApp({ render: () => h(props.component as never, propsRef.value) })
  app.provide(EW_EMIT_KEY, (name: string, detail: unknown) => props.onEvent(name, detail))
  app.mount(root as unknown as Element)
})

onBeforeUnmount(() => {
  app?.unmount()
  app = null
})
</script>

<template>
  <div ref="container"></div>
</template>
