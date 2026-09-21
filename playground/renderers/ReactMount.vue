<script setup lang="ts">
import { createElement, type ComponentType } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CtcEmitContext } from '../../src/runtime/react'
import { componentStyle } from './source-style'

const props = defineProps<{
  name: string
  component: ComponentType<Record<string, unknown>>
  propsData: Record<string, unknown>
  onEvent: (name: string, detail: unknown) => void
}>()

const container = ref<HTMLDivElement | null>(null)
let root: Root | null = null

function render(): void {
  if (!root) return
  root.render(
    createElement(
      CtcEmitContext.Provider,
      { value: (name: string, detail: unknown) => props.onEvent(name, detail) },
      createElement(props.component, props.propsData),
    ),
  )
}

onMounted(() => {
  if (!container.value) return

  // 挂进 shadow root 并注入组件自己的 style.css，让源码模式与 WC 模式外观一致
  const shadow = container.value.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = componentStyle(props.name)
  shadow.appendChild(style)

  root = createRoot(shadow as unknown as Element)
  render()
})

watch(() => [props.component, props.propsData], render, { deep: true })

onBeforeUnmount(() => {
  root?.unmount()
  root = null
})
</script>

<template>
  <div ref="container"></div>
</template>
