<script setup lang="ts">
import { computed } from 'vue'
import { VPLink } from 'vitepress/theme'

const props = defineProps<{
  ws: string
  name: string
  framework: 'vue' | 'react'
}>()

// VPLink 内部走 VitePress 的 normalizeLink：会按 cleanUrls 决定加不加 .html，
// 并拼上 base。手写 href 在静态托管上会 404。
const href = computed(() => `/workspaces/${props.ws}/${props.name}`)
</script>

<template>
  <VPLink :href="href" class="card">
    <svg
      v-if="framework === 'vue'"
      class="icon"
      viewBox="0 0 261.76 226.69"
      role="img"
      aria-label="Vue"
    >
      <path d="M161.096.001l-30.225 52.351L100.647.001H-.005l130.877 226.69L261.76.001z" fill="#41B883" />
      <path d="M161.096.001l-30.225 52.351L100.647.001H52.346l78.526 136.01L209.665.001z" fill="#34495E" />
    </svg>
    <svg
      v-else
      class="icon"
      viewBox="-11.5 -10.23174 23 20.46348"
      role="img"
      aria-label="React"
    >
      <circle cx="0" cy="0" r="2.05" fill="#61DAFB" />
      <g stroke="#61DAFB" stroke-width="1" fill="none">
        <ellipse rx="11" ry="4.2" />
        <ellipse rx="11" ry="4.2" transform="rotate(60)" />
        <ellipse rx="11" ry="4.2" transform="rotate(120)" />
      </g>
    </svg>
    <span class="name">{{ name }}</span>
  </VPLink>
</template>

<style scoped>
.card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px;
  border: 1px solid var(--ew-color-border);
  border-radius: var(--ew-radius-md);
  color: var(--ew-color-text);
  text-decoration: none;
  transition: border-color 0.2s;
}
.card:hover {
  border-color: var(--ew-color-primary);
}
.icon {
  width: 20px;
  height: 20px;
  flex: none;
}
.name {
  font-size: var(--ew-font-size-md);
  overflow-wrap: anywhere;
}
</style>
