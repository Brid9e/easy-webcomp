<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

interface MetaShape {
  tag: string
}

const props = defineProps<{ name: string }>()

// tag 走 glob 而不是 virtual 模块：virtual 模块会在顶层 import 运行时，而运行时顶层就
// `extends HTMLElement`，SSR 期在 Node 里直接炸。glob 只读 meta.ts，是纯数据。
const metaModules = import.meta.glob('@src/workspaces/*/components/*/meta.ts', {
  eager: true,
}) as Record<string, { default: MetaShape }>

const dirName = (path: string) => path.split('/').at(-2) ?? ''

const tag = computed(
  () => Object.entries(metaModules).find(([path]) => dirName(path) === props.name)?.[1].default.tag,
)

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

onMounted(() => {
  void register()
})
</script>

<template>
  <!-- 未注册前不渲染标签：否则会先落一个空的自定义元素，注册完再升级，视觉上闪一下 -->
  <component :is="tag" v-if="defined && tag" />
</template>
