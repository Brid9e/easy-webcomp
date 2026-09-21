<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import ReactMount from './renderers/ReactMount.vue'
import VueMount from './renderers/VueMount.vue'

interface Entry {
  name: string
  tag: string
  sourceComponent: unknown
  framework: 'vue' | 'react'
}

const props = defineProps<{ entry: Entry }>()

const metaModules = import.meta.glob('../src/components/*/meta.ts', { eager: true }) as Record<
  string,
  {
    default: {
      tag: string
      props?: Record<string, { type: string; default?: unknown }>
    }
  }
>

const meta = computed(() => metaModules[`../src/components/${props.entry.name}/meta.ts`]?.default)

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

const events = ref<Array<{ name: string; detail: unknown; at: string }>>([])

function handleEvent(name: string, detail: unknown): void {
  events.value.unshift({ name, detail, at: new Date().toLocaleTimeString() })
  events.value = events.value.slice(0, 20)
}

const mode = ref<'source' | 'wc'>('source')

const wcAttributes = computed<Record<string, unknown>>(() => {
  const result: Record<string, unknown> = {}
  for (const [name, def] of propDefs.value) {
    const attr = name.replace(/([A-Z])/g, '-$1').toLowerCase()
    if (def.type === 'boolean') {
      if (booleanValues[name]) result[attr] = ''
    } else if (def.type === 'string' || def.type === 'number') {
      result[attr] = values[name]
    }
  }
  return result
})

async function enableWc(): Promise<void> {
  const modules = (await import('virtual:ctc-wc-index')) as {
    default: Record<string, { Element: CustomElementConstructor }>
  }
  const mod = modules.default[props.entry.name]
  if (!mod) {
    console.warn(`[playground] 未找到 ${props.entry.name} 的虚拟模块`)
    return
  }
  const tag = props.entry.tag
  if (!customElements.get(tag)) {
    customElements.define(tag, mod.Element)
  }
}

watch(mode, (next) => {
  if (next === 'wc') void enableWc()
})
</script>

<template>
  <section>
    <h2>{{ entry.name }}</h2>
    <p class="tag">&lt;{{ entry.tag }}&gt; · {{ entry.framework }}</p>

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
          <button
            type="button"
            :class="{ active: mode === 'source' }"
            @click="mode = 'source'"
          >
            源码模式
          </button>
          <button type="button" :class="{ active: mode === 'wc' }" @click="mode = 'wc'">
            WC 模式
          </button>
        </div>
      </div>

      <div :key="mode">
        <template v-if="mode === 'source'">
          <VueMount
            v-if="entry.framework === 'vue'"
            :name="entry.name"
            :component="entry.sourceComponent as never"
            :props-data="propsData"
            :on-event="handleEvent"
          />
          <ReactMount
            v-else
            :name="entry.name"
            :component="entry.sourceComponent as never"
            :props-data="propsData"
            :on-event="handleEvent"
          />
        </template>

        <component
          :is="entry.tag"
          v-else
          v-bind="wcAttributes"
          @ctc-select="handleEvent('select', ($event as CustomEvent).detail)"
        />
      </div>
    </div>

    <div class="panel">
      <h3>事件日志</h3>
      <p v-if="events.length === 0" class="empty">点击组件试试</p>
      <ul v-else>
        <li v-for="(e, i) in events" :key="i">
          <code>ctc-{{ e.name }}</code> · {{ e.at }} · {{ JSON.stringify(e.detail) }}
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.tag {
  color: var(--ctc-color-text-secondary);
  font-size: var(--ctc-font-size-sm);
}
.panel {
  margin-bottom: 20px;
  padding: 16px;
  border: 1px solid var(--ctc-color-border);
  border-radius: var(--ctc-radius-md);
}
.panel h3 {
  margin: 0 0 12px;
  font-size: var(--ctc-font-size-md);
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
  border: 1px solid var(--ctc-color-border);
  background: #fff;
  font: inherit;
  font-size: var(--ctc-font-size-sm);
  cursor: pointer;
}
.mode-switch button:first-child {
  border-radius: var(--ctc-radius-sm) 0 0 var(--ctc-radius-sm);
}
.mode-switch button:last-child {
  border-left: none;
  border-radius: 0 var(--ctc-radius-sm) var(--ctc-radius-sm) 0;
}
.mode-switch button.active {
  background: var(--ctc-color-primary);
  border-color: var(--ctc-color-primary);
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
  color: var(--ctc-color-text-secondary);
}
.empty {
  color: var(--ctc-color-text-secondary);
  font-size: var(--ctc-font-size-sm);
}
ul {
  margin: 0;
  padding-left: 18px;
  font-size: var(--ctc-font-size-sm);
}
</style>
