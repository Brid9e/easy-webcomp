<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  direction: 'horizontal' | 'vertical'
  applyDelta: (delta: number) => void
}>()

const dragging = ref(false)
let start = 0

function axis(event: PointerEvent): number {
  return props.direction === 'horizontal' ? event.clientX : event.clientY
}

function onPointerDown(event: PointerEvent): void {
  dragging.value = true
  start = axis(event)
  // 捕获指针：拖出把手甚至拖出窗口，pointermove 仍然回到这里
  ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
  if (!dragging.value) return
  const current = axis(event)
  props.applyDelta(current - start)
  start = current
}

function onPointerUp(): void {
  dragging.value = false
}
</script>

<template>
  <div
    class="handle"
    :class="direction"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  />
</template>

<style scoped>
.handle {
  position: absolute;
  /* touch-action: none 少了，触屏上拖拽会变成页面滚动 */
  touch-action: none;
  user-select: none;
}
.handle:hover {
  background: color-mix(in srgb, var(--ew-color-primary) 35%, transparent);
}
/* 跨在边缘上：一半在内一半在外。完全放外侧在「铺满」时没有空间，
   而跨边同样能压过组件自己的 pointer 处理，且只遮挡 4px。 */
.horizontal {
  top: 0;
  right: -4px;
  width: 8px;
  height: 100%;
  cursor: ew-resize;
}
.vertical {
  bottom: -4px;
  left: 0;
  width: 100%;
  height: 8px;
  cursor: ns-resize;
}
</style>
