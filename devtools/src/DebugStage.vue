<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ComponentEntry } from '@devtools/component-index'
import { widthForRightEdge } from '@devtools/stage-resize'
import { registerWcElement } from '@devtools/wc-registry'
import ResizeHandle from './ResizeHandle.vue'
import { usePersisted } from './use-persisted'

const props = defineProps<{
  entry: ComponentEntry | undefined
  model: Record<string, unknown>
  wcHandlers: Record<string, (e: Event) => void>
}>()

// 两侧栏的显隐归 App 管（既要存 localStorage，又要决定 v-if）。这里只是开关的落点 ——
// 那排小按钮的间距、字号、边框样式都在本组件的头部里，开关放别处就得再造一套。
const pickerOpen = defineModel<boolean>('pickerOpen', { required: true })
const panelOpen = defineModel<boolean>('panelOpen', { required: true })

const width = usePersisted('width', 375)
const height = usePersisted('height', 480)
const fill = usePersisted('fill', false)
const fillTarget = usePersisted('fillTarget', true)

const MIN_WIDTH = 120
const MIN_HEIGHT = 80
const PRESETS = [375, 768, 1024]

const tag = computed(() => props.entry?.meta?.tag ?? '')

const body = ref<HTMLElement | null>(null)
const areaEl = ref<HTMLElement | null>(null)
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

/** 舞台内容区宽度（不含左右 padding）：判断框架还在「居中区间」里，还是已经宽到溢出。 */
function stageInnerWidth(): number {
  const area = areaEl.value
  if (!area) return 0
  const style = getComputedStyle(area)
  return (
    area.clientWidth -
    (Number.parseFloat(style.paddingLeft) || 0) -
    (Number.parseFloat(style.paddingRight) || 0)
  )
}

// 组件的 :host 是 inline-block（脚手架生成），不撑满的话它按内容收缩 ——
// 把容器改成 375px 对组件毫无作用，自适应调试就假了。
// 宿主元素上外部文档的普通声明优先于 shadow tree 里的 :host 规则，所以内联样式压得过它。
const targetStyle = computed(() => (fillTarget.value ? { display: 'block', width: '100%' } : {}))

// 必须复用组件自己的 index.ts（UI 库样式内联、Pinia 按实例装都在里面），
// 所以走 wc-mode 插件的虚拟模块，而不是在这里重造元素
async function enableWc(): Promise<void> {
  const wanted = tag.value
  const name = props.entry?.name ?? ''
  if (!wanted || !name) return

  if (!customElements.get(wanted)) await registerWcElement(name, wanted)

  // import 是异步的，这中间用户可能已经切走了 —— 只有当前 tag 仍是我们要的那个才算就绪
  if (tag.value === wanted) defined.value = true
}

watch(
  () => props.entry?.name,
  () => {
    // 换组件时先把标签收起来：新 tag 还没 define，直接渲染会落一个未升级的空元素
    defined.value = Boolean(tag.value && customElements.get(tag.value))
    void enableWc().catch((err) => console.error('[ew] 加载 WC 模块失败：', err))
  },
  { immediate: true },
)

/**
 * 三个把手共用一个入口，各自只把归自己的那个轴传成非零（见 ResizeHandle）。
 *
 * 横向不能直接 width += dx：框架一直居中，宽度一变左右对称张开，右边线只走鼠标的一半。
 * 所以把 dx 交给 widthForRightEdge 反解（居中那段正好翻倍），边线才 1:1 跟手。
 * 垂直方向本来就是顶边钉住（align-items: flex-start），朴素加法即可。
 *
 * 反过来，居中由 CSS 的 `safe center` 一直兜着 —— 不用管拖拽结束、切组件还是改窗口大小。
 */
function resize(dx: number, dy: number): void {
  if (dx !== 0) {
    // 「铺满」时状态里的 width 不是真实宽度，先从实测值起步再退出铺满
    const base = fill.value ? measured.value.width : width.value
    fill.value = false
    width.value = Math.max(MIN_WIDTH, widthForRightEdge(base, dx, stageInnerWidth()))
  }
  if (dy !== 0) {
    height.value = Math.max(MIN_HEIGHT, height.value + dy)
  }
}

function applyPreset(value: number): void {
  fill.value = false
  width.value = value
}

function applyFill(): void {
  fill.value = true
}
</script>

<template>
  <section class="stage">
    <header class="stage-head">
      <button
        type="button"
        :class="{ active: pickerOpen }"
        :aria-expanded="pickerOpen"
        :title="pickerOpen ? '收起组件列表' : '展开组件列表'"
        @click="pickerOpen = !pickerOpen"
      >
        组件列表
      </button>

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
        <button type="button" :class="{ active: fill }" @click="applyFill">铺满</button>
      </div>

      <button type="button" :class="{ active: fillTarget }" @click="fillTarget = !fillTarget">
        组件撑满容器
      </button>

      <p class="readout">{{ measured.width }} × {{ measured.height }}</p>

      <button
        type="button"
        :class="{ active: panelOpen }"
        :aria-expanded="panelOpen"
        :title="panelOpen ? '收起属性 / 事件栏' : '展开属性 / 事件栏'"
        @click="panelOpen = !panelOpen"
      >
        属性
      </button>
    </header>

    <div ref="areaEl" class="stage-area">
      <div class="stage-frame" :style="frameStyle">
        <div ref="body" class="stage-body">
          <p v-if="!entry" class="placeholder">左栏选一个组件</p>

          <component
            v-else-if="tag && defined"
            :is="tag"
            :style="targetStyle"
            v-bind="model"
            v-on="wcHandlers"
          />
        </div>

        <ResizeHandle direction="horizontal" :apply-delta="resize" />
        <ResizeHandle direction="vertical" :apply-delta="resize" />
        <ResizeHandle direction="corner" :apply-delta="resize" />
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
  /* safe center：装得下就居中；框架比舞台还宽时退化成左对齐 —— 纯 center 会让左侧那截
     溢出到滚动起点之外，怎么拖滚动条都够不着。居中一直由它兜着，横向拖拽的倍率按它来反解。 */
  justify-content: safe center;
  padding: 24px;
  overflow: auto;
}
.stage-frame {
  position: relative;
  /* 它是 flex item，默认 flex-shrink: 1 —— 声明宽度一旦超过 stage-area 的内容宽就被压回去，
     于是「1024 预设」和「拖过容器宽的把手」都静默失效，overflow: auto 永远等不到滚动条。
     撑不住就交给 stage-area 滚，这才是当初「可滚动」的写法。 */
  flex-shrink: 0;
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
