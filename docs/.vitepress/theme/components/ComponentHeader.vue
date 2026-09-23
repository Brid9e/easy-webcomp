<script setup lang="ts">
import { computed } from 'vue'
import { toIdentifier } from '@ew/utils'
import CopyTagButton from './CopyTagButton.vue'
import { componentDepsWithIcons } from './component-deps'

const props = defineProps<{ name: string }>()

// 标题写导入时用的标识符（`my-list` → `MyList`），与卡片、侧边栏一致；
// 连字符那套是目录名，只出现在文件路径里。
const label = computed(() => toIdentifier(props.name))
const deps = computed(() => componentDepsWithIcons(props.name))
</script>

<template>
  <!-- 详情页的标题与依赖行都由这里出。动态兜底页的 md 只有一行组件调用，散文页也不写
       `# 标题`（写了会跟这里重复），两类详情页的头因此长得一样。页面 <title> 补在
       config.mts 的 transformPageData 里。 -->
  <div class="header">
    <h1 class="name">
      {{ label }}
      <CopyTagButton :name="name" />
    </h1>

    <span v-if="deps.length > 0" class="ew-deps">
      <span v-for="dep in deps" :key="dep.name" class="ew-dep">
        <!-- alt 留空：包名就在旁边，读屏再念一遍图标名是噪音 -->
        <img class="ew-dep-icon" :src="dep.icon" alt="" />
        <span class="ew-dep-name">{{ dep.name }}</span>
        <span class="ew-dep-version">{{ dep.version }}</span>
      </span>
    </span>
  </div>
</template>

<style scoped>
/* 字号、行高、margin 都归 `.vp-doc h1` 管（这里是 28px），本组件只管把复制按钮摆到名字右边 */
.name {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* h1 的字号是卡片标题的两倍，13px 的图标贴上去会小得看不见 */
.name :deep(.copy-icon) {
  width: 16px;
  height: 16px;
}

/* h1 的 margin 被 VitePress reset 成 0，依赖行会直接贴上标题，得自己留一点气口
   （卡片那边靠 .meta 的 gap，不在这里管） */
.header .ew-deps {
  margin-top: 6px;
}
</style>
