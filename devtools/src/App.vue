<script setup lang="ts">
import { computed } from 'vue'
import { componentByName, components } from '@devtools/component-index'
import { useEventLog, usePropControls } from '@devtools/preview-state'
import AuthPanel from './AuthPanel.vue'
import ComponentPicker from './ComponentPicker.vue'
import DebugStage from './DebugStage.vue'
import EventLog from './EventLog.vue'
import PropPanel from './PropPanel.vue'
import { usePersisted } from './use-persisted'

const pickerOpen = usePersisted('pickerOpen', true)
const panelOpen = usePersisted('panelOpen', true)

const selected = usePersisted('component', components[0]?.name ?? '')
// 存下来的组件名可能已经被删掉，落回第一个 —— 否则打开就是一片空白
if (!componentByName(selected.value)) selected.value = components[0]?.name ?? ''

const entry = computed(() => componentByName(selected.value))
const meta = computed(() => entry.value?.meta)

// 属性值由 App 持有：主区要渲染它们、右栏要编辑它们，必须是同一份
const { propDefs, values, booleanValues, model } = usePropControls(meta)
const { wcHandlers } = useEventLog(computed(() => meta.value?.events))
</script>

<template>
  <div class="app">
    <!-- 收起就是卸载：侧栏不留占位，舞台当场吃满。开关在舞台头部（见 DebugStage） -->
    <ComponentPicker v-if="pickerOpen" v-model="selected" />
    <DebugStage
      v-model:picker-open="pickerOpen"
      v-model:panel-open="panelOpen"
      :entry="entry"
      :model="model"
      :wc-handlers="wcHandlers"
    />
    <aside v-if="panelOpen" class="side">
      <AuthPanel />
      <PropPanel :prop-defs="propDefs" :values="values" :boolean-values="booleanValues" />
      <EventLog />
    </aside>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  height: 100dvh;
}
.side {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 16px;
  width: 280px;
  padding: 16px;
  overflow: auto;
  border-left: 1px solid var(--ew-color-border);
  background: var(--ew-color-bg);
}
</style>
