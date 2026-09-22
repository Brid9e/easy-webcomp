<script setup lang="ts">
import { computed } from 'vue'
import { useVueEmit } from '@ew/runtime'

const props = defineProps<{
  name?: string
  count?: number
  autoLoad?: boolean
}>()

const emit = useVueEmit()

const label = computed(() => `Vue 组件：${props.name ?? 'World'} × ${props.count ?? 0}`)

function handleClick(): void {
  emit('select', { source: 'hello-vue', name: props.name ?? 'World' })
}
</script>

<template>
  <button class="ew-hello" type="button" @click="handleClick">{{ label }}</button>
</template>
