import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Option } from '@clack/prompts'
import { toIdentifier } from '@ew/utils'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const NAME_RE = /^[a-z][a-z0-9-]*$/

export type Framework = 'vue' | 'react'

export type AddonKey =
  | 'pinia'
  | 'axios'
  | 'element-plus'
  | 'ant-design-vue'
  | 'antd'
  | 'tailwind'

export interface ComponentSpec {
  workspace: string
  name: string
  framework: Framework
  addons: AddonKey[]
}

export interface CreateResult {
  dir: string
  dependencies: string[]
  devDependencies: string[]
}

interface AddonDef {
  label: string
  frameworks: Framework[]
  dependencies: string[]
  devDependencies: string[]
  /** 生成到组件目录里的附加文件 */
  files?: (spec: ComponentSpec) => Record<string, string>
  /**
   * 有值即为 UI 库：会关掉 shadow，并把这份 CSS 内联进去。见下方 UI_SHADOW_NOTE。
   */
  cssEntry?: string
}

/**
 * 关掉 Shadow DOM 是 UI 库逼的，不是偷懒：Element Plus 把主题变量定义在 `:root` 上，
 * shadow root 里 `:root` 不匹配任何元素；它的 Select / DatePicker / Tooltip / Modal 又
 * Teleport 到 `document.body`，落在 shadow 外面。antd 与 Ant Design Vue v4 是 CSS-in-JS，
 * 样式注入 `document.head`，而文档级样式表管不到 shadow DOM 内容。三条路都堵死，
 * 只能让这类组件回到 light DOM —— 代价是它自己的样式也不再隔离。
 */
const UI_SHADOW_NOTE = `  // 关掉 Shadow DOM 是 UI 库逼的：Element Plus 的主题变量在 :root 上、浮层 Teleport 到
  // document.body，antd / Ant Design Vue 的样式运行时注入 document.head —— 都够不到 shadow
  // root 里面。代价是本组件样式不再隔离，会落到 document.head 影响整页。
`

export const ADDONS: Record<AddonKey, AddonDef> = {
  pinia: {
    label: 'Pinia 状态管理',
    frameworks: ['vue'],
    dependencies: ['pinia'],
    devDependencies: [],
    files: (spec) => ({ 'store.ts': storeTemplate(spec) }),
  },
  axios: {
    label: 'axios 请求层（含拦截器）',
    frameworks: ['vue', 'react'],
    dependencies: ['axios'],
    devDependencies: [],
    files: () => ({ 'api.ts': apiTemplate() }),
  },
  'element-plus': {
    label: 'Element Plus',
    frameworks: ['vue'],
    dependencies: ['element-plus'],
    devDependencies: [],
    cssEntry: 'element-plus/dist/index.css',
  },
  'ant-design-vue': {
    label: 'Ant Design Vue',
    frameworks: ['vue'],
    dependencies: ['ant-design-vue'],
    devDependencies: [],
    cssEntry: 'ant-design-vue/dist/reset.css',
  },
  antd: {
    label: 'Ant Design (React)',
    frameworks: ['react'],
    dependencies: ['antd'],
    devDependencies: [],
    cssEntry: 'antd/dist/reset.css',
  },
  tailwind: {
    label: 'Tailwind CSS',
    frameworks: ['vue', 'react'],
    dependencies: [],
    devDependencies: ['tailwindcss', '@tailwindcss/vite'],
  },
}

function assertName(name: string): void {
  if (!NAME_RE.test(name)) {
    throw new Error(
      `[new:component] 组件名不合法："${name}"。只允许小写字母、数字与连字符，且以字母开头`,
    )
  }
}

function assertWorkspace(targetRoot: string, workspace: string): void {
  if (!existsSync(join(targetRoot, 'src/workspaces', workspace, 'workspace.ts'))) {
    throw new Error(`[new:component] 工作空间不存在：src/workspaces/${workspace}`)
  }
}

/**
 * 组件名必须全局唯一：tag 与 package exports 都不带空间前缀，重名会被构建拦下
 * （见 scripts/build.ts 的 discoverComponents）。在这里提前拦，是因为此时还没落任何
 * 文件，报错更便宜。
 */
function assertGloballyUnique(targetRoot: string, name: string): void {
  const workspacesDir = join(targetRoot, 'src/workspaces')
  for (const ws of readdirSync(workspacesDir)) {
    const componentsDir = join(workspacesDir, ws, 'components')
    if (!existsSync(componentsDir)) continue
    for (const existing of readdirSync(componentsDir)) {
      if (!statSync(join(componentsDir, existing)).isDirectory()) continue
      if (existing !== name) continue
      throw new Error(
        `[new:component] 组件 "${name}" 已存在于 "${ws}" 下。` +
          'tag 与 package exports 都不带空间前缀，组件名必须全局唯一',
      )
    }
  }
}

/** 解析并校验配套设施，返回 [key, def] 对 */
export function resolveAddons(spec: ComponentSpec): Array<[AddonKey, AddonDef]> {
  const resolved = spec.addons.map((key): [AddonKey, AddonDef] => {
    const def = ADDONS[key]
    if (!def) throw new Error(`[new:component] 未知的配套设施："${key}"`)
    if (!def.frameworks.includes(spec.framework)) {
      throw new Error(
        `[new:component] 配套设施 "${key}" 不支持 ${spec.framework}，只支持：${def.frameworks.join(', ')}`,
      )
    }
    return [key, def]
  })

  const uiLibs = resolved.filter(([, def]) => def.cssEntry)
  if (uiLibs.length > 1) {
    throw new Error(
      `[new:component] 只能选一个 UI 库，收到：${uiLibs.map(([k]) => k).join(', ')}`,
    )
  }
  // Tailwind 的 preflight 会重置整页。组件自带 shadow 时它只影响组件自己，可一旦和 UI 库
  // 同选就得关 shadow，preflight 立刻变成全站级副作用 —— 拦在这里，别让它悄悄发生。
  if (uiLibs.length > 0 && spec.addons.includes('tailwind')) {
    throw new Error(
      '[new:component] Tailwind 与 UI 库不能同选：UI 库要求关掉 shadow，Tailwind 的 preflight 会因此落到整页',
    )
  }

  return resolved
}

export function createComponent(targetRoot: string, spec: ComponentSpec): CreateResult {
  assertName(spec.name)
  assertWorkspace(targetRoot, spec.workspace)
  assertGloballyUnique(targetRoot, spec.name)

  const defs = resolveAddons(spec)
  const id = toIdentifier(spec.name)
  const tag = `ew-${spec.name}`
  const uiAddon = defs.find(([, def]) => def.cssEntry)?.[1]
  // 选了 UI 库就必须关 shadow —— 库的样式进不了 shadow root，理由写在 UI_SHADOW_NOTE
  const shadow = uiAddon === undefined

  const dir = join(targetRoot, 'src/workspaces', spec.workspace, 'components', spec.name)
  const ext = styleExtOf(spec)
  // 空间没建 styles/ 就不写 @use。这是给 self-monitor 这类还没跟上的空间留的降级，
  // 写进去只会得到一行解析不了的 @use，把构建打红。
  const hasSharedStyles = existsSync(
    join(targetRoot, 'src/workspaces', spec.workspace, 'styles/index.scss'),
  )
  mkdirSync(dir, { recursive: true })

  const files: Record<string, string> = {
    [spec.framework === 'vue' ? 'Component.vue' : 'Component.tsx']: componentTemplate(
      spec,
      id,
      uiAddon?.label,
    ),
    'meta.ts': metaTemplate(spec, tag, shadow),
    [`style.${ext}`]: styleTemplate(spec, ext, hasSharedStyles),
    'index.ts': indexTemplate(spec, id, uiAddon, ext),
    'define.ts': defineTemplate(),
  }

  for (const [, def] of defs) {
    if (def.files) Object.assign(files, def.files(spec))
  }

  for (const [filename, content] of Object.entries(files)) {
    writeFileSync(join(dir, filename), content)
  }

  return {
    dir,
    dependencies: [...new Set(defs.flatMap(([, def]) => def.dependencies))].sort(),
    devDependencies: [...new Set(defs.flatMap(([, def]) => def.devDependencies))].sort(),
  }
}

// ────────────────────────────────── 模板 ──────────────────────────────────

/** 运行时是具名 workspace 包，与组件目录深度解耦 */
const RUNTIME_PKG = '@ew/runtime'

function metaTemplate(spec: ComponentSpec, tag: string, shadow: boolean): string {
  const shadowComment = shadow ? '' : `\n${UI_SHADOW_NOTE}`
  return `import { defineComponentMeta } from '${RUNTIME_PKG}'

export default defineComponentMeta({
  tag: '${tag}',${shadowComment}
  shadow: ${shadow},
  props: {
    label: { type: 'string', default: '${spec.name}' },
  },
  events: ['select'],
})
`
}

/**
 * 样式默认 `.scss`，只有 Tailwind 例外 —— `@tailwindcss/vite` 不处理 `.scss` 文件，
 * 写进去的 `@import "tailwindcss"` 会被 Sass 当成待解析的 partial 而报错。
 * 文件命名与 index.ts 里的 `?inline` 都取自这里，分头判断迟早会漂。
 */
function styleExtOf(spec: ComponentSpec): 'css' | 'scss' {
  return spec.addons.includes('tailwind') ? 'css' : 'scss'
}

function styleTemplate(
  spec: ComponentSpec,
  ext: 'css' | 'scss',
  hasSharedStyles: boolean,
): string {
  // Tailwind 的 @import 必须排在文件最前，@use 必须排在所有规则之前。
  // 两者不会同现（选了 Tailwind 就是 .css），所以顺序不必再调和。
  const tailwind =
    ext === 'css'
      ? `@import "tailwindcss";
@source "./Component.${spec.framework === 'vue' ? 'vue' : 'tsx'}";

`
      : ''
  const use =
    ext === 'scss' && hasSharedStyles ? `@use '${spec.workspace}/styles' as styles;\n\n` : ''
  return `${tailwind}${use}:host {
  display: inline-block;
}
`
}

function defineTemplate(): string {
  return `import { register } from './index'

register()
`
}

function indexTemplate(
  spec: ComponentSpec,
  id: string,
  uiAddon: AddonDef | undefined,
  ext: 'css' | 'scss',
): string {
  const isVue = spec.framework === 'vue'
  const adapter = isVue ? 'vueAdapter' : 'reactAdapter'
  const usesPinia = spec.addons.includes('pinia')

  const piniaImport = usesPinia ? "import { createPinia } from 'pinia'\n" : ''
  // 工厂而不是数组：一个元素实例一份 store，同页两个元素状态互不影响
  const adapterArgs = usesPinia
    ? '() => Component, { plugins: () => [createPinia()] }'
    : '() => Component'
  const libImport = uiAddon?.cssEntry ? `import libCss from '${uiAddon.cssEntry}?inline'\n` : ''
  const cssArg = uiAddon?.cssEntry ? "libCss + '\\n' + css" : 'css'

  return `import { createElementClass, registerElement, ${adapter} } from '${RUNTIME_PKG}'
${piniaImport}import Component from './Component${isVue ? '.vue' : ''}'
import meta from './meta'
${libImport}import css from './style.${ext}?inline'

export { meta }
export const ${id}Element = createElementClass(meta, ${adapter}(${adapterArgs}), ${cssArg})
export function register(): void {
  registerElement(meta.tag, ${id}Element)
}
`
}

function componentTemplate(spec: ComponentSpec, id: string, uiLabel?: string): string {
  if (spec.framework === 'vue') {
    if (uiLabel === 'Element Plus') return elementPlusComponent(spec)
    if (uiLabel === 'Ant Design Vue') return antDesignVueComponent(spec)
    return plainVueComponent(spec)
  }
  if (uiLabel === 'Ant Design (React)') return antdComponent(spec, id)
  return plainReactComponent(spec, id)
}

function plainVueComponent(spec: ComponentSpec): string {
  return `<script setup lang="ts">
import { useVueEmit } from '${RUNTIME_PKG}'

const props = defineProps<{ label?: string }>()

const emit = useVueEmit()

function handleClick(): void {
  emit('select', { source: '${spec.name}', label: props.label ?? '${spec.name}' })
}
</script>

<template>
  <button class="ew-${spec.name}" type="button" @click="handleClick">
    {{ props.label ?? '${spec.name}' }}
  </button>
</template>
`
}

function elementPlusComponent(spec: ComponentSpec): string {
  return `<script setup lang="ts">
// <script setup> 里 import 进来的组件自动可用，模板写 <ElButton> 或 <el-button> 都行
import { ElButton } from 'element-plus'
import { useVueEmit } from '${RUNTIME_PKG}'

const props = defineProps<{ label?: string }>()

const emit = useVueEmit()

function handleClick(): void {
  emit('select', { source: '${spec.name}', label: props.label ?? '${spec.name}' })
}
</script>

<template>
  <ElButton type="primary" @click="handleClick">{{ props.label ?? '${spec.name}' }}</ElButton>
</template>
`
}

function antDesignVueComponent(spec: ComponentSpec): string {
  return `<script setup lang="ts">
import { Button } from 'ant-design-vue'
import { useVueEmit } from '${RUNTIME_PKG}'

const props = defineProps<{ label?: string }>()

const emit = useVueEmit()

function handleClick(): void {
  emit('select', { source: '${spec.name}', label: props.label ?? '${spec.name}' })
}
</script>

<template>
  <Button type="primary" @click="handleClick">{{ props.label ?? '${spec.name}' }}</Button>
</template>
`
}

function plainReactComponent(spec: ComponentSpec, id: string): string {
  return `import { useReactEmit } from '${RUNTIME_PKG}'

export interface ${id}Props {
  label?: string
}

export default function ${id}({ label = '${spec.name}' }: ${id}Props) {
  const emit = useReactEmit()

  return (
    <button
      type="button"
      className="ew-${spec.name}"
      onClick={() => emit('select', { source: '${spec.name}', label })}
    >
      {label}
    </button>
  )
}
`
}

function antdComponent(spec: ComponentSpec, id: string): string {
  return `import { Button } from 'antd'
import { useReactEmit } from '${RUNTIME_PKG}'

export interface ${id}Props {
  label?: string
}

export default function ${id}({ label = '${spec.name}' }: ${id}Props) {
  const emit = useReactEmit()

  return (
    <Button type="primary" onClick={() => emit('select', { source: '${spec.name}', label })}>
      {label}
    </Button>
  )
}
`
}

function storeTemplate(spec: ComponentSpec): string {
  const id = toIdentifier(spec.name)
  return `import { defineStore } from 'pinia'

/**
 * 每个 <ew-${spec.name}> 元素各持一份 pinia（index.ts 里按实例 createPinia），
 * 所以同页放两个元素，状态互不影响。
 */
export const use${id}Store = defineStore('${spec.name}', {
  state: () => ({ count: 0 }),
  actions: {
    increment(): void {
      this.count += 1
    },
  },
})
`
}

function apiTemplate(): string {
  return `import axios, { type AxiosInstance } from 'axios'

/**
 * 组件内共用的 axios 实例。拦截器是这层存在的理由：鉴权头、traceId、统一错误提示
 * 都往这里加，组件里只管发请求。
 */
export const http: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 15_000,
})

http.interceptors.request.use((config) => {
  // 例：config.headers.set('Authorization', \`Bearer \${token}\`)
  return config
})

http.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    // 例：统一 toast、401 跳登录
    return Promise.reject(error)
  },
)
`
}

// ────────────────────────────────── CLI ──────────────────────────────────

function listWorkspaceIds(targetRoot: string): string[] {
  const workspacesDir = join(targetRoot, 'src/workspaces')
  if (!existsSync(workspacesDir)) return []
  return readdirSync(workspacesDir).filter((id) => statSync(join(workspacesDir, id)).isDirectory())
}

/** 按框架过滤配套设施 —— 不列出不可能的组合（比如 React 下的 pinia） */
export function addonOptions(framework: Framework): Array<Option<AddonKey>> {
  return Object.entries(ADDONS)
    .filter(([, def]) => def.frameworks.includes(framework))
    .map(([key, def]) => {
      const option: Option<AddonKey> = { value: key as AddonKey, label: def.label }
      // exactOptionalPropertyTypes 下不能显式写 undefined，有才挂上去
      if (def.cssEntry) option.hint = '会关掉 shadow DOM'
      return option
    })
}

function run(command: string, args: string[]): void {
  const status = spawnSync(command, args, { cwd: root, stdio: 'inherit' }).status
  if (status !== 0) {
    throw new Error(`[new:component] ${command} ${args.join(' ')} 失败，请手动安装`)
  }
}

async function main(): Promise<void> {
  const { cancel, group, intro, multiselect, outro, select, text } = await import('@clack/prompts')

  intro('新建组件')

  const workspaces = listWorkspaceIds(root)
  if (workspaces.length === 0) {
    throw new Error('[new:component] 还没有任何工作空间，先跑 pnpm run new:workspace <name>')
  }

  const answers = await group(
    {
      workspace: () =>
        select({
          message: '放在哪个工作空间？',
          options: workspaces.map((id) => ({ value: id, label: id })),
        }),
      framework: () =>
        select({
          message: '用哪个框架写？',
          options: [
            { value: 'vue' as const, label: 'Vue 3' },
            { value: 'react' as const, label: 'React' },
          ],
        }),
      name: () =>
        text({
          message: '组件名（小写字母、数字、连字符）',
          placeholder: 'my-card',
          validate: (value) => {
            if (!value) return '不能为空'
            if (!NAME_RE.test(value)) return '只允许小写字母、数字与连字符，且以字母开头'
            try {
              assertGloballyUnique(root, value)
            } catch (error) {
              return error instanceof Error ? error.message : String(error)
            }
            return undefined
          },
        }),
      addons: ({ results }) =>
        multiselect({
          message: '要配套什么？（空格多选，回车确认）',
          required: false,
          options: addonOptions(results.framework as Framework),
        }),
    },
    {
      onCancel: () => {
        cancel('已取消')
        process.exit(0)
      },
    },
  )

  const spec: ComponentSpec = {
    workspace: answers.workspace as string,
    framework: answers.framework as Framework,
    name: answers.name as string,
    addons: (answers.addons ?? []) as AddonKey[],
  }

  const result = createComponent(root, spec)
  console.log(`\n[new:component] 已创建 src/workspaces/${spec.workspace}/components/${spec.name}/`)

  // -D 与普通依赖必须分两次跑：一个 pnpm add 写不了两个 section
  if (result.dependencies.length > 0) run('pnpm', ['add', ...result.dependencies])
  if (result.devDependencies.length > 0) run('pnpm', ['add', '-D', ...result.devDependencies])

  if (spec.addons.includes('pinia')) {
    console.log(
      `  提示：状态在 store.ts 里，组件里 use${toIdentifier(spec.name)}Store() 即可取到本元素那份。`,
    )
  }
  outro('完成。重启 docs:dev 与 dev —— 页面清单与侧边栏在启动时就定好了')
}

// 只有被当作脚本直接执行时才跑 CLI。被测试 import 时 process.argv[1] 是 vitest 的可执行文件。
// 比较解析后的文件路径而不是 import.meta.url 字符串：tsx 下后者可能带 query，
// 字符串一不等 CLI 就静默不执行 —— 那是比报错更难查的失败。
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
