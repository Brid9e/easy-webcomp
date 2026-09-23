<script setup lang="ts">
import { computed, ref } from 'vue'
import { VPLink } from 'vitepress/theme'
import ComponentPreview from './ComponentPreview.vue'
import PreviewModal from './PreviewModal.vue'
import { componentDeps } from './component-deps'
import { libIcon } from './lib-icons'

const props = defineProps<{
  ws: string
  name: string
  framework: 'vue' | 'react'
}>()

// VPLink 内部走 VitePress 的 normalizeLink：会按 cleanUrls 决定加不加 .html，
// 并拼上 base。手写 href 在静态托管上会 404。
const href = computed(() => `/workspaces/${props.ws}/${props.name}`)

// 图标在这里就查好：模板里再调 libIcon() 得连写三遍（判空、取 viewBox、取 path）
const deps = computed(() =>
  componentDeps(props.name).map((dep) => ({ ...dep, icon: libIcon(dep.name) })),
)

const open = ref(false)
</script>

<template>
  <div class="wrap">
    <VPLink :href="href" class="card">
      <div class="well">
        <ComponentPreview :name="name" :ws="ws" />
      </div>
      <div class="bar">
        <div class="meta">
          <span class="name">{{ name }}</span>
          <span v-if="deps.length > 0" class="deps">
            <span v-for="dep in deps" :key="dep.name" class="dep">
              <!-- alt 留空：包名就在旁边，读屏再念一遍图标名是噪音 -->
              <img v-if="dep.icon" class="dep-icon" :src="dep.icon" alt="" />
              <span class="dep-name">{{ dep.name }}</span>
              <span class="version">{{ dep.version }}</span>
            </span>
          </span>
        </div>
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
      </div>
    </VPLink>

    <button type="button" class="expand" :aria-label="`全屏预览 ${name}`" @click="open = true">
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M6 1H1v5M10 1h5v5M10 15h5v-5M6 15H1v-5"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        />
      </svg>
    </button>

    <PreviewModal :name="name" :ws="ws" :open="open" @close="open = false" />
  </div>
</template>

<style scoped>
.wrap {
  position: relative;
  display: flex;
}

/* 卡片外壳是文档站的一部分，颜色一律走 --vp-* 跟着站点明暗走。
   --ew-* 那套不响应主题（暗色下不会重映射），拿来当外壳颜色会变成深字压深底。 */
.card {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--ew-radius-md);
  color: var(--vp-c-text-1);
  text-decoration: none;
  transition: border-color 0.2s;
}

.card:hover {
  border-color: var(--vp-c-brand-1);
}

/* 预览井：给组件一块固定高度的画布，超出裁掉。
   pointer-events: none 让点击穿透到整卡的链接上：卡片是「进详情页」的入口，
   要上手玩请点右上角全屏或直接进详情页。 */
.well {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 140px;
  overflow: hidden;
  border-bottom: 1px solid var(--vp-c-divider);
  /* 不设背景：截图自带透明通道，与页面底色连成一片。
     曾在这里垫一层 --ew-color-bg（白），那会让每张缩略图变成一个白方块。 */
  pointer-events: none;
}

.bar {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
}

.meta {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  /* 横向排列的 flex 子项默认 min-width: auto，长依赖名会把整行顶宽 */
  min-width: 0;
}

.name {
  font-size: var(--ew-font-size-md);
  overflow-wrap: anywhere;
}

/* 一个依赖一枚标签：图标 + 版本号。整枚折行，不留半枚。 */
.deps {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 6px;
  font-size: 12px;
  line-height: 1.6;
}

.dep {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 6px;
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--ew-radius-sm);
  color: var(--vp-c-text-2);
  white-space: nowrap;
}

.dep-icon {
  width: 13px;
  height: 13px;
  flex: none;
}

.dep-name {
  color: var(--vp-c-text-1);
}

.version {
  color: var(--vp-c-text-3);
}

/* 两个图标的配色是固定品牌色（Vue 的外圈是深蓝、React 是青色），压在暗色底栏上会糊掉。
   垫一块白底当「贴纸」，两套主题下都读得出来；浅色主题里白贴纸与页面同色，等于没有。 */
.icon {
  width: 18px;
  height: 18px;
  flex: none;
  padding: 2px;
  border-radius: var(--ew-radius-sm);
  background: #fff;
}

.expand {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 1;
  display: flex;
  padding: 5px;
  border: 1px solid var(--ew-color-border);
  border-radius: var(--ew-radius-sm);
  background: var(--ew-color-bg);
  color: var(--ew-color-text-secondary);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
}

/* 默认隐藏，避免遮挡组件内容；键盘聚焦时显示，否则看起来像不可用 */
.wrap:hover .expand,
.expand:focus-visible {
  opacity: 1;
}

.expand:hover {
  border-color: var(--ew-color-primary);
  color: var(--ew-color-primary);
}

.expand svg {
  width: 14px;
  height: 14px;
}
</style>
