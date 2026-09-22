<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { componentByName } from '@devtools/component-index'
import { useEventLog, usePropControls } from '@devtools/preview-state'
import ReactMount from '@devtools/mount/ReactMount.vue'
import VueMount from '@devtools/mount/VueMount.vue'

const props = defineProps<{ name: string }>()

const entry = computed(() => componentByName(props.name))
const meta = computed(() => entry.value?.meta)
const framework = computed(() => entry.value?.framework ?? 'react')
const sourceComponent = computed(() => entry.value?.source)
const tag = computed(() => meta.value?.tag ?? '')

const { propDefs, values, booleanValues, model } = usePropControls(meta)
const { entries: events, log, wcHandlers } = useEventLog(computed(() => meta.value?.events))

// 文档站的读者是组件消费者，他们实际拿到的是 WC
const mode = ref<'source' | 'wc'>('wc')

async function enableWc(): Promise<void> {
  const modules = (await import('virtual:ew-wc-index')) as {
    default: Record<string, { Element: CustomElementConstructor }>
  }
  const mod = modules.default[props.name]
  if (!mod || !tag.value) return
  if (!customElements.get(tag.value)) customElements.define(tag.value, mod.Element)
}

watch(mode, (next) => {
  if (next === 'wc') void enableWc()
})

// 必须挂在 onMounted，不能用 watch 的 immediate —— <ClientOnly> 挡的是它 slot 里的内容，
// 本组件的 setup 在 SSR 期照样执行，immediate 会在 Node 里 import 到顶层就 `extends HTMLElement`
// 的运行时模块，直接 `HTMLElement is not defined` 炸掉构建。
onMounted(() => {
  if (mode.value === 'wc') void enableWc()
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
        <div class="panel-head">
          <h3>预览</h3>
          <div class="mode-switch">
            <button type="button" :class="{ active: mode === 'wc' }" @click="mode = 'wc'">
              WC 模式
            </button>
            <button type="button" :class="{ active: mode === 'source' }" @click="mode = 'source'">
              源码模式
            </button>
          </div>
        </div>

        <div :key="mode" class="canvas">
          <template v-if="mode === 'source'">
            <VueMount
              v-if="framework === 'vue'"
              :name="name"
              :component="sourceComponent as never"
              :props-data="model"
              :on-event="log"
            />
            <ReactMount
              v-else
              :name="name"
              :component="sourceComponent as never"
              :props-data="model"
              :on-event="log"
            />
          </template>

          <component :is="tag" v-else v-bind="model" v-on="wcHandlers" />
        </div>
      </div>

      <div class="panel">
        <h3>事件日志</h3>
        <p v-if="events.length === 0" class="empty">点击组件试试</p>
        <ul v-else>
          <li v-for="(e, i) in events" :key="i">
            <code>ew-{{ e.name }}</code> · {{ e.at }} · {{ JSON.stringify(e.detail) }}
          </li>
        </ul>
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
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.panel-head h3 {
  margin: 0;
}
.mode-switch button {
  padding: 4px 10px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font: inherit;
  font-size: var(--ew-font-size-sm);
  cursor: pointer;
}
.mode-switch button:first-child {
  border-radius: var(--ew-radius-sm) 0 0 var(--ew-radius-sm);
}
.mode-switch button:last-child {
  border-left: none;
  border-radius: 0 var(--ew-radius-sm) var(--ew-radius-sm) 0;
}
.mode-switch button.active {
  background: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  color: #fff;
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
.empty {
  color: var(--vp-c-text-2);
  font-size: var(--ew-font-size-sm);
}
ul {
  margin: 0;
  padding-left: 18px;
  font-size: var(--ew-font-size-sm);
}
</style>
