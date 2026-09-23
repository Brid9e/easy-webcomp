<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { componentByName } from '@devtools/component-index'
import { useEventLog, usePropControls } from '@devtools/preview-state'
import { registerWcElement } from '@devtools/wc-registry'

const props = defineProps<{ name: string }>()

const entry = computed(() => componentByName(props.name))
const meta = computed(() => entry.value?.meta)
const tag = computed(() => meta.value?.tag ?? '')

const { propDefs, values, booleanValues, model } = usePropControls(meta)
const { wcHandlers } = useEventLog(computed(() => meta.value?.events))

// 文档站的读者是组件消费者，他们实际拿到的是 WC —— 预览也就只走这一条路，
// 复用组件自己的 index.ts（UI 库样式内联、Pinia 按实例装都在里面）。
async function enableWc(): Promise<void> {
  if (!tag.value) return
  await registerWcElement(props.name, tag.value)
}

// 必须挂在 onMounted，不能用 watch 的 immediate —— <ClientOnly> 挡的是它 slot 里的内容，
// 本组件的 setup 在 SSR 期照样执行，immediate 会在 Node 里 import 到顶层就 `extends HTMLElement`
// 的运行时模块，直接 `HTMLElement is not defined` 炸掉构建。
onMounted(() => {
  void enableWc()
})
</script>

<template>
  <ClientOnly>
    <div class="demo">
      <div class="panel">
        <h3>属性</h3>
        <label v-for="[name, def] in propDefs" :key="name" class="field">
          <span>{{ name }} <small>({{ def.type }})</small></span>
          <input
            v-if="def.type === 'boolean'"
            type="checkbox"
            :checked="booleanValues[name]"
            @change="booleanValues[name] = ($event.target as HTMLInputElement).checked"
          />
          <input
            v-else-if="def.type === 'number'"
            type="number"
            :value="values[name]"
            @input="values[name] = ($event.target as HTMLInputElement).value"
          />
          <input
            v-else
            type="text"
            :value="values[name]"
            @input="values[name] = ($event.target as HTMLInputElement).value"
          />
        </label>
        <p v-if="propDefs.length === 0" class="empty">该组件没有声明属性</p>
      </div>

      <div class="panel">
        <h3>预览</h3>

        <div class="canvas">
          <component :is="tag" v-bind="model" v-on="wcHandlers" />
        </div>

        <p class="hint">事件输出在浏览器控制台</p>
      </div>
    </div>
  </ClientOnly>
</template>

<style scoped>
.demo {
  margin: 16px 0;
}
/* 面板是文档站外壳，一律走 --vp-*：--ew-* 不随站点明暗重映射 */
.panel {
  margin-bottom: 20px;
  padding: 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--ew-radius-md);
}

/* 预览区刻意留白：组件自身配色基于浅色，跟着站点变暗会让它深字压深底 */
.canvas {
  padding: 16px;
  border-radius: var(--ew-radius-sm);
  background: var(--ew-color-bg);
  color: var(--ew-color-text);
}
.panel h3 {
  margin: 0 0 12px;
  font-size: var(--ew-font-size-md);
}
.field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.field small {
  color: var(--vp-c-text-2);
}

/*
 * VitePress 的 base.css 把 input 的边框、内边距、背景一并归零（实测 border: 0 none、
 * padding: 0、background: transparent），右边那一列就成了一行看不出能改的裸文字。
 * 这里把框补回来 —— 颜色走 --vp-*，明暗主题才不会一个样。
 * 排除 checkbox：那个是原生控件，本来就有外观，再画一圈框反而怪。
 */
.field input:not([type='checkbox']) {
  width: 160px;
  padding: 3px 8px;
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--ew-radius-sm);
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  font-size: var(--ew-font-size-sm);
}

.field input:not([type='checkbox']):focus {
  border-color: var(--vp-c-brand-1);
  outline: none;
}
.empty,
.hint {
  color: var(--vp-c-text-2);
  font-size: var(--ew-font-size-sm);
}
.hint {
  margin: 8px 0 0;
}
</style>
