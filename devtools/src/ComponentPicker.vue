<script setup lang="ts">
import { groupByWorkspace } from '@devtools/component-index'

const selected = defineModel<string>({ required: true })
// glob 是 eager 的、组件清单在启动时就定下了，所以这里算一次即可
const groups = groupByWorkspace()
</script>

<template>
  <nav class="picker">
    <h2>组件</h2>

    <div v-for="group in groups" :key="group.id" class="group">
      <p class="group-title">{{ group.title }}</p>
      <button
        v-for="item in group.items"
        :key="item.name"
        type="button"
        :class="{ active: item.name === selected }"
        @click="selected = item.name"
      >
        <span class="dot" :class="item.framework" />
        {{ item.name }}
      </button>
    </div>

    <p v-if="groups.length === 0" class="empty">没有扫描到组件</p>
  </nav>
</template>

<style scoped>
.picker {
  display: flex;
  flex: none;
  flex-direction: column;
  width: 220px;
  padding: 16px;
  overflow: auto;
  border-right: 1px solid var(--ew-color-border);
  background: var(--ew-color-bg);
}
.picker h2 {
  margin: 0 0 12px;
  font-size: var(--ew-font-size-md);
}
.group-title {
  margin: 12px 0 6px;
  color: var(--ew-color-text-secondary);
  font-size: var(--ew-font-size-sm);
}
.picker button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: var(--ew-radius-sm);
  background: none;
  color: inherit;
  text-align: left;
}
.picker button:hover {
  background: color-mix(in srgb, var(--ew-color-primary) 8%, transparent);
}
.picker button.active {
  background: var(--ew-color-primary);
  color: #fff;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ew-color-text-secondary);
}
.dot.vue {
  background: #42b883;
}
.dot.react {
  background: #61dafb;
}
.empty {
  color: var(--ew-color-text-secondary);
  font-size: var(--ew-font-size-sm);
}
</style>
