<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import ComponentPreview from './ComponentPreview.vue'

const props = defineProps<{ name: string; open: boolean }>()
const emit = defineEmits<{ close: [] }>()

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

// body 滚动锁与键盘监听都跟着 open 走，注册/注销必须成对；组件被卸载时再兜一次，
// 否则弹框开着时切路由会把整页锁死成不可滚动。
watch(
  () => props.open,
  (open) => {
    if (open) {
      document.addEventListener('keydown', onKeydown)
      document.body.style.overflow = 'hidden'
    } else {
      document.removeEventListener('keydown', onKeydown)
      document.body.style.overflow = ''
    }
  },
)

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <ClientOnly>
    <Teleport to="body">
      <div v-if="open" class="overlay" @click.self="emit('close')">
        <div class="frame">
          <header class="bar">
            <code class="title">{{ name }}</code>
            <button type="button" class="close" aria-label="关闭" @click="emit('close')">✕</button>
          </header>
          <!-- 弹框里的预览是给上手玩的，不做任何 pointer-events 限制 -->
          <div class="stage">
            <ComponentPreview :name="name" />
          </div>
        </div>
      </div>
    </Teleport>
  </ClientOnly>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  padding: 24px;
  background: rgb(0 0 0 / 60%);
}

.frame {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border: 1px solid var(--ew-color-border);
  border-radius: var(--ew-radius-lg);
  background: var(--ew-color-bg);
}

.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex: none;
  padding: 10px 16px;
  border-bottom: 1px solid var(--ew-color-border);
}

.title {
  font-family: var(--ew-font-family);
  font-size: var(--ew-font-size-md);
  color: var(--ew-color-text);
}

.close {
  padding: 2px 10px;
  border: 1px solid var(--ew-color-border);
  border-radius: var(--ew-radius-sm);
  background: var(--ew-color-bg);
  color: var(--ew-color-text-secondary);
  font: inherit;
  cursor: pointer;
}

.close:hover {
  border-color: var(--ew-color-primary);
  color: var(--ew-color-primary);
}

/* 舞台：小内容居中，大内容从头开始并可滚动。
   `safe` 是这里的关键 —— 居中会让超出容器的部分两头都够不着（经典的 flex 居中溢出裁剪），
   safe 在放不下时自动退回 start，所以整页类条目将来塞进来也不会被裁掉开头。 */
.stage {
  display: flex;
  flex-direction: column;
  align-items: safe center;
  justify-content: safe center;
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 24px;
  color: var(--ew-color-text);
}
</style>
