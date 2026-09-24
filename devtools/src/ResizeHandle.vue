<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  direction: 'horizontal' | 'vertical' | 'corner'
  applyDelta: (dx: number, dy: number) => void
}>()

const dragging = ref(false)
let startX = 0
let startY = 0

function onPointerDown(event: PointerEvent): void {
  dragging.value = true
  startX = event.clientX
  startY = event.clientY
  // 捕获指针：拖出把手甚至拖出窗口，pointermove 仍然回到这里
  ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
  if (!dragging.value) return
  // 每条把手只报自己管的那几个轴，免得拖右把手顺手把高度也改了
  const dx = props.direction === 'vertical' ? 0 : event.clientX - startX
  const dy = props.direction === 'horizontal' ? 0 : event.clientY - startY
  props.applyDelta(dx, dy)
  startX = event.clientX
  startY = event.clientY
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
/* 压在两条边交角上，DOM 里排在它们后面所以拿得到点击 */
.corner {
  right: -4px;
  bottom: -4px;
  width: 12px;
  height: 12px;
  cursor: nwse-resize;
}
</style>
