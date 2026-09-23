<script setup lang="ts">
import { computed, ref } from 'vue'
import { toIdentifier } from '@ew/utils'
import { componentTag } from './component-tag'

const props = defineProps<{ name: string }>()

// aria-label 写与标题一致的标识符（`my-list` → `MyList`），读屏念出来才跟页面对得上
const label = computed(() => toIdentifier(props.name))

const copied = ref(false)
let resetTimer: ReturnType<typeof setTimeout> | undefined

/**
 * 优先 Clipboard API —— 它要求安全上下文（https 或 localhost），文档站若跑在内网 http 上就没有
 * navigator.clipboard，回落 execCommand 兜住；两条都不成，按钮就只当作没反应，不假装复制成功。
 */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 权限被拒，继续走回落
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  const ok = document.execCommand('copy')
  area.remove()
  return ok
}

/** 复制的是标签本身（`<ew-my-list />`）—— 使用者要的是能直接粘进页面的那一行 */
async function copyTag(): Promise<void> {
  const tag = componentTag(props.name)
  if (!tag || !(await writeClipboard(`<${tag} />`))) return
  copied.value = true
  clearTimeout(resetTimer)
  resetTimer = setTimeout(() => (copied.value = false), 1500)
}
</script>

<template>
  <button
    type="button"
    class="copy"
    :aria-label="copied ? '已复制' : `复制 ${label} 的标签`"
    @click="copyTag"
  >
    <svg v-if="copied" class="copy-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2.5 8.5l3.5 3.5 7-8"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
    <svg v-else class="copy-icon" viewBox="0 0 16 16" aria-hidden="true">
      <rect
        x="5.5"
        y="5.5"
        width="9"
        height="9"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.4"
      />
      <path
        d="M10.5 3.5h-7A1.5 1.5 0 0 0 2 5v7"
        fill="none"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="round"
      />
    </svg>
  </button>
</template>

<style scoped>
/* 不要边框不要底色：它是标题行里的一个小附件，画成按钮会跟旁边的依赖标签抢注意力。
   relative + z-index 是给卡片用的 —— 那里整卡可点靠 .name::after 铺覆盖层，按钮得压在它上面，
   否则鼠标到不了；详情页没有覆盖层，多这两句无副作用。 */
.copy {
  position: relative;
  z-index: 1;
  display: flex;
  flex: none;
  padding: 1px;
  border: none;
  background: transparent;
  color: var(--vp-c-text-3);
  cursor: pointer;
  transition: color 0.2s;
}

.copy:hover {
  color: var(--vp-c-brand-1);
}

/* 默认尺寸贴卡片的标题（lg 字号）；详情页标题是 h1，那里再放大（见 ComponentHeader） */
.copy-icon {
  width: 13px;
  height: 13px;
}
</style>
