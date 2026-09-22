<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ComponentEntry } from '@devtools/component-index'
import ReactMount from '@devtools/mount/ReactMount.vue'
import VueMount from '@devtools/mount/VueMount.vue'
import ResizeHandle from './ResizeHandle.vue'
import { usePersisted } from './use-persisted'

const props = defineProps<{
  entry: ComponentEntry | undefined
  model: Record<string, unknown>
  wcHandlers: Record<string, (e: Event) => void>
  onEvent: (name: string, detail: unknown) => void
}>()

const mode = usePersisted<'wc' | 'source'>('mode', 'wc')
const width = usePersisted('width', 375)
const height = usePersisted('height', 480)
const fill = usePersisted('fill', false)
const fillTarget = usePersisted('fillTarget', true)

const MIN_WIDTH = 120
const MIN_HEIGHT = 80
const PRESETS = [375, 768, 1024]

const tag = computed(() => props.entry?.meta?.tag ?? '')
const framework = computed(() => props.entry?.framework ?? 'react')

const body = ref<HTMLElement | null>(null)
const defined = ref(false)
const measured = ref({ width: 0, height: 0 })
let observer: ResizeObserver | null = null

onMounted(() => {
  if (!body.value) return
  observer = new ResizeObserver(([record]) => {
    const rect = record!.contentRect
    measured.value = { width: Math.round(rect.width), height: Math.round(rect.height) }
  })
  observer.observe(body.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})

const frameStyle = computed(() => ({
  width: fill.value ? '100%' : `${width.value}px`,
  height: `${height.value}px`,
}))

// 组件的 :host 是 inline-block（脚手架生成），不撑满的话它按内容收缩 ——
// 把容器改成 375px 对组件毫无作用，自适应调试就假了。
// 宿主元素上外部文档的普通声明优先于 shadow tree 里的 :host 规则，所以内联样式压得过它。
const targetStyle = computed(() => (fillTarget.value ? { display: 'block', width: '100%' } : {}))

// WC 模式必须复用组件自己的 index.ts（UI 库样式内联、Pinia 按实例装都在里面），
// 所以走 wc-mode 插件的虚拟模块，而不是在这里重造元素
async function enableWc(): Promise<void> {
  const wanted = tag.value
  const name = props.entry?.name ?? ''
  if (!wanted || !name) return

  if (!customElements.get(wanted)) {
    const modules = (await import('virtual:ew-wc-index')) as {
      default: Record<string, { Element: CustomElementConstructor }>
    }
    const mod = modules.default[name]
    if (!mod) return
    // 同 tag 重复 define 会直接抛错；customElements.get 是跨 bundle 场景下唯一有效的防线
    if (!customElements.get(wanted)) customElements.define(wanted, mod.Element)
  }

  // import 是异步的，这中间用户可能已经切走了 —— 只有当前 tag 仍是我们要的那个才算就绪
  if (tag.value === wanted) defined.value = true
}

watch(
  [() => props.entry?.name, mode],
  () => {
    if (mode.value !== 'wc') return
    // 换组件时先把标签收起来：新 tag 还没 define，直接渲染会落一个未升级的空元素
    defined.value = Boolean(tag.value && customElements.get(tag.value))
    void enableWc().catch((err) => console.error('[ew] 加载 WC 模块失败：', err))
  },
  { immediate: true },
)

function resizeWidth(delta: number): void {
  // 「铺满」时状态里的 width 不是真实宽度，先从实测值起步再退出铺满
  const base = fill.value ? measured.value.width : width.value
  fill.value = false
  width.value = Math.max(MIN_WIDTH, base + delta)
}

function resizeHeight(delta: number): void {
  height.value = Math.max(MIN_HEIGHT, height.value + delta)
}

function applyPreset(value: number): void {
  fill.value = false
  width.value = value
}
</script>

<template>
  <section class="stage">
    <header class="stage-head">
      <div class="switch">
        <button type="button" :class="{ active: mode === 'wc' }" @click="mode = 'wc'">
          WC 模式
        </button>
        <button type="button" :class="{ active: mode === 'source' }" @click="mode = 'source'">
          源码模式
        </button>
      </div>

      <div class="switch">
        <button
          v-for="preset in PRESETS"
          :key="preset"
          type="button"
          :class="{ active: !fill && width === preset }"
          @click="applyPreset(preset)"
        >
          {{ preset }}
        </button>
        <button type="button" :class="{ active: fill }" @click="fill = true">铺满</button>
      </div>

      <button type="button" :class="{ active: fillTarget }" @click="fillTarget = !fillTarget">
        组件撑满容器
      </button>

      <p class="readout">{{ measured.width }} × {{ measured.height }}</p>
    </header>

    <div class="stage-area">
      <div class="stage-frame" :style="frameStyle">
        <div ref="body" class="stage-body">
          <p v-if="!entry" class="placeholder">左栏选一个组件</p>

          <component
            v-else-if="mode === 'wc' && tag && defined"
            :is="tag"
            :style="targetStyle"
            v-bind="model"
            v-on="wcHandlers"
          />

          <VueMount
            v-else-if="mode === 'source' && framework === 'vue'"
            :key="entry.name"
            :name="entry.name"
            :component="entry.source as never"
            :props-data="model"
            :on-event="onEvent"
          />
          <ReactMount
            v-else-if="mode === 'source'"
            :key="entry.name"
            :name="entry.name"
            :component="entry.source as never"
            :props-data="model"
            :on-event="onEvent"
          />
        </div>

        <ResizeHandle direction="horizontal" :apply-delta="resizeWidth" />
        <ResizeHandle direction="vertical" :apply-delta="resizeHeight" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.stage {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}
.stage-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--ew-color-border);
  background: var(--ew-color-bg);
}
.readout {
  margin: 0 0 0 auto;
  color: var(--ew-color-text-secondary);
  font-variant-numeric: tabular-nums;
}
.stage-area {
  display: flex;
  flex: 1;
  align-items: flex-start;
  justify-content: center;
  padding: 24px;
  overflow: auto;
}
.stage-frame {
  position: relative;
  /* 用 box-shadow 画边框：阴影不占布局，实测宽度才严格等于设定的那个数 */
  box-shadow: 0 0 0 1px var(--ew-color-border);
  border-radius: var(--ew-radius-md);
}
.stage-body {
  width: 100%;
  height: 100%;
  overflow: auto;
  border-radius: var(--ew-radius-md);
  /* 组件配色基于浅色，跟随系统深色会让它深字压深底 —— 与文档站的 .canvas 同一个理由 */
  background: var(--ew-color-bg);
  color: var(--ew-color-text);
}
.placeholder {
  margin: 0;
  padding: 16px;
  color: var(--ew-color-text-secondary);
}
.switch {
  display: flex;
}
.switch button {
  padding: 4px 10px;
  border: 1px solid var(--ew-color-border);
  background: var(--ew-color-bg);
  color: var(--ew-color-text);
  font-size: var(--ew-font-size-sm);
}
.switch button:not(:first-child) {
  border-left: none;
}
.switch button:first-child {
  border-radius: var(--ew-radius-sm) 0 0 var(--ew-radius-sm);
}
.switch button:last-child {
  border-radius: 0 var(--ew-radius-sm) var(--ew-radius-sm) 0;
}
.switch button.active {
  border-color: var(--ew-color-primary);
  background: var(--ew-color-primary);
  color: #fff;
}
.stage-head > button {
  padding: 4px 10px;
  border: 1px solid var(--ew-color-border);
  border-radius: var(--ew-radius-sm);
  background: var(--ew-color-bg);
  color: var(--ew-color-text);
  font-size: var(--ew-font-size-sm);
}
.stage-head > button.active {
  border-color: var(--ew-color-primary);
  color: var(--ew-color-primary);
}
</style>
