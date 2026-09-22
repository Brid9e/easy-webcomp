<script setup lang="ts">
import { createApp, h, onBeforeUnmount, onMounted, ref, shallowRef, watch, type App } from 'vue'
import { EW_EMIT_KEY } from '@ew/runtime'
import { componentStyle } from '../source-style'

const props = defineProps<{
  name: string
  /** 组件 index.ts 内联的那份 CSS（含 UI 库）；缺省时回落到目录里的 style.{css,scss} */
  styles?: string
  component: unknown
  propsData: Record<string, unknown>
  onEvent: (name: string, detail: unknown) => void
}>()

const container = ref<HTMLDivElement | null>(null)
const propsRef = shallowRef<Record<string, unknown>>({})
let app: App | null = null
let styleEl: HTMLStyleElement | null = null

watch(
  () => props.propsData,
  (next) => {
    propsRef.value = { ...next }
  },
  { deep: true, immediate: true },
)

onMounted(() => {
  if (!container.value) return

  // 挂进 shadow root 并注入样式，让源码模式与 WC 模式外观一致
  const root = container.value.attachShadow({ mode: 'open' })
  styleEl = document.createElement('style')
  styleEl.textContent = props.styles || componentStyle(props.name)
  root.appendChild(styleEl)

  app = createApp({ render: () => h(props.component as never, propsRef.value) })
  app.provide(EW_EMIT_KEY, (name: string, detail: unknown) => props.onEvent(name, detail))
  app.mount(root as unknown as Element)
})

// styles 走虚拟模块异步取回，挂载那一刻可能还没到 —— 到了补进去，别让组件裸着。
// 只在非空时覆盖：空串表示「还没取回」，不是「该清掉」。
watch(
  () => props.styles,
  (next) => {
    if (styleEl && next) styleEl.textContent = next
  },
)

onBeforeUnmount(() => {
  app?.unmount()
  app = null
  styleEl = null
})
</script>

<template>
  <div ref="container"></div>
</template>
