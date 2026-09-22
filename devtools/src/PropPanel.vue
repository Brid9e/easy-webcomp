<script setup lang="ts">
import type { PropDefinition } from '@ew/runtime'

defineProps<{
  propDefs: Array<[string, PropDefinition]>
  values: Record<string, string>
  booleanValues: Record<string, boolean>
}>()
</script>

<template>
  <section class="panel">
    <h2>属性</h2>

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
  </section>
</template>

<style scoped>
.panel h2 {
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
  color: var(--ew-color-text-secondary);
}
.empty {
  margin: 0;
  color: var(--ew-color-text-secondary);
  font-size: var(--ew-font-size-sm);
}
</style>
