# 鉴权解析方式实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「从宿主 localStorage 里按某种方式取出 token」收敛成按大写 KEY 选择的注册表，落地成新包 `@ew/auth`，并在调试页右栏给一个切换方式、看解析结果的面板。

**Architecture:** `packages/auth` 是源码包（无构建步骤，与 `@ew/utils` 同形）。内部三层的依赖方向严格单向：`secure-ls.ts`（通用加解密，不认任何宿主）← `resolvers.ts`（各宿主方言的实现，返回带原因的探测结果）← `registry.ts`（KEY → 方式清单）。调试页只消费 `registry` 与 `DEFAULT_SECRET`。

**Tech Stack:** TypeScript、Vitest + jsdom、Vue 3、Playwright、crypto-js、lz-string。

**设计文档：** `docs/superpowers/specs/2026-09-24-ew-auth-resolution-design.md`

**本次不做：** 不接 `my-list/api.ts` 的请求拦截器；不做运行时注册 API；文档站不引这个包。

---

### Task 1: `packages/auth` 包骨架与接线

纯管道，没有可写的测试 —— 这一步只是让 `@ew/auth` 这个词能被解析到。

**Files:**
- Create: `packages/auth/package.json`
- Modify: `package.json:53-56`（`devDependencies` 里 `@ew/runtime` 之前插一行）

- [ ] **Step 1: 建包清单**

`packages/auth/package.json`：

```json
{
  "name": "@ew/auth",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "sideEffects": false,
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "dependencies": {
    "crypto-js": "^4.2.0",
    "lz-string": "^1.5.0"
  },
  "devDependencies": {
    "@types/crypto-js": "^4.2.2"
  }
}
```

形状照抄 `packages/utils/package.json` 与 `packages/runtime/package.json` 的公共部分：`private` + `type: module` + `sideEffects: false` + `types`/`exports` 直指 `./src/index.ts`。**不要加 `scripts`** —— 它跟 utils/runtime 一样不打产物，消费者自己打包源码。

`lz-string@1.5.0` 自带 `typings/lz-string.d.ts`，不需要 `@types/lz-string`。

- [ ] **Step 2: 让这个词可解析**

根 `package.json` 的 `devDependencies` 里，`"@ew/runtime"` 之前插入：

```json
    "@ew/auth": "workspace:*",
```

devtools 自己没有 `package.json`，靠根 `node_modules` 下那个符号链接解析 `@ew/*` —— `devtools/shared/wc-mode.ts:4` 引 `@ew/utils` 走的就是这条路。

- [ ] **Step 3: 装**

```bash
pnpm install
```

预期：装上 `crypto-js@4.2.0`、`lz-string@1.5.0`、`@types/crypto-js@4.2.2`，并建立链接。

- [ ] **Step 4: 确认链接与依赖就位**

```bash
ls -l node_modules/@ew/auth && ls packages/auth/node_modules
```

预期：`node_modules/@ew/auth` 是指向 `packages/auth` 的符号链接（`-> ../../packages/auth`）；`packages/auth/node_modules` 下能看到 `crypto-js` 与 `lz-string`。

- [ ] **Step 5: 确认没有打破既有门禁**

```bash
pnpm run typecheck
```

预期：PASS。`scripts/` 下的构建与守卫枚举的都是 `packages/workspaces/*`（`scripts/build.ts:39`、`scripts/check-artifacts.ts:52`、`scripts/icons.ts:24`），不是 `packages/*`，所以这一步除了多一个空包之外不该有任何变化。

- [ ] **Step 6: 提交**

```bash
git add packages/auth/package.json package.json pnpm-lock.yaml
git commit -m "feat(auth): 新包 @ew/auth 骨架与依赖接线"
```

---

### Task 2: `secure-ls.ts` —— 通用无状态解密

**Files:**
- Create: `tests/auth/secure-ls.test.ts`
- Create: `packages/auth/src/secure-ls.ts`
- Create: `packages/auth/src/index.ts`

- [ ] **Step 1: 写失败的测试**

`tests/auth/secure-ls.test.ts`：

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SECRET, decrypt, encrypt, getDecryptedStorageItem } from '@ew/auth'

describe('decrypt / encrypt', () => {
  it('加密再解密回到原对象', () => {
    const data = { accessToken: 'tok-1', expires: 123 }
    expect(decrypt(encrypt(data))).toEqual(data)
  })

  it('明文 JSON 直接读，不走解密', () => {
    // 开发环境下主系统存的就是明文 JSON
    expect(decrypt('{"accessToken":"plain"}')).toEqual({ accessToken: 'plain' })
    expect(decrypt('[1,2]')).toEqual([1, 2])
  })

  it('空值一律 null，不抛', () => {
    expect(decrypt(null)).toBeNull()
    expect(decrypt(undefined)).toBeNull()
    expect(decrypt('')).toBeNull()
    expect(decrypt('   ')).toBeNull()
  })

  it('解不出来的垃圾串返回 null，不抛', () => {
    expect(decrypt('not-encrypted-at-all')).toBeNull()
  })

  it('换了密钥解不出来，返回 null', () => {
    const cipher = encrypt({ accessToken: 'tok-1' }, 'secret-a')
    expect(decrypt(cipher, 'secret-b')).toBeNull()
  })

  it('DEFAULT_SECRET 是那个待替换的占位值', () => {
    // 它必须与宿主的 VITE_APP_STORE_SECURE_KEY 一致才有意义，改它就是破坏性的
    expect(DEFAULT_SECRET).toBe('please-replace-me-with-your-own-key')
  })
})

describe('getDecryptedStorageItem', () => {
  beforeEach(() => localStorage.clear())

  it('读得到就解密，读不到就 null', () => {
    localStorage.setItem('demo-core-access', encrypt({ accessToken: 'tok-9' }))
    expect(getDecryptedStorageItem('demo-core-access')).toEqual({ accessToken: 'tok-9' })
    expect(getDecryptedStorageItem('nope-core-access')).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm run test -- tests/auth/secure-ls.test.ts
```

预期：FAIL —— 解析不到 `@ew/auth`（`packages/auth/src/index.ts` 还不存在）。

- [ ] **Step 3: 实现**

`packages/auth/src/secure-ls.ts`：

```ts
import CryptoJS from 'crypto-js'
import { compressToUTF16, decompressFromUTF16 } from 'lz-string'

/**
 * 主系统用 SecureLS 持久化的数据，这里用 CryptoJS + LZString 手动做无状态解密。
 *
 * 官方 secure-ls 在解密前会校验元数据，而主系统在生产环境下可能根本没把元数据写进去 ——
 * 于是官方库会拒绝解密缺失元数据的 key。绕开这层校验，任何环境都能解出来。
 */
export const DEFAULT_SECRET = 'please-replace-me-with-your-own-key'

export function decrypt(
  encryptedData: string | null | undefined,
  secret: string = DEFAULT_SECRET,
): unknown {
  if (!encryptedData) return null
  // compressToUTF16 的产物结尾带一个空格（LZString 自己的约定），_decompress 不消费它，
  // 所以这里的 trim 不会破坏密文；它服务的是「从控制台拷 base64 过来」那条手工路径。
  const trimmed = encryptedData.trim()
  // 1. 优先检测是否为明文 JSON（开发环境下主系统存的是明文 JSON 字符串）
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed)
    } catch {
      /* 解析失败则继续走解密流程 */
    }
  }
  try {
    // 2. LZString 解压缩
    const decompressed = decompressFromUTF16(trimmed)
    if (!decompressed) return JSON.parse(trimmed)
    // 3. AES 解密
    const bytes = CryptoJS.AES.decrypt(decompressed, secret)
    const decryptedStr = bytes.toString(CryptoJS.enc.Utf8)
    if (!decryptedStr) return JSON.parse(trimmed)
    // 4. 解析为 JSON 对象或原始值
    return JSON.parse(decryptedStr)
  } catch {
    try {
      return JSON.parse(trimmed)
    } catch {
      return null
    }
  }
}

export function getDecryptedStorageItem(key: string, secret: string = DEFAULT_SECRET): unknown {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return decrypt(raw, secret)
  } catch (error) {
    console.error(`[getDecryptedStorageItem] 读取并解密 key "${key}" 失败：`, error)
    return null
  }
}

export function encrypt(data: unknown, secret: string = DEFAULT_SECRET): string {
  try {
    const jsonStr = JSON.stringify(data)
    const encrypted = CryptoJS.AES.encrypt(jsonStr, secret).toString()
    return compressToUTF16(encrypted)
  } catch (error) {
    console.error('[encrypt] 加密失败：', error)
    return ''
  }
}
```

> **两处与原代码不同，都是有意的。** ① import 写成具名 `{ compressToUTF16, decompressFromUTF16 }`：`lz-string@1.5.0` 的 `typings/lz-string.d.ts` 只有具名导出、没有 `export default`，默认导入过不了 `typecheck`。② 原 JS 里的 `catch (_)` 改成可选绑定 `catch`，避开 `noUnusedLocals`；两个 `console.error` 保留，本仓库没有 eslint，不需要那两行 `eslint-disable` 头注释。

`packages/auth/src/index.ts`：

```ts
export { DEFAULT_SECRET, decrypt, encrypt, getDecryptedStorageItem } from './secure-ls'
```

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm run test -- tests/auth/secure-ls.test.ts && pnpm run typecheck
```

预期：PASS（6 条 + 1 条）。**如果「解不出来的垃圾串返回 null」这条红了**，说明 `LZString._decompress` 从那串垃圾里吐出了能被 `JSON.parse` 吃掉的内容 —— 换一段输入（例如 `'zzzz'`）去复现，不要放宽断言：返回 null 是这条 API 的契约。

- [ ] **Step 5: 提交**

```bash
git add packages/auth/src/secure-ls.ts packages/auth/src/index.ts tests/auth/secure-ls.test.ts
git commit -m "feat(auth): secure-ls 无状态解密的通用层"
```

---

### Task 3: `resolvers.ts` —— self-monitor 方言与探测三态

**Files:**
- Create: `tests/auth/resolvers.test.ts`
- Create: `packages/auth/src/resolvers.ts`
- Modify: `packages/auth/src/index.ts`

- [ ] **Step 1: 写失败的测试**

`tests/auth/resolvers.test.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { encrypt, probeAuthMethod } from '@ew/auth'

// 主系统的 key 前缀带版本号，所以实现是扫后缀 —— 这条用真实前缀，防实现退化成写死全名
const KEY = 'self-monitor-sys-5.7.0-prod-core-access'

describe('SELF_MONITOR_TOKEN 探测', () => {
  beforeEach(() => localStorage.clear())

  it('没扫到 -core-access 结尾的 key：no-storage-key', () => {
    localStorage.setItem('unrelated', 'x')
    const probe = probeAuthMethod('SELF_MONITOR_TOKEN')
    expect(probe.status).toBe('no-storage-key')
    expect(probe.token).toBeNull()
    expect(probe.storageKey).toBeNull()
  })

  it('扫到了但没解出 accessToken：no-token，并带上命中的 key', () => {
    localStorage.setItem(KEY, encrypt({ user: 'someone' }))
    const probe = probeAuthMethod('SELF_MONITOR_TOKEN')
    expect(probe.status).toBe('no-token')
    expect(probe.storageKey).toBe(KEY)
  })

  it('密钥不对：no-token 而不是抛出', () => {
    localStorage.setItem(KEY, encrypt({ accessToken: 'tok-1' }, 'right-secret'))
    const probe = probeAuthMethod('SELF_MONITOR_TOKEN', { secret: 'wrong-secret' })
    expect(probe.status).toBe('no-token')
    expect(probe.token).toBeNull()
  })

  it('正常解出：resolved + 裸 token', () => {
    localStorage.setItem(KEY, encrypt({ accessToken: 'tok-42' }, 'my-secret'))
    const probe = probeAuthMethod('SELF_MONITOR_TOKEN', { secret: 'my-secret' })
    expect(probe.status).toBe('resolved')
    expect(probe.token).toBe('tok-42')
    expect(probe.storageKey).toBe(KEY)
  })

  it('解出来是字符串也要再解析一次（主系统两种存法都有）', () => {
    localStorage.setItem(KEY, encrypt(JSON.stringify({ accessToken: 'tok-str' })))
    expect(probeAuthMethod('SELF_MONITOR_TOKEN').token).toBe('tok-str')
  })

  it('开发环境的明文 JSON 也能解出', () => {
    localStorage.setItem(KEY, JSON.stringify({ accessToken: 'tok-plain' }))
    expect(probeAuthMethod('SELF_MONITOR_TOKEN').token).toBe('tok-plain')
  })

  it('读取过程抛异常：error', () => {
    localStorage.setItem(KEY, 'x')
    // findStorageKey 走的是 localStorage.key(i)，把它打瘸来走 error 分支
    const spy = vi.spyOn(Storage.prototype, 'key').mockImplementation(() => {
      throw new Error('boom')
    })
    try {
      const probe = probeAuthMethod('SELF_MONITOR_TOKEN')
      expect(probe.status).toBe('error')
      expect(probe.token).toBeNull()
    } finally {
      spy.mockRestore()
    }
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm run test -- tests/auth/resolvers.test.ts
```

预期：FAIL —— `probeAuthMethod` 尚未导出。

- [ ] **Step 3: 实现**

`packages/auth/src/resolvers.ts`：

```ts
import { getDecryptedStorageItem } from './secure-ls'

/**
 * 一次解析的结果。比裸 token 多带一份原因 —— 调试页读的是自己 origin 的 localStorage，
 * 宿主那套数据默认不在，「解不出来」是常态，只给 null 等于什么都没说。
 */
export type AuthProbe = {
  status: 'resolved' | 'no-storage-key' | 'no-token' | 'error'
  token: string | null
  /** 命中的那个 localStorage key。no-storage-key 时为 null，其余情况指向实际读的那个。 */
  storageKey: string | null
  error?: unknown
}

export type AuthResolverOptions = { secret?: string }
export type AuthResolver = (options?: AuthResolverOptions) => AuthProbe

/** 主系统的存储键约定：数据落在某个以它结尾的 key 下，但前缀里带版本号，写不死。 */
const STORE_KEY_SUFFIX = '-core-access'

export function findStorageKey(): string | null {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.endsWith(STORE_KEY_SUFFIX)) return key
  }
  return null
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** 主系统两种存法都有：解出来就是对象，或者是一层字符串要再解析一次。 */
function accessTokenOf(data: unknown): string | null {
  const parsed = typeof data === 'string' ? parseJson(data) : data
  if (!parsed || typeof parsed !== 'object' || !('accessToken' in parsed)) return null
  const token = (parsed as { accessToken?: unknown }).accessToken
  return typeof token === 'string' ? token : null
}

export const resolveSelfMonitorToken: AuthResolver = ({ secret } = {}) => {
  try {
    const storageKey = findStorageKey()
    if (!storageKey) return { status: 'no-storage-key', token: null, storageKey: null }
    const token = accessTokenOf(getDecryptedStorageItem(storageKey, secret))
    if (!token) return { status: 'no-token', token: null, storageKey }
    return { status: 'resolved', token, storageKey }
  } catch (error) {
    return { status: 'error', token: null, storageKey: null, error }
  }
}
```

> `error` 是可选字段，而本仓库开着 `exactOptionalPropertyTypes` —— 三个正常分支的返回对象里**不能**写 `error: undefined`，只有 `catch` 分支才带这个键。

`packages/auth/src/index.ts` 追加：

```ts
export type { AuthProbe, AuthResolver, AuthResolverOptions } from './resolvers'
```

> 只出类型，不出 `resolveSelfMonitorToken` 与 `findStorageKey` 两个函数 —— 它们由 `registry.ts`
> 直接 `import`，包外没人用。真要单独用一种方式，说明注册表没设计好，那时再加。

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm run test -- tests/auth/resolvers.test.ts && pnpm run typecheck
```

预期：PASS（7 条）。`pnpm run test` 不加文件名时会连 secure-ls 那 7 条一起跑，也该全绿。

- [ ] **Step 5: 提交**

```bash
git add packages/auth/src/resolvers.ts packages/auth/src/index.ts tests/auth/resolvers.test.ts
git commit -m "feat(auth): self-monitor token 方言与带原因的探测"
```

---

### Task 4: `registry.ts` —— 按 KEY 选方式

**Files:**
- Create: `tests/auth/registry.test.ts`
- Create: `packages/auth/src/registry.ts`
- Modify: `packages/auth/src/index.ts`

- [ ] **Step 1: 写失败的测试**

`tests/auth/registry.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { AUTH_METHODS, AUTH_METHOD_KEYS, resolveAuthToken } from '@ew/auth'

describe('AUTH_METHODS', () => {
  it('KEY 都是大写下划线 —— 以后加方式也得守这条', () => {
    for (const key of AUTH_METHOD_KEYS) expect(key).toMatch(/^[A-Z][A-Z0-9_]*$/)
  })

  it('每项都有非空 label 与可调用的 resolve', () => {
    for (const key of AUTH_METHOD_KEYS) {
      const method = AUTH_METHODS[key]
      expect(method.label.length).toBeGreaterThan(0)
      expect(typeof method.resolve).toBe('function')
    }
  })

  it('默认那一种在清单里', () => {
    expect(AUTH_METHOD_KEYS).toContain('SELF_MONITOR_TOKEN')
  })
})

describe('resolveAuthToken', () => {
  it('解析不出来时返回 null（调用方拿到的是裸 token，拼不拼 Bearer 是它的事）', () => {
    localStorage.clear()
    expect(resolveAuthToken('SELF_MONITOR_TOKEN')).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm run test -- tests/auth/registry.test.ts
```

预期：FAIL —— `AUTH_METHODS` 尚未导出。

- [ ] **Step 3: 实现**

`packages/auth/src/registry.ts`：

```ts
import { resolveSelfMonitorToken, type AuthProbe, type AuthResolver } from './resolvers'

/**
 * 按大写下划线的 KEY 选鉴权方式。KEY 是对外契约（宿主与组件按它挑），label 只服务界面文案。
 *
 * 不做 registerAuthMethod() 这类运行时注册：现在没有第二个来源。等真有宿主自带的方式要挂进来，
 * 那时才知道接口该长什么样。
 */
export const AUTH_METHODS = {
  SELF_MONITOR_TOKEN: {
    label: '自行监测系统 token 解析',
    resolve: resolveSelfMonitorToken,
  },
} as const satisfies Record<string, { label: string; resolve: AuthResolver }>

export type AuthMethodKey = keyof typeof AUTH_METHODS

/** 全 KEY 列表，顺序即清单顺序 —— 下拉与守卫都从这里取。 */
export const AUTH_METHOD_KEYS = Object.keys(AUTH_METHODS) as AuthMethodKey[]

export function probeAuthMethod(key: AuthMethodKey, options?: { secret?: string }): AuthProbe {
  return AUTH_METHODS[key].resolve(options)
}

/** 只要结果的那条路。与 probeAuthMethod 共用一个真相，失败即 null。 */
export function resolveAuthToken(key: AuthMethodKey, options?: { secret?: string }): string | null {
  return probeAuthMethod(key, options).token
}
```

`packages/auth/src/index.ts` 追加：

```ts
export { AUTH_METHODS, AUTH_METHOD_KEYS, probeAuthMethod, resolveAuthToken } from './registry'
export type { AuthMethodKey } from './registry'
```

**同时删掉 Task 3 留下的那段临时 shim**（`probeAuthMethod` 转发给 `resolveSelfMonitorToken`，带
`// 临时：Task 4 会用 registry.ts 里的真货替掉这段` 标记），连同它上面那行
`import { resolveSelfMonitorToken, type AuthProbe } from './resolvers'` —— `AuthProbe` 已由
`registry.ts` 再导出。不删就是重复导出的 `probeAuthMethod`，typecheck 当场红。

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm run test -- tests/auth/registry.test.ts && pnpm run typecheck
```

预期：PASS（4 条）。若 `as const satisfies` 在 `AUTH_METHODS[key].resolve(options)` 那行报「可能为 undefined」，说明 `AuthResolver` 没写全 —— 它是必填函数类型，`resolveSelfMonitorToken` 上标了 `: AuthResolver`，两处都得在。

- [ ] **Step 5: 提交**

```bash
git add packages/auth/src/registry.ts packages/auth/src/index.ts tests/auth/registry.test.ts
git commit -m "feat(auth): 按大写 KEY 选择的鉴权方式注册表"
```

---

### Task 5: 调试页右栏的鉴权面板

**Files:**
- Create: `devtools/src/AuthPanel.vue`
- Modify: `devtools/src/App.vue:6-9`（import）与 `:37-40`（aside 内容）

- [ ] **Step 1: 新建面板组件**

`devtools/src/AuthPanel.vue`：

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  AUTH_METHODS,
  AUTH_METHOD_KEYS,
  DEFAULT_SECRET,
  probeAuthMethod,
  type AuthMethodKey,
} from '@ew/auth'
import { usePersisted } from './use-persisted'

const method = usePersisted<AuthMethodKey>('authMethod', 'SELF_MONITOR_TOKEN')
// 存下来的 KEY 可能已经从注册表里删掉，落回默认 —— 与 App.vue 处理组件名同一个理由
if (!(method.value in AUTH_METHODS)) method.value = 'SELF_MONITOR_TOKEN'

const secret = usePersisted('authSecret', DEFAULT_SECRET)

// localStorage 可能在面板外被改（宿主页面本身，或另一个标签页），选完方式不是终点
const nonce = ref(0)

const REASONS = {
  'no-storage-key': '没找到以 -core-access 结尾的 localStorage key',
  'no-token': '找到了 key，但没解出 accessToken（密钥不对？）',
  error: '解析过程抛异常，看控制台',
} as const

const result = computed(() => {
  void nonce.value
  const probe = probeAuthMethod(method.value, { secret: secret.value })
  if (probe.status === 'resolved') return { ok: true, text: probe.token ?? '' }
  const why = REASONS[probe.status]
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
```

> 样式只用了 `src/tokens/tokens.css` 里确实有的 token（`--ew-color-*` / `--ew-radius-*` / `--ew-font-size-*` / `--ew-font-family`）。**没有 mono 的 token**，所以 token 那行直接写 `monospace`，别去引一个不存在的 `--ew-font-family-mono`。
>
> `REASONS` 必须声明在 `result` 之前 —— `computed` 的 getter 虽然是懒的，但按声明顺序放才不用去推 TDZ。

- [ ] **Step 2: 挂进右栏**

`devtools/src/App.vue` 的 import 块（按现有字母序，插在 `ComponentPicker` 之前）：

```ts
import AuthPanel from './AuthPanel.vue'
import ComponentPicker from './ComponentPicker.vue'
```

`<aside>` 里插在最前 —— 属性面板跟着当前组件走，鉴权是全局的：

```html
    <aside v-if="panelOpen" class="side">
      <AuthPanel />
      <PropPanel :prop-defs="propDefs" :values="values" :boolean-values="booleanValues" />
      <EventLog />
    </aside>
```

- [ ] **Step 3: 类型与构建过关**

```bash
pnpm run typecheck
```

预期：PASS。若 `<select v-model="method">` 报类型不匹配，检查 `usePersisted<AuthMethodKey>` 的显式类型参数还在 —— 少了它，fallback 的字面量会被推成 `string`。

- [ ] **Step 4: 提交**

```bash
git add devtools/src/AuthPanel.vue devtools/src/App.vue
git commit -m "feat(devtools): 右栏鉴权面板（方式下拉 + 密钥 + 解析结果）"
```

---

### Task 6: e2e —— 面板真的在、默认项对、失败要说清原因

**Files:**
- Modify: `tests/e2e/debug-page.spec.ts`（文件末尾追加）

- [ ] **Step 1: 写测试**

在 `tests/e2e/debug-page.spec.ts` 末尾追加：

```ts
test('调试页：右栏鉴权面板默认选「自行监测系统 token 解析」，失败给原因', async ({ page }) => {
  await page.goto(DEBUG_URL)

  const panel = page.locator('aside.side .panel', { hasText: '鉴权' })
  await expect(panel.locator('select')).toHaveValue('SELF_MONITOR_TOKEN')
  await expect(panel.locator('option')).toHaveText(['自行监测系统 token 解析'])

  // 调试页读的是自己 origin 的 localStorage，宿主那套数据默认不在 ——
  // 这条把「失败也要说清是哪种失败」钉住，别退化成只显示一个空结果
  await expect(panel.locator('.result')).toContainText(
    '没找到以 -core-access 结尾的 localStorage key',
  )
})
```

> 这条用例沿用文件顶部那句 `test.use({ viewport: { width: 1440, height: 900 } })`，**不要**为它另开 `test.use`，也不要改那个值 —— 拖拽那三条靠它。

- [ ] **Step 2: 跑测试**

```bash
pnpm run test:e2e -- tests/e2e/debug-page.spec.ts
```

预期：5 条全 PASS（原 4 条 + 新的 1 条）。playwright.config.ts 会自己拉起 5274 那台 dev server（`reuseExistingServer: false`），不需要手工先跑 `pnpm dev`。

- [ ] **Step 3: 提交**

```bash
git add tests/e2e/debug-page.spec.ts
git commit -m "test(e2e): 调试页鉴权面板默认方式与失败原因"
```

---

### Task 7: 全量验证

- [ ] **Step 1: 跑到 docs:build 之前的五段**

```bash
pnpm run typecheck && pnpm run test && pnpm run build && pnpm run check:artifacts && pnpm run check:framework
```

预期：全绿。本次没碰任何组件与产物路径，`check:artifacts` 与体积基线都该纹丝不动。

- [ ] **Step 2: 单独跑 e2e**

```bash
pnpm run test:e2e
```

预期：全绿。

- [ ] **Step 3: 知道 `pnpm run verify` 会在哪停**

`pnpm run verify` 这条链**跑不到底**，会停在 `docs:build`：

```
The requested module 'lodash' does not provide an export named 'throttle'
  packages/workspaces/self-monitor/components/my-list/Component.vue:30
```

这是 `80e35da` 起就有的既有问题（`import { throttle } from 'lodash'`，lodash 的 CJS 产物给不出具名导出），**与本次改动无关**，用户已经明确决定先不动。所以验证以 Step 1 + Step 2 为准，不要为了让 verify 变绿去改那个导入。

---

## 人工验证（交给用户）

1. `pnpm dev`，打开 http://localhost:5273/ 。
2. 右栏顶部应多出「鉴权」面板，方式下拉默认是「自行监测系统 token 解析」，结果区写着
   「没找到以 -core-access 结尾的 localStorage key」—— 这是对的，调试页的 origin 里本来就没有宿主数据。
3. 在调试页控制台按注释里那两步把自己的 token 塞进 localStorage（导出 Base64 → 用 `atob` 还原后
   `localStorage.setItem('xxx-core-access', ...)`），点「重新解析」，结果区应显示 token。
4. 把密钥改成一个错的，再点「重新解析」，应变成「找到了 key，但没解出 accessToken」——
   证明失败原因是分得开的，不是笼统一个空。

## 不做的事

- 不接 `my-list/api.ts` 的请求拦截器（设计文档「交付边界」）。
- 不做运行时 `registerAuthMethod()`。
- 面板里不放出「读哪个 storage key」的输入框；命中的 key 只在结果区显示。
- 不为密钥输入框做加密存储 —— 它明文躺在 `ew-debug:` 前缀的 localStorage 里，这是调试页的语境。
- 文档站不引 `@ew/auth`，`docs/.vitepress/config.mts` 不动。
