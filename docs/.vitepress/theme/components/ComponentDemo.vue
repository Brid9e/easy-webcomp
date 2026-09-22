<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import ReactMount from './ReactMount.vue'
import VueMount from './VueMount.vue'

interface MetaShape {
  tag: string
  props?: Record<string, { type: string; default?: unknown }>
}

const props = defineProps<{ name: string }>()

const metaModules = import.meta.glob('@src/components/*/meta.ts', { eager: true }) as Record<
  string,
  { default: MetaShape }
>
const sourceModules = import.meta.glob('@src/components/*/Component.{vue,tsx}', {
  eager: true,
}) as Record<string, { default: unknown }>

// glob 生成的 key 形状（绝对路径 / 别名前缀 / 相对路径）是实现细节，只取倒数第二段目录名
function dirName(path: string): string {
  return path.split('/').at(-2) ?? ''
}

const meta = computed<MetaShape | undefined>(
  () => Object.entries(metaModules).find(([path]) => dirName(path) === props.name)?.[1].default,
)

const framework = computed<'vue' | 'react'>(() =>
  Object.keys(sourceModules).some((path) => dirName(path) === props.name && path.endsWith('.vue'))
    ? 'vue'
    : 'react',
)

const sourceComponent = computed<unknown>(
  () =>
    Object.entries(sourceModules).find(
      ([path]) =>
        dirName(path) === props.name &&
        path.endsWith(framework.value === 'vue' ? '.vue' : '.tsx'),
    )?.[1].default,
)

const tag = computed(() => meta.value?.tag ?? '')

const propDefs = computed(() => Object.entries(meta.value?.props ?? {}))

const values = reactive<Record<string, string>>({})
const booleanValues = reactive<Record<string, boolean>>({})

function initValue(name: string, type: string, fallback: unknown): void {
  if (type === 'boolean') {
    if (!(name in booleanValues)) booleanValues[name] = Boolean(fallback)
    return
  }
  if (!(name in values)) values[name] = fallback === undefined ? '' : String(fallback)
}

const propsData = computed<Record<string, unknown>>(() => {
  const result: Record<string, unknown> = {}
  for (const [name, def] of propDefs.value) {
    if (def.type === 'boolean') result[name] = booleanValues[name]
    else if (def.type === 'number') result[name] = Number(values[name] || 0)
    else result[name] = values[name]
  }
  return result
})

watch(
  propDefs,
  (defs) => {
    for (const [name, def] of defs) initValue(name, def.type, def.default)
  },
  { immediate: true },
)

// Vue 给自定义元素打 v-bind 时，只要该 key 在元素上是已定义的属性，就走 property 通道而不是
// attribute 通道 —— 而桥接层给每个声明过的 prop 都装了 accessor。所以这里必须传**已定型**的值：
// 传字符串会原样落进组件（`count` 变成 `'7'`，Vue 报 prop 类型警告），传 `''` 表示布尔为真更是
// 直接失效（Vue 的 Boolean prop 转换把 `''` 一律当 false）。
const wcProps = computed<Record<string, unknown>>(() => {
  const result: Record<string, unknown> = {}
  for (const [name, def] of propDefs.value) {
    if (def.type === 'boolean') result[name] = booleanValues[name]
    else if (def.type === 'number') result[name] = Number(values[name] || 0)
    else result[name] = values[name]
  }
  return result
})

const events = ref<Array<{ name: string; detail: unknown; at: string }>>([])

function handleEvent(name: string, detail: unknown): void {
  events.value.unshift({ name, detail, at: new Date().toLocaleTimeString() })
  events.value = events.value.slice(0, 20)
}

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

        <div :key="mode">
          <template v-if="mode === 'source'">
            <VueMount
              v-if="framework === 'vue'"
              :name="name"
              :component="sourceComponent as never"
              :props-data="propsData"
              :on-event="handleEvent"
            />
            <ReactMount
              v-else
              :name="name"
              :component="sourceComponent as never"
              :props-data="propsData"
              :on-event="handleEvent"
            />
          </template>

          <component
            :is="tag"
            v-else
            v-bind="wcProps"
            @ew-select="handleEvent('select', ($event as CustomEvent).detail)"
          />
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
.panel {
  margin-bottom: 20px;
  padding: 16px;
  border: 1px solid var(--ew-color-border);
  border-radius: var(--ew-radius-md);
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
  border: 1px solid var(--ew-color-border);
  background: var(--ew-color-bg);
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
  background: var(--ew-color-primary);
  border-color: var(--ew-color-primary);
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
  color: var(--ew-color-text-secondary);
}
.empty {
  color: var(--ew-color-text-secondary);
  font-size: var(--ew-font-size-sm);
}
ul {
  margin: 0;
  padding-left: 18px;
  font-size: var(--ew-font-size-sm);
}
</style>
