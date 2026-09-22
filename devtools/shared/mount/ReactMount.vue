<script setup lang="ts">
import { createElement, type ComponentType } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EwEmitContext } from '@ew/runtime'
import { componentStyle } from '../source-style'

const props = defineProps<{
  name: string
  /** 组件 index.ts 内联的那份 CSS（含 UI 库）；缺省时回落到目录里的 style.{css,scss} */
  styles?: string
  component: ComponentType<Record<string, unknown>>
  propsData: Record<string, unknown>
  onEvent: (name: string, detail: unknown) => void
}>()

const container = ref<HTMLDivElement | null>(null)
let root: Root | null = null
let styleEl: HTMLStyleElement | null = null

function render(): void {
  if (!root) return
  root.render(
    createElement(
      EwEmitContext.Provider,
      { value: (name: string, detail: unknown) => props.onEvent(name, detail) },
      createElement(props.component, props.propsData),
    ),
  )
}

onMounted(() => {
  if (!container.value) return

  // 挂进 shadow root 并注入样式，让源码模式与 WC 模式外观一致
  const shadow = container.value.attachShadow({ mode: 'open' })
  styleEl = document.createElement('style')
  styleEl.textContent = props.styles || componentStyle(props.name)
  shadow.appendChild(styleEl)

  root = createRoot(shadow as unknown as Element)
  render()
})

watch(() => [props.component, props.propsData], render, { deep: true })

// styles 走虚拟模块异步取回，挂载那一刻可能还没到 —— 到了补进去，别让组件裸着。
// 只在非空时覆盖：空串表示「还没取回」，不是「该清掉」。
watch(
  () => props.styles,
  (next) => {
    if (styleEl && next) styleEl.textContent = next
  },
)

onBeforeUnmount(() => {
  root?.unmount()
  root = null
  styleEl = null
})
</script>

<template>
  <div ref="container"></div>
</template>
