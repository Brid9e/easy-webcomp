<script setup lang="ts">
import { computed, ref } from 'vue'
import { VPLink } from 'vitepress/theme'
import { toIdentifier } from '@ew/utils'
import ComponentPreview from './ComponentPreview.vue'
import CopyTagButton from './CopyTagButton.vue'
import PreviewModal from './PreviewModal.vue'
import { componentDepsWithIcons } from './component-deps'

const props = defineProps<{
  ws: string
  name: string
}>()

// VPLink 内部走 VitePress 的 normalizeLink：会按 cleanUrls 决定加不加 .html，
// 并拼上 base。手写 href 在静态托管上会 404。
const href = computed(() => `/workspaces/${props.ws}/${props.name}`)

// 卡片上写导入时用的标识符（`my-list` → `MyList`），与 `import { MyList }` 对得上；
// 连字符那套是目录名，只出现在文件路径里。
const label = computed(() => toIdentifier(props.name))
const deps = computed(() => componentDepsWithIcons(props.name))

const open = ref(false)
</script>

<template>
  <div class="wrap">
    <div class="card">
      <div class="well">
        <ComponentPreview :name="name" :ws="ws" />
      </div>

      <div class="bar">
        <div class="meta">
          <div class="head">
            <!-- 按钮不能嵌在 <a> 里，所以链接只圈住名字，整卡的可点面积由 .name::after 铺出来 -->
            <VPLink :href="href" class="name">{{ label }}</VPLink>
            <CopyTagButton :name="name" />
          </div>

          <span v-if="deps.length > 0" class="ew-deps">
            <span v-for="dep in deps" :key="dep.name" class="ew-dep">
              <!-- alt 留空：包名就在旁边，读屏再念一遍图标名是噪音 -->
              <img class="ew-dep-icon" :src="dep.icon" alt="" />
              <span class="ew-dep-name">{{ dep.name }}</span>
              <span class="ew-dep-version">{{ dep.version }}</span>
            </span>
          </span>
        </div>
      </div>
    </div>

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
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--ew-radius-md);
  transition: border-color 0.2s;
}

.card:hover {
  border-color: var(--vp-c-brand-1);
}

/* 预览井：给组件一块固定高度的画布，超出裁掉。
   pointer-events: none 让点击穿透到名字链接铺出来的覆盖层上。 */
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

.head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.name {
  min-width: 0;
  color: var(--vp-c-text-1);
  font-weight: 600;
  font-size: var(--ew-font-size-lg);
  text-decoration: none;
  overflow-wrap: anywhere;
}

/* 整卡可点（stretched link）：卡片其余部分没有别的可交互元素，点击面积不该因为多了复制按钮
   就缩成只剩名字。定位基准是最近的定位祖先，也就是 .card 自己。 */
.name::after {
  content: '';
  position: absolute;
  inset: 0;
}

/* 复制按钮与依赖标签是卡片与详情页头共用的（CopyTagButton.vue、custom.css 的 .ew-*），
   这里只留卡片自己的外壳 */

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
