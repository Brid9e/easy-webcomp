<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  AUTH_METHODS,
  AUTH_METHOD_KEYS,
  DEFAULT_SECRET,
  probeAuthMethod,
  type AuthMethodKey,
} from '@ew/auth'
import { configure, getConfig } from '@ew/runtime/config'
import { usePersisted } from './use-persisted'

// 初值优先取全局槽：config.local.ts 里可能写了 auth，面板要显示的就是组件实际在用的那份。
// 显示一套、实际用另一套的话，面板说「解得开」而请求 401，比没有面板更坏。
// 本机在面板上改过的值存在 localStorage，优先于文件 —— 文件是起点，面板是本机当前选择。
const configured = getConfig().auth

const method = usePersisted<AuthMethodKey>(
  'authMethod',
  AUTH_METHOD_KEYS.find((key) => key === configured?.method) ?? 'SELF_MONITOR_TOKEN',
)
// 存下来的 KEY 可能已经从注册表里删掉，落回默认 —— 与 App.vue 处理组件名同一个理由
if (!AUTH_METHOD_KEYS.includes(method.value)) method.value = 'SELF_MONITOR_TOKEN'

const secret = usePersisted('authSecret', configured?.secret ?? DEFAULT_SECRET)

// 面板就是这个配置项的控件：选什么，组件下次请求就用什么（@ew/http 每个请求重新解析 auth，
// 不必重载）。只显示不写回的话，密钥贴对了也没用 —— 请求那头仍拿 DEFAULT_SECRET 去解。
watch([method, secret], () => configure({ auth: { method: method.value, secret: secret.value } }), {
  immediate: true,
})

// localStorage 可能在面板外被改（宿主页面本身，或另一个标签页），选完方式不是终点
const nonce = ref(0)

const REASONS = {
  'no-storage-key': '没找到以 -core-access 结尾的 localStorage key',
  'no-token': '找到了 key，但没解出 accessToken（密钥不对？）',
  error: '解析过程抛异常',
} as const

const result = computed(() => {
  void nonce.value
  const probe = probeAuthMethod(method.value, { secret: secret.value })
  if (probe.status === 'resolved') return { ok: true, text: probe.token ?? '' }
  const why =
    probe.status === 'error' ? `${REASONS.error}：${String(probe.error)}` : REASONS[probe.status]
  return { ok: false, text: probe.storageKey ? `${why}（${probe.storageKey}）` : why }
})
</script>

<template>
  <section class="panel">
    <h2>鉴权</h2>

    <label class="field">
      <span>解析方式</span>
      <select v-model="method">
        <option v-for="key in AUTH_METHOD_KEYS" :key="key" :value="key">
          {{ AUTH_METHODS[key].label }}
        </option>
      </select>
    </label>

    <label class="field">
      <span>密钥</span>
      <input v-model="secret" type="text" />
    </label>
    <p class="hint">需与宿主的 VITE_APP_STORE_SECURE_KEY 一致</p>

    <button type="button" class="probe" @click="nonce++">重新解析</button>

    <p class="result" :class="{ ok: result.ok }">{{ result.text }}</p>
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
.field select,
.field input {
  flex: 1;
  min-width: 0;
  padding: 2px 4px;
  border: 1px solid var(--ew-color-border);
  border-radius: var(--ew-radius-sm);
  background: var(--ew-color-bg);
  color: var(--ew-color-text);
  font: inherit;
}
.hint {
  margin: 0 0 8px;
  color: var(--ew-color-text-secondary);
  font-size: var(--ew-font-size-sm);
}
.probe {
  padding: 4px 10px;
  border: 1px solid var(--ew-color-border);
  border-radius: var(--ew-radius-sm);
  background: var(--ew-color-bg);
  color: var(--ew-color-text);
  font-size: var(--ew-font-size-sm);
}
.result {
  margin: 8px 0 0;
  color: var(--ew-color-text-secondary);
  font-size: var(--ew-font-size-sm);
  overflow-wrap: anywhere;
}
.result.ok {
  color: var(--ew-color-text);
  font-family: monospace;
}
</style>
