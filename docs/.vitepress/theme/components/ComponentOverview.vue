<script setup lang="ts">
import ComponentDemo from './ComponentDemo.vue'

// 用 eager：meta 模块已经被 ComponentDemo 静态引了，这里再走动态 import 只会让 Rollup
// 同时产出两条路径并警告，没有收益
const names = Object.keys(import.meta.glob('@src/components/*/meta.ts', { eager: true }))
  .map((path) => path.split('/').at(-2) ?? '')
  .sort((a, b) => a.localeCompare(b))
</script>

<template>
  <div>
    <p v-if="names.length === 0" class="empty">还没有任何组件。</p>
    <section v-for="name in names" :id="name" :key="name" class="overview-item">
      <h2 class="overview-title">{{ name }}</h2>
      <ComponentDemo :name="name" />
    </section>
  </div>
</template>

<style scoped>
.overview-item {
  margin-bottom: 48px;
}
.overview-title {
  padding-top: 24px;
  margin-top: 24px;
  border-top: 1px solid var(--ctc-color-border);
}
.overview-item:first-child .overview-title {
  padding-top: 0;
  margin-top: 0;
  border-top: none;
}
.empty {
  color: var(--ctc-color-text-secondary);
}
</style>
