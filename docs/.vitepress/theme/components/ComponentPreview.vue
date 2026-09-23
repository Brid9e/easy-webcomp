<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { withBase } from 'vitepress'
import { componentTag } from './component-tag'

const props = defineProps<{
  name: string
  /** 空间名，用来拼截图路径。不传就只能走真实元素 */
  ws?: string
  /** 强制挂真实元素 —— 全屏弹框是给上手玩的地方 */
  live?: boolean
}>()

const tag = computed(() => componentTag(props.name))

// 截图缺失（新组件尚未执行 `pnpm run snapshot`）时回退到真实元素。
// 卡片宁可多承担一次运行时开销，也不应出现空白区域。
const shotFailed = ref(false)
const shot = computed(() => (props.ws ? withBase(`/snapshots/${props.ws}/${props.name}.png`) : ''))
const useLive = computed(() => Boolean(props.live) || shotFailed.value || !props.ws)

const defined = ref(false)

// 与详情页同一条路径：注册的是 createElementClass 产出的元素，与消费方拿到的一致，
// 样式落在 shadow root 里，不会漏进文档站。
async function register(): Promise<void> {
  if (!tag.value || defined.value) return
  if (customElements.get(tag.value)) {
    defined.value = true
    return
  }
  const modules = (await import('virtual:ew-wc-index')) as {
    default: Record<string, { Element: CustomElementConstructor }>
  }
  const mod = modules.default[props.name]
  if (!mod) return
  // 跨 bundle 场景下这里仍可能被别人抢先定义过，define 同 tag 会直接抛错。
  if (!customElements.get(tag.value)) customElements.define(tag.value, mod.Element)
  defined.value = true
}

// 组件运行时只在真要挂元素时才拉。卡片默认走截图，那句动态 import 根本不会发生 ——
// 列表页因此不必把所有组件的运行时（my-list 那份就近 400 KB）全加载进来。
//
// onMounted 而不是 watch 的 immediate：<ClientOnly> 挡的是它 slot 里的内容，本组件的
// setup 在 SSR 期照样执行，immediate 会在 Node 里 import 到顶层就 `extends HTMLElement`
// 的运行时模块，直接 `HTMLElement is not defined` 炸掉构建。
onMounted(() => {
  if (useLive.value) void register()
})
watch(useLive, (live) => {
  if (live) void register()
})
</script>

<template>
  <!-- 未注册前不渲染标签：否则会先落一个空的自定义元素，注册完再升级，视觉上闪一下 -->
  <img v-if="!useLive" class="shot" :src="shot" :alt="`${name} 预览`" @error="shotFailed = true" />
  <component :is="tag" v-else-if="defined && tag" />
</template>

<style scoped>
/* 井是固定 140px 高、约 300px 宽，而截图按组件实际尺寸出（my-list 那种整页表格有 1160×652），
   靠这里等比缩小以完整容纳；换成真实元素就只会被 overflow: hidden 裁掉大半。
   截图是透明的，井也不设背景，因此图像边界不可见。 */
.shot {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
</style>
