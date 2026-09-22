# easy-webcomp 工作空间 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 引入「工作空间」作为组件的必需文件组织单位，并把文档站改成按工作空间浏览的 grid 页面。

**Architecture:** 组件从 `src/components/<name>/` 迁到 `src/workspaces/<ws>/components/<name>/`，每个空间带一份 `workspace.ts` 清单。构建脚本与文档站的扫描器各扫各的（共享目录约定而非代码）。文档站用两套 VitePress 动态路由（`[ws]/index.md`、`[ws]/[name].md`）让新建的空间与组件零配置出现在导航里；散文页仍是手写静态 md，动态页只兜底没有散文的组件。

**Tech Stack:** TypeScript、Vite 7（构建脚本）、VitePress 1.6.4（文档站，内部 Vite 5）、tsx（脚本执行 + 配置期读 TS 清单）、Vitest 3、Playwright。

**Spec:** `docs/superpowers/specs/2026-09-22-ew-workspace-design.md`

---

## 全局约定

**红窗期（已知且预期）**：Task 2 删掉 `src/components/` 之后，`docs:build` 会失败，直到 Task 6 结束。**`pnpm run verify` 只在 Task 8 要求全绿**。中间任务的红是设计使然，不要为此临时保留旧路径。

**交付契约不变**：自定义元素 tag（`ew-hello-vue`）、`package.json` 的 `exports` 键（`./hello-vue`）、`dist/cdn/` 文件名，全程不动。工作空间只出现在源码目录、文档 URL 与侧边栏里。

**提交风格**：沿用仓库现有的 conventional commits（`feat:` / `refactor!:` / `docs:` / `test:` / `chore:`），消息用中文。

---

## File Structure

**新建**

| 文件 | 职责 |
|---|---|
| `src/workspaces/define.ts` | `WorkspaceMeta` 类型与 `defineWorkspace()` |
| `src/workspaces/demo/workspace.ts` | `demo` 空间的清单 |
| `scripts/new-workspace.ts` | 工作空间脚手架（可导出纯函数 + CLI 入口） |
| `docs/.vitepress/workspaces.ts` | 取代 `components.ts`：`listWorkspaces()` + `readWorkspaceMeta()` |
| `docs/workspaces/index.md` | `/workspaces/` 页面正文 |
| `docs/workspaces/[ws]/index.md` | 空间 grid 页的动态模板 |
| `docs/workspaces/[ws]/index.paths.ts` | 上面那个模板的路径来源 |
| `docs/workspaces/[ws]/[name].md` | 兜底详情页的动态模板 |
| `docs/workspaces/[ws]/[name].paths.ts` | 上面那个模板的路径来源（排除已写散文的） |
| `docs/.vitepress/theme/components/WorkspaceIndex.vue` | 空间总览 grid |
| `docs/.vitepress/theme/components/WorkspaceGrid.vue` | 单个空间的组件 grid |
| `docs/.vitepress/theme/components/ComponentCard.vue` | 单张卡片：框架 icon + 组件名 |
| `docs/.vitepress/theme/components/ComponentDetail.vue` | 兜底详情页正文 |
| `tests/docs/workspaces.test.ts` | `workspaces.ts` 的单测 |
| `tests/scripts/new-workspace.test.ts` | 脚手架的单元测 |

**修改**

| 文件 | 改什么 |
|---|---|
| `scripts/build.ts` | 扫描基路径、全局重名校验、生成入口的相对路径 |
| `docs/.vitepress/config.mts` | 改 async 配置函数、nav、两层 sidebar、插件路径 |
| `docs/.vitepress/plugins/wc-mode.ts` | 扫描工作空间而非单一目录 |
| `docs/.vitepress/theme/components/ComponentDemo.vue` | 三个 glob 的基路径 |
| `docs/.vitepress/theme/components/source-style.ts` | glob 基路径 |
| `docs/.vitepress/theme/index.ts` | 全局注册换成新组件 |
| `package.json` | 加 `new:workspace` 脚本 |

**移动**（组件内的 `../../runtime/*` 相对导入要同步改成四层 `../`，见 Task 2 Step 2）

| 从 | 到 |
|---|---|
| `src/components/hello-vue/` | `src/workspaces/demo/components/hello-vue/` |
| `src/components/hello-react/` | `src/workspaces/demo/components/hello-react/` |
| `docs/components/hello-vue.md` | `docs/workspaces/demo/hello-vue.md` |
| `docs/components/hello-react.md` | `docs/workspaces/demo/hello-react.md` |

**删除**

`src/components/`（Task 2）、`docs/components/`（Task 6）、`docs/.vitepress/components.ts`（Task 3）、`docs/.vitepress/theme/components/ComponentOverview.vue`（Task 6）、`tests/docs/components.test.ts`（Task 3）。

**不需要改**：`tests/runtime/*`（不引用组件路径）、`tests/e2e/*`（只用 `dist/cdn/*.js` 与 tag 名，与源码布局无关）、`src/runtime/*`、`src/tokens/*`、`docs/guide/theming.md`、`docs/.vitepress/theme/components/VueMount.vue`、`ReactMount.vue`。

---

## Task 1: `defineWorkspace` 与工作空间脚手架

**Files:**
- Create: `src/workspaces/define.ts`
- Create: `src/workspaces/demo/workspace.ts`
- Create: `scripts/new-workspace.ts`
- Create: `tests/scripts/new-workspace.test.ts`
- Modify: `package.json`

- [ ] **Step 1: 写清单类型**

创建 `src/workspaces/define.ts`：

```ts
export interface WorkspaceMeta {
  /** 展示名。缺省时由读取方回落到目录名 */
  title?: string
  description?: string
}

export function defineWorkspace(meta: WorkspaceMeta): WorkspaceMeta {
  return meta
}
```

- [ ] **Step 2: 建 demo 空间的清单**

创建 `src/workspaces/demo/workspace.ts`：

```ts
import { defineWorkspace } from '../define'

export default defineWorkspace({
  title: '演示组件',
  description: '文档站的示例集合，Vue 与 React 各一个。',
})
```

这里**不建** `components/` 目录，也不放 `.gitkeep` —— Task 2 会把两个真实组件挪进来。脚手架（Step 5）才需要 `.gitkeep`，因为那时空间确实是空的。

- [ ] **Step 3: 写失败测试**

创建 `tests/scripts/new-workspace.test.ts`：

```ts
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createWorkspace } from '../../scripts/new-workspace'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ew-new-ws-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('createWorkspace', () => {
  it('生成 workspace.ts 与 components/ 占位', () => {
    createWorkspace(root, 'demo')
    expect(existsSync(join(root, 'src/workspaces/demo/workspace.ts'))).toBe(true)
    expect(existsSync(join(root, 'src/workspaces/demo/components/.gitkeep'))).toBe(true)
  })

  it('title 预填目录名，description 留空，并 import defineWorkspace', () => {
    createWorkspace(root, 'demo')
    const source = readFileSync(join(root, 'src/workspaces/demo/workspace.ts'), 'utf8')
    expect(source).toContain("import { defineWorkspace } from '../define'")
    expect(source).toContain("title: 'demo'")
    expect(source).toContain("description: ''")
  })

  it('拒绝已存在的目录', () => {
    createWorkspace(root, 'demo')
    expect(() => createWorkspace(root, 'demo')).toThrow(/已存在/)
  })

  it('拒绝非法目录名', () => {
    expect(() => createWorkspace(root, 'Demo')).toThrow(/不合法/)
    expect(() => createWorkspace(root, '-x')).toThrow(/不合法/)
    expect(() => createWorkspace(root, 'a/b')).toThrow(/不合法/)
    expect(() => createWorkspace(root, '')).toThrow(/不合法/)
    expect(() => createWorkspace(root, '有中文')).toThrow(/不合法/)
  })
})
```

- [ ] **Step 4: 跑测试确认失败**

Run: `pnpm exec vitest run tests/scripts/new-workspace.test.ts`
Expected: FAIL —— `Failed to resolve import "../../scripts/new-workspace"`

> 不要写成 `pnpm run test -- <file>`：pnpm 会吞掉那个位置参数，实际跑的是全部 8 个测试文件。要只跑一个文件必须用 `pnpm exec vitest run <file>`。

- [ ] **Step 5: 实现脚手架**

创建 `scripts/new-workspace.ts`：

```ts
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const NAME_RE = /^[a-z][a-z0-9-]*$/

function template(name: string): string {
  return `import { defineWorkspace } from '../define'

export default defineWorkspace({
  title: '${name}',
  description: '',
})
`
}

export function createWorkspace(targetRoot: string, name: string): string {
  if (!NAME_RE.test(name)) {
    throw new Error(
      `[new:workspace] 目录名不合法："${name}"。只允许小写字母、数字与连字符，且以字母开头`,
    )
  }

  const wsDir = join(targetRoot, 'src/workspaces', name)
  if (existsSync(wsDir)) {
    throw new Error(`[new:workspace] 已存在：src/workspaces/${name}`)
  }

  mkdirSync(join(wsDir, 'components'), { recursive: true })
  writeFileSync(join(wsDir, 'workspace.ts'), template(name))
  writeFileSync(join(wsDir, 'components/.gitkeep'), '')
  return wsDir
}

function main(): void {
  const name = process.argv[2]
  if (!name) {
    throw new Error('[new:workspace] 用法：pnpm run new:workspace <name>')
  }

  createWorkspace(root, name)

  console.log(`[new:workspace] 已创建 src/workspaces/${name}/`)
  console.log('  下一步：')
  console.log(`    1. 编辑 src/workspaces/${name}/workspace.ts 的 title 与 description`)
  console.log(`    2. 在 src/workspaces/${name}/components/ 下新建组件目录（五个文件，零配置）`)
  console.log('    3. 重启 dev（pnpm run dev）—— VitePress 的动态路由扫不出新目录')
}

// 只有被当作脚本直接执行时才跑 CLI。被测试 import 时 process.argv[1] 是 vitest 的可执行文件。
// 比较解析后的文件路径而不是 `import.meta.url` 字符串：tsx 下后者可能带 query，
// 字符串一不等 CLI 就静默不执行 —— 那是比报错更难查的失败。
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
```

- [ ] **Step 6: 注册脚本**

> **有意不做的校验**：`pnpm run new:workspace define` 会建出 `src/workspaces/define/`，与已有的 `define.ts` 并存，文档站会多出一个空的幽灵空间。不加保留名校验是权衡后的选择 —— 真撞上的概率极低，而 spec 第 3 节把工作空间的删除 / 重命名 / 迁移都划为非目标。记在这里，以便日后真踩到时知道是已知缺口而不是疏漏。

在 `package.json` 的 `scripts` 里，`"build": "tsx scripts/build.ts"` 之前插入一行：

```json
    "new:workspace": "tsx scripts/new-workspace.ts",
```

- [ ] **Step 7: 跑测试确认通过**

Run: `pnpm exec vitest run tests/scripts/new-workspace.test.ts`
Expected: PASS，4 个用例全绿

- [ ] **Step 8: 类型检查**

Run: `pnpm run typecheck`
Expected: 无输出、退出码 0

- [ ] **Step 9: 提交**

```bash
git add src/workspaces scripts/new-workspace.ts tests/scripts/new-workspace.test.ts package.json
git commit -m "feat: 工作空间清单类型与 new:workspace 脚手架"
```

---

## Task 2: 组件迁入工作空间，构建脚本改扫

**Files:**
- Move: `src/components/hello-vue/` → `src/workspaces/demo/components/hello-vue/`
- Move: `src/components/hello-react/` → `src/workspaces/demo/components/hello-react/`
- Modify: `scripts/build.ts`

- [ ] **Step 1: 移动源码**

```bash
mkdir -p src/workspaces/demo/components
git mv src/components/hello-vue src/workspaces/demo/components/hello-vue
git mv src/components/hello-react src/workspaces/demo/components/hello-react
rmdir src/components
```

`git mv` 不会创建中间目录，`mkdir -p` 那行是必需的。

- [ ] **Step 2: 修组件内的相对导入层级**

**这一步不做，本任务末尾的 `pnpm run build` 必炸。** spec 第 10 节的迁移清单漏了它：组件深了两层，而 `index.ts`、`meta.ts`、`Component.vue` / `Component.tsx` 里的 `../../runtime/*` 是相对导入，`../../` 的含义已从 `src/` 变成 `src/workspaces/`。

```bash
sed -i '' "s|from '../../runtime/|from '../../../../runtime/|g" \
  src/workspaces/demo/components/*/index.ts \
  src/workspaces/demo/components/*/meta.ts \
  src/workspaces/demo/components/*/Component.vue \
  src/workspaces/demo/components/*/Component.tsx
```

验证 —— 10 行，全部是四层 `../`：

```bash
grep -rn "runtime/" src/workspaces/demo/components/
```

Expected:

```
src/workspaces/demo/components/hello-react/Component.tsx:1:import { useEmit } from '../../../../runtime/react'
src/workspaces/demo/components/hello-react/index.ts:1:import { createElementClass } from '../../../../runtime/element'
src/workspaces/demo/components/hello-react/index.ts:2:import { registerElement } from '../../../../runtime/registry'
src/workspaces/demo/components/hello-react/index.ts:3:import { reactAdapter } from '../../../../runtime/react'
src/workspaces/demo/components/hello-react/meta.ts:1:import { defineComponentMeta } from '../../../../runtime/types'
src/workspaces/demo/components/hello-vue/Component.vue:3:import { useEmit } from '../../../../runtime/vue'
src/workspaces/demo/components/hello-vue/index.ts:1:import { createElementClass } from '../../../../runtime/element'
src/workspaces/demo/components/hello-vue/index.ts:2:import { registerElement } from '../../../../runtime/registry'
src/workspaces/demo/components/hello-vue/index.ts:3:import { vueAdapter } from '../../../../runtime/vue'
src/workspaces/demo/components/hello-vue/meta.ts:1:import { defineComponentMeta } from '../../../../runtime/types'
```

`index.ts` 里的 `./Component.vue`、`./meta`、`./style.css?inline`，以及 `define.ts` 里的 `./index`，都是同级引用，不受影响。

- [ ] **Step 3: 改扫描基路径与 `ComponentInfo`**

在 `scripts/build.ts` 中，把第 17-25 行

```ts
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const componentsDir = join(root, 'src/components')
const generatedDir = join(root, 'src/.generated')

interface ComponentInfo {
  name: string
  dir: string
  framework: 'vue' | 'react'
}
```

替换为

```ts
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workspacesDir = join(root, 'src/workspaces')
const generatedDir = join(root, 'src/.generated')

interface ComponentInfo {
  name: string
  workspace: string
  dir: string
  framework: 'vue' | 'react'
}
```

- [ ] **Step 4: 重写 `discoverComponents()`**

把 `scripts/build.ts` 中现有的 `discoverComponents()` 整个函数（从 `function discoverComponents` 到它的收尾 `}`）替换为：

```ts
function discoverComponents(): ComponentInfo[] {
  const seen = new Map<string, string>()
  const components: ComponentInfo[] = []

  for (const workspace of readdirSync(workspacesDir)) {
    const wsDir = join(workspacesDir, workspace)
    if (!statSync(wsDir).isDirectory()) continue

    const componentsDir = join(wsDir, 'components')
    if (!existsSync(componentsDir)) continue

    for (const name of readdirSync(componentsDir)) {
      const dir = join(componentsDir, name)
      if (!statSync(dir).isDirectory()) continue

      // tag 与 package exports 都不带空间前缀，重名会静默覆盖 exports 键
      const owner = seen.get(name)
      if (owner) {
        throw new Error(
          `[build] 组件名 "${name}" 在 "${owner}" 与 "${workspace}" 下重复。` +
            'tag 与 package exports 都不带空间前缀，组件名必须全局唯一',
        )
      }
      seen.set(name, workspace)

      const hasVue = existsSync(join(dir, 'Component.vue'))
      const hasReact = existsSync(join(dir, 'Component.tsx'))
      if (hasVue === hasReact) {
        throw new Error(
          `[build] ${name} 必须且只能有一个 Component.vue 或 Component.tsx（当前 vue=${hasVue} react=${hasReact}）`,
        )
      }
      for (const required of ['meta.ts', 'index.ts', 'define.ts']) {
        if (!existsSync(join(dir, required))) {
          throw new Error(`[build] ${name} 缺少 ${required}`)
        }
      }

      components.push({ name, workspace, dir, framework: hasVue ? 'vue' : 'react' })
    }
  }

  return components.sort((a, b) => a.name.localeCompare(b.name))
}
```

- [ ] **Step 5: 改生成入口的相对路径**

把 `writeGeneratedEntries()` 的前两段

```ts
  const allLines = components.map(
    (c) => `export * as ${toIdentifier(c.name)} from '../components/${c.name}/index'`,
  )
  writeFileSync(join(generatedDir, 'all.ts'), `${allLines.join('\n')}\n`)

  const defineLines = components.map(
    (c, i) => `import { register as r${i} } from '../components/${c.name}/index'`,
  )
```

替换为

```ts
  // 生成文件在 src/.generated/，故相对路径要从 src/ 往下写
  const entryPath = (c: ComponentInfo) =>
    `../workspaces/${c.workspace}/components/${c.name}/index`

  const allLines = components.map(
    (c) => `export * as ${toIdentifier(c.name)} from '${entryPath(c)}'`,
  )
  writeFileSync(join(generatedDir, 'all.ts'), `${allLines.join('\n')}\n`)

  const defineLines = components.map(
    (c, i) => `import { register as r${i} } from '${entryPath(c)}'`,
  )
```

- [ ] **Step 6: 更新完成日志**

把 `main()` 里

```ts
  console.log(`[build] 发现 ${components.length} 个组件：${components.map((c) => c.name).join(', ')}`)
```

替换为

```ts
  console.log(
    `[build] 发现 ${components.length} 个组件：` +
      components.map((c) => `${c.workspace}/${c.name}`).join(', '),
  )
```

- [ ] **Step 7: 构建并确认产物与 exports 未变**

Run: `pnpm run build`
Expected: 退出码 0，日志出现「发现 2 个组件：demo/hello-react, demo/hello-vue」，末尾打印 `dist/cdn/hello-vue.js`、`dist/cdn/hello-react.js`、`dist/cdn/ew-all.js` 的 gzip 体积。

Run: `node -e "const e=require('./package.json').exports; console.log(Object.keys(e).join('\n'))"`
Expected: 与改动前逐字相同：

```
./tokens.css
.
./hello-react
./hello-react/define
./cdn/hello-react
./hello-vue
./hello-vue/define
./cdn/hello-vue
./cdn/ew-all
```

- [ ] **Step 8: 跑单测确认运行时未受影响**

Run: `pnpm run test`
Expected: PASS，全绿。`tests/docs/components.test.ts` 与 `docs/.vitepress/components.ts` 都还在，且前者把两个临时目录显式传进 `listComponents()`，默认参数不会被求值，所以不受 `src/components/` 已删除的影响。

- [ ] **Step 9: 提交**

```bash
git add -A src scripts/build.ts
git commit -m "refactor!: 组件迁入工作空间，构建脚本改扫 src/workspaces"
```

---

## Task 3: 文档站扫描器 `workspaces.ts`

**Files:**
- Create: `docs/.vitepress/workspaces.ts`
- Create: `tests/docs/workspaces.test.ts`
- Delete: `docs/.vitepress/components.ts`
- Delete: `tests/docs/components.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `tests/docs/workspaces.test.ts`：

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listWorkspaces, readWorkspaceMeta } from '../../docs/.vitepress/workspaces'

let root: string

function makeComponent(ws: string, name: string, files: string[]): void {
  mkdirSync(join(root, 'src/workspaces', ws, 'components', name), { recursive: true })
  for (const file of files) {
    writeFileSync(join(root, 'src/workspaces', ws, 'components', name, file), '')
  }
}

const scan = () => listWorkspaces(join(root, 'src/workspaces'), join(root, 'docs/workspaces'))

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ew-ws-'))
  mkdirSync(join(root, 'docs/workspaces'), { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('listWorkspaces', () => {
  it('按空间 id 与组件名排序，并识别框架', () => {
    makeComponent('beta', 'a-vue', ['Component.vue'])
    makeComponent('alpha', 'z-react', ['Component.tsx'])
    expect(scan()).toEqual([
      { id: 'alpha', components: [{ name: 'z-react', framework: 'react', documented: false }] },
      { id: 'beta', components: [{ name: 'a-vue', framework: 'vue', documented: false }] },
    ])
  })

  it('没有 components 目录的空间返回空数组', () => {
    mkdirSync(join(root, 'src/workspaces/empty'), { recursive: true })
    expect(scan()).toEqual([{ id: 'empty', components: [] }])
  })

  it('docs/workspaces/<ws>/<name>.md 存在时 documented 为 true', () => {
    makeComponent('demo', 'a-vue', ['Component.vue'])
    mkdirSync(join(root, 'docs/workspaces/demo'), { recursive: true })
    writeFileSync(join(root, 'docs/workspaces/demo/a-vue.md'), '')
    expect(scan()[0]?.components[0]?.documented).toBe(true)
  })

  it('另一个空间的同名散文不算数', () => {
    makeComponent('demo', 'a-vue', ['Component.vue'])
    mkdirSync(join(root, 'docs/workspaces/other'), { recursive: true })
    writeFileSync(join(root, 'docs/workspaces/other/a-vue.md'), '')
    expect(scan()[0]?.components[0]?.documented).toBe(false)
  })

  it('Component.vue 与 Component.tsx 同时存在时抛错', () => {
    makeComponent('demo', 'both', ['Component.vue', 'Component.tsx'])
    expect(scan).toThrow(/必须且只能有一个/)
  })

  it('两者都不存在时抛错', () => {
    makeComponent('demo', 'neither', [])
    expect(scan).toThrow(/必须且只能有一个/)
  })

  it('跨空间组件重名时抛错并指出两处', () => {
    makeComponent('alpha', 'dup', ['Component.vue'])
    makeComponent('beta', 'dup', ['Component.vue'])
    expect(scan).toThrow(/alpha/)
    expect(scan).toThrow(/beta/)
    expect(scan).toThrow(/全局唯一/)
  })

  it('忽略 src/workspaces 顶层的散文件', () => {
    mkdirSync(join(root, 'src/workspaces'), { recursive: true })
    writeFileSync(join(root, 'src/workspaces/define.ts'), '')
    makeComponent('demo', 'a-vue', ['Component.vue'])
    expect(scan().map((w) => w.id)).toEqual(['demo'])
  })

  it('忽略 components 目录下的非目录条目', () => {
    makeComponent('demo', 'a-vue', ['Component.vue'])
    writeFileSync(join(root, 'src/workspaces/demo/components/.gitkeep'), '')
    expect(scan()[0]?.components.map((c) => c.name)).toEqual(['a-vue'])
  })
})

describe('readWorkspaceMeta', () => {
  it('读到 title 与 description', async () => {
    mkdirSync(join(root, 'src/workspaces/demo'), { recursive: true })
    writeFileSync(
      join(root, 'src/workspaces/demo/workspace.ts'),
      "export default { title: '演示组件', description: '示例集合' }\n",
    )
    await expect(readWorkspaceMeta('demo', join(root, 'src/workspaces'))).resolves.toEqual({
      title: '演示组件',
      description: '示例集合',
    })
  })

  it('清单缺失时返回空对象而不是抛错', async () => {
    await expect(readWorkspaceMeta('missing', join(root, 'src/workspaces'))).resolves.toEqual({})
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm exec vitest run tests/docs/workspaces.test.ts`
Expected: FAIL —— `Failed to resolve import "../../docs/.vitepress/workspaces"`

- [ ] **Step 3: 实现扫描器**

创建 `docs/.vitepress/workspaces.ts`：

```ts
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { WorkspaceMeta } from '../../src/workspaces/define'

export const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export interface ComponentInfo {
  name: string
  framework: 'vue' | 'react'
  documented: boolean
}

export interface WorkspaceInfo {
  id: string
  components: ComponentInfo[]
}

const workspacesDirOf = () => join(rootDir, 'src/workspaces')
const docsDirOf = () => join(rootDir, 'docs/workspaces')

function readComponent(dir: string, name: string, wsDocsDir: string): ComponentInfo {
  const hasVue = existsSync(join(dir, 'Component.vue'))
  const hasReact = existsSync(join(dir, 'Component.tsx'))
  if (hasVue === hasReact) {
    throw new Error(
      `[docs] ${name} 必须且只能有一个 Component.vue 或 Component.tsx（当前 vue=${hasVue} react=${hasReact}）`,
    )
  }
  return {
    name,
    framework: hasVue ? 'vue' : 'react',
    documented: existsSync(join(wsDocsDir, `${name}.md`)),
  }
}

/**
 * 纯 fs 扫描：只返回能从目录结构推断出的东西。清单里的 title / description 是 TS 模块里的值，
 * 这里读不到 —— 需要它们的地方走 readWorkspaceMeta()。
 */
export function listWorkspaces(
  workspacesDir = workspacesDirOf(),
  docsDir = docsDirOf(),
): WorkspaceInfo[] {
  const seen = new Map<string, string>()

  return readdirSync(workspacesDir)
    .filter((id) => statSync(join(workspacesDir, id)).isDirectory())
    .map((id): WorkspaceInfo => {
      const componentsDir = join(workspacesDir, id, 'components')
      if (!existsSync(componentsDir)) return { id, components: [] }

      const wsDocsDir = join(docsDir, id)
      const components = readdirSync(componentsDir)
        .filter((name) => statSync(join(componentsDir, name)).isDirectory())
        .map((name): ComponentInfo => {
          const owner = seen.get(name)
          if (owner) {
            throw new Error(
              `[docs] 组件名 "${name}" 在 "${owner}" 与 "${id}" 下重复。` +
                'tag 与 package exports 都不带空间前缀，组件名必须全局唯一',
            )
          }
          seen.set(name, id)
          return readComponent(join(componentsDir, name), name, wsDocsDir)
        })
        .sort((a, b) => a.name.localeCompare(b.name))

      return { id, components }
    })
    .sort((a, b) => a.id.localeCompare(b.id))
}

/**
 * config.mts 由 Vite 用 esbuild 打包后加载，`import.meta.glob` 在那里不可用，而清单是 TS。
 * tsx 已是既有 devDependency（scripts/build.ts 就跑在它上面）；Vite 打包 config 时会把裸包
 * import 标记为 external，所以这个动态 import 会留给 Node 真正加载。
 * 读不到就返回空对象，调用方回落到目录名 —— 一个清单文件写错不该让整个构建失败。
 */
export async function readWorkspaceMeta(
  id: string,
  workspacesDir = workspacesDirOf(),
): Promise<WorkspaceMeta> {
  try {
    const { tsImport } = await import('tsx/esm/api')
    const file = pathToFileURL(join(workspacesDir, id, 'workspace.ts')).href
    const mod = (await tsImport(file, import.meta.url)) as { default?: WorkspaceMeta }
    return mod.default ?? {}
  } catch {
    return {}
  }
}
```

> **`WorkspaceMeta` 是 `import type` 从 `src/workspaces/define.ts` 取的，不要在这里再抄一份 interface。** Task 1 已经让 `define.ts` 成为这个形状的唯一出处（脚手架生成的每个清单都 import 它），抄一份就多一处会漂移的地方 —— 这与 spec 第 4 节「一个信息只存一处」是同一条原则。type-only import 会被 esbuild 整个抹掉，不产生任何运行时依赖，因此不违背「构建脚本与文档站共享约定而非代码」。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm exec vitest run tests/docs/workspaces.test.ts`
Expected: PASS，11 个用例全绿。若 `readWorkspaceMeta` 两例失败，见 Task 3 的备注。

> **若 `tsImport` 在 vitest 下不可用**：改用 Node 22.18+ 的原生类型剥离 —— 把 `workspace.ts` 的模板改成 `import type { WorkspaceMeta } from '../define'` + `export default { ... } satisfies WorkspaceMeta`（类型导入会被剥掉，不产生运行时相对导入），`readWorkspaceMeta` 里换成 `await import(file)`。改完必须同步更新 Task 1 的 `template()` 与它那条断言，并重跑 Task 1 的测试。

- [ ] **Step 5: 删除旧扫描器与它的测试**

```bash
git rm docs/.vitepress/components.ts tests/docs/components.test.ts
```

- [ ] **Step 6: 跑全量单测**

Run: `pnpm run test`
Expected: PASS，所有文件全绿（`tests/docs/workspaces.test.ts` 取代了 `tests/docs/components.test.ts`）

- [ ] **Step 7: 提交**

```bash
git add docs/.vitepress/workspaces.ts tests/docs/workspaces.test.ts
git commit -m "feat: 文档站扫描器改为按工作空间，含全局重名校验"
```

---

## Task 4: 让文档站重新指向新布局

**Files:**
- Modify: `docs/.vitepress/plugins/wc-mode.ts`
- Modify: `docs/.vitepress/config.mts`
- Modify: `docs/.vitepress/theme/components/ComponentDemo.vue`
- Modify: `docs/.vitepress/theme/components/source-style.ts`

- [ ] **Step 1: 重写 `wc-mode.ts` 的扫描**

把 `docs/.vitepress/plugins/wc-mode.ts` 第 10-25 行的 `ComponentInfo` 接口与 `listComponents()` 替换为：

```ts
interface Located {
  name: string
  dir: string
  framework: 'vue' | 'react'
}

/**
 * 虚拟模块 id 仍用 `virtual:ew-wc/<name>`，不带空间前缀 —— 组件名在构建期已强制全局唯一
 * （见 scripts/build.ts），加前缀只会让「组件换空间」产生无谓的 import 变动。
 */
function locateComponents(workspacesDir: string): Located[] {
  const found: Located[] = []

  for (const workspace of readdirSync(workspacesDir)) {
    const wsDir = join(workspacesDir, workspace)
    if (!statSync(wsDir).isDirectory()) continue

    const componentsDir = join(wsDir, 'components')
    if (!existsSync(componentsDir)) continue

    for (const name of readdirSync(componentsDir)) {
      const dir = join(componentsDir, name)
      if (!statSync(dir).isDirectory()) continue
      found.push({
        name,
        dir,
        framework: existsSync(join(dir, 'Component.vue')) ? 'vue' : 'react',
      })
    }
  }

  return found.sort((a, b) => a.name.localeCompare(b.name))
}
```

- [ ] **Step 2: 改 `wcModePlugin` 的签名与内部引用**

把同文件里的 `export function wcModePlugin(componentsDir: string): Plugin {` 与其下一行

```ts
export function wcModePlugin(componentsDir: string): Plugin {
  const srcDir = resolve(componentsDir, '..')
```

替换为

```ts
export function wcModePlugin(workspacesDir: string): Plugin {
  const srcDir = resolve(workspacesDir, '..')
```

在 `load()` 里，把

```ts
      if (id === RESOLVED_INDEX) {
        const components = listComponents(componentsDir)
```

替换为

```ts
      if (id === RESOLVED_INDEX) {
        const components = locateComponents(workspacesDir)
```

再把

```ts
      if (id.startsWith(RESOLVED_PREFIX)) {
        const name = id.slice(RESOLVED_PREFIX.length)
        const dir = join(componentsDir, name)
        if (!existsSync(dir)) return null

        const isVue = existsSync(join(dir, 'Component.vue'))
        const componentPath = join(dir, isVue ? 'Component.vue' : 'Component.tsx')
        const adapterCall = isVue ? 'vueAdapter' : 'reactAdapter'
```

替换为

```ts
      if (id.startsWith(RESOLVED_PREFIX)) {
        const name = id.slice(RESOLVED_PREFIX.length)
        const located = locateComponents(workspacesDir).find((c) => c.name === name)
        if (!located) return null

        const dir = located.dir
        const isVue = located.framework === 'vue'
        const componentPath = join(dir, isVue ? 'Component.vue' : 'Component.tsx')
        const adapterCall = isVue ? 'vueAdapter' : 'reactAdapter'
```

- [ ] **Step 3: 改 config.mts 为 async 配置函数**

把 `docs/.vitepress/config.mts` 顶部的 import 段与 `buildComponentSidebar()`：

```ts
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitepress'
import { listComponents } from './components'
import { wcModePlugin } from './plugins/wc-mode'

export const rootDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')

function buildComponentSidebar() {
  return listComponents().map((c) => ({
    text: c.name,
    link: c.documented ? `/components/${c.name}` : `/components/#${c.name}`,
  }))
}
```

替换为：

```ts
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitepress'
import { wcModePlugin } from './plugins/wc-mode'
import { listWorkspaces, readWorkspaceMeta } from './workspaces'

export const rootDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')

// 空间名取清单里的 title，读不到就回落目录名
async function buildWorkspaceSidebar() {
  return Promise.all(
    listWorkspaces().map(async (ws) => ({
      text: (await readWorkspaceMeta(ws.id)).title ?? ws.id,
      collapsed: false,
      items: ws.components.map((c) => ({
        text: c.name,
        link: `/workspaces/${ws.id}/${c.name}`,
      })),
    })),
  )
}
```

- [ ] **Step 4: 改 `defineConfig` 的调用形态与 nav / sidebar**

把

```ts
export default defineConfig({
  title: 'easy-webcomp',
```

替换为

```ts
export default defineConfig(async () => ({
  title: 'easy-webcomp',
```

把

```ts
    plugins: [wcModePlugin(resolve(rootDir, 'src/components')), react()],
```

替换为

```ts
    plugins: [wcModePlugin(resolve(rootDir, 'src/workspaces')), react()],
```

把

```ts
    nav: [
      { text: '指南', link: '/guide/' },
      { text: '组件', link: '/components/' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: '指南',
          items: [
            { text: '快速开始', link: '/guide/' },
            { text: '新增一个组件', link: '/guide/authoring' },
            { text: '主题与 token', link: '/guide/theming' },
            { text: '构建与产物', link: '/guide/build' },
          ],
        },
      ],
      '/components/': [{ text: '组件', items: buildComponentSidebar() }],
    },
  },
})
```

替换为

```ts
    nav: [
      { text: '指南', link: '/guide/' },
      { text: '组件', link: '/workspaces/' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: '指南',
          items: [
            { text: '快速开始', link: '/guide/' },
            { text: '新增一个组件', link: '/guide/authoring' },
            { text: '主题与 token', link: '/guide/theming' },
            { text: '构建与产物', link: '/guide/build' },
          ],
        },
      ],
      '/workspaces/': [{ text: '组件', items: await buildWorkspaceSidebar() }],
    },
  },
}))
```

- [ ] **Step 5: 改 `ComponentDemo.vue` 的三个 glob**

在 `docs/.vitepress/theme/components/ComponentDemo.vue` 中，把

```ts
const metaModules = import.meta.glob('@src/components/*/meta.ts', { eager: true }) as Record<
  string,
  { default: MetaShape }
>
const sourceModules = import.meta.glob('@src/components/*/Component.{vue,tsx}', {
  eager: true,
}) as Record<string, { default: unknown }>
```

替换为

```ts
const metaModules = import.meta.glob('@src/workspaces/*/components/*/meta.ts', {
  eager: true,
}) as Record<string, { default: MetaShape }>
const sourceModules = import.meta.glob('@src/workspaces/*/components/*/Component.{vue,tsx}', {
  eager: true,
}) as Record<string, { default: unknown }>
```

该组件的其余逻辑不用动：`dirName(path)` 取 `path.split('/').at(-2)`，在新路径下仍然是组件目录名。

- [ ] **Step 6: 改 `source-style.ts` 的 glob**

在 `docs/.vitepress/theme/components/source-style.ts` 中，把

```ts
const styleModules = import.meta.glob('@src/components/*/style.css', {
```

替换为

```ts
const styleModules = import.meta.glob('@src/workspaces/*/components/*/style.css', {
```

`componentStyle()` 里的 `path.split('/').at(-2) === name` 不用改。

- [ ] **Step 7: 确认插件与配置能跑**

Run: `pnpm run typecheck`
Expected: 无输出、退出码 0

Run: `pnpm run docs:build`
Expected: 此时**仍会失败**，因为 `docs/components/` 下的 md 还引用着 `<ComponentOverview />`，而 `/components/` 的 sidebar 配置已被移除。只要失败原因不是 `wcModePlugin` / `listWorkspaces` / `readWorkspaceMeta` 相关的报错，这一步就算过 —— Task 5、Task 6 会补齐页面。

- [ ] **Step 8: 提交**

```bash
git add docs/.vitepress
git commit -m "refactor: 文档站插件与配置改指工作空间，侧边栏分两层"
```

---

## Task 5: 空间总览页与空间 grid 页

**Files:**
- Create: `docs/.vitepress/theme/components/ComponentCard.vue`
- Create: `docs/.vitepress/theme/components/WorkspaceIndex.vue`
- Create: `docs/.vitepress/theme/components/WorkspaceGrid.vue`
- Create: `docs/workspaces/index.md`
- Create: `docs/workspaces/[ws]/index.md`
- Create: `docs/workspaces/[ws]/index.paths.ts`
- Modify: `docs/.vitepress/theme/index.ts`

- [ ] **Step 1: 写卡片组件**

创建 `docs/.vitepress/theme/components/ComponentCard.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { VPLink } from 'vitepress/theme'

const props = defineProps<{
  ws: string
  name: string
  framework: 'vue' | 'react'
}>()

// VPLink 内部走 VitePress 的 normalizeLink：会按 cleanUrls 决定加不加 .html，
// 并拼上 base。手写 href 在静态托管上会 404。
const href = computed(() => `/workspaces/${props.ws}/${props.name}`)
</script>

<template>
  <VPLink :href="href" class="card">
    <svg
      v-if="framework === 'vue'"
      class="icon"
      viewBox="0 0 261.76 226.69"
      role="img"
      aria-label="Vue"
    >
      <path d="M161.096.001l-30.225 52.351L100.647.001H-.005l130.877 226.69L261.76.001z" fill="#41B883" />
      <path d="M161.096.001l-30.225 52.351L100.647.001H52.346l78.526 136.01L209.665.001z" fill="#34495E" />
    </svg>
    <svg
      v-else
      class="icon"
      viewBox="-11.5 -10.23174 23 20.46348"
      role="img"
      aria-label="React"
    >
      <circle cx="0" cy="0" r="2.05" fill="#61DAFB" />
      <g stroke="#61DAFB" stroke-width="1" fill="none">
        <ellipse rx="11" ry="4.2" />
        <ellipse rx="11" ry="4.2" transform="rotate(60)" />
        <ellipse rx="11" ry="4.2" transform="rotate(120)" />
      </g>
    </svg>
    <span class="name">{{ name }}</span>
  </VPLink>
</template>

<style scoped>
.card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px;
  border: 1px solid var(--ew-color-border);
  border-radius: var(--ew-radius-md);
  color: var(--ew-color-text);
  text-decoration: none;
  transition: border-color 0.2s;
}
.card:hover {
  border-color: var(--ew-color-primary);
}
.icon {
  width: 20px;
  height: 20px;
  flex: none;
}
.name {
  font-size: var(--ew-font-size-md);
  overflow-wrap: anywhere;
}
</style>
```

- [ ] **Step 2: 写空间总览组件**

创建 `docs/.vitepress/theme/components/WorkspaceIndex.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { VPLink } from 'vitepress/theme'

interface WorkspaceMetaShape {
  title?: string
  description?: string
}

const metaModules = import.meta.glob('@src/workspaces/*/workspace.ts', { eager: true }) as Record<
  string,
  { default: WorkspaceMetaShape }
>
const componentModules = import.meta.glob('@src/workspaces/*/components/*/Component.{vue,tsx}', {
  eager: true,
})

// glob 生成的 key 形状是实现细节，只按路径段取值：
// .../workspaces/<ws>/workspace.ts 与 .../workspaces/<ws>/components/<name>/Component.vue
const wsOfMeta = (path: string) => path.split('/').at(-2) ?? ''
const wsOfComponent = (path: string) => path.split('/').at(-4) ?? ''

// 两边取并集：只有清单没组件的空间、以及（手建时）只有组件没清单的空间都要出现
const ids = computed(() => {
  const all = new Set<string>()
  for (const path of Object.keys(metaModules)) all.add(wsOfMeta(path))
  for (const path of Object.keys(componentModules)) all.add(wsOfComponent(path))
  return [...all].filter(Boolean).sort((a, b) => a.localeCompare(b))
})

const workspaces = computed(() =>
  ids.value.map((id) => {
    const meta = Object.entries(metaModules).find(([p]) => wsOfMeta(p) === id)?.[1].default ?? {}
    return {
      id,
      title: meta.title ?? id,
      description: meta.description ?? '',
      count: Object.keys(componentModules).filter((p) => wsOfComponent(p) === id).length,
    }
  }),
)
</script>

<template>
  <p v-if="workspaces.length === 0" class="empty">还没有任何工作空间。</p>
  <div v-else class="grid">
    <VPLink v-for="ws in workspaces" :key="ws.id" :href="`/workspaces/${ws.id}`" class="ws-card">
      <span class="ws-title">{{ ws.title }}</span>
      <span v-if="ws.description" class="ws-desc">{{ ws.description }}</span>
      <span class="ws-count">{{ ws.count }} 个组件</span>
    </VPLink>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
  margin-top: 24px;
}
.ws-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 20px;
  border: 1px solid var(--ew-color-border);
  border-radius: var(--ew-radius-md);
  color: var(--ew-color-text);
  text-decoration: none;
  transition: border-color 0.2s;
}
.ws-card:hover {
  border-color: var(--ew-color-primary);
}
.ws-title {
  font-size: var(--ew-font-size-lg);
  font-weight: 600;
}
.ws-desc {
  color: var(--ew-color-text-secondary);
  font-size: var(--ew-font-size-sm);
}
.ws-count {
  color: var(--ew-color-text-secondary);
  font-size: var(--ew-font-size-sm);
}
.empty {
  color: var(--ew-color-text-secondary);
}
</style>
```

- [ ] **Step 3: 写空间 grid 组件**

创建 `docs/.vitepress/theme/components/WorkspaceGrid.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import ComponentCard from './ComponentCard.vue'

interface WorkspaceMetaShape {
  title?: string
  description?: string
}

const props = defineProps<{ ws: string }>()

const metaModules = import.meta.glob('@src/workspaces/*/workspace.ts', { eager: true }) as Record<
  string,
  { default: WorkspaceMetaShape }
>
const componentModules = import.meta.glob('@src/workspaces/*/components/*/Component.{vue,tsx}', {
  eager: true,
})

const segments = (path: string) => path.split('/')

const meta = computed<WorkspaceMetaShape>(
  () => Object.entries(metaModules).find(([p]) => segments(p).at(-2) === props.ws)?.[1].default ?? {},
)

const components = computed(() =>
  Object.keys(componentModules)
    .filter((p) => segments(p).at(-4) === props.ws)
    .map((p) => ({
      name: segments(p).at(-2) ?? '',
      framework: p.endsWith('.vue') ? ('vue' as const) : ('react' as const),
    }))
    .sort((a, b) => a.name.localeCompare(b.name)),
)
</script>

<template>
  <h1>{{ meta.title ?? ws }}</h1>
  <p v-if="meta.description" class="desc">{{ meta.description }}</p>

  <p v-if="components.length === 0" class="empty">
    这个工作空间下还没有组件。在 <code>src/workspaces/{{ ws }}/components/</code> 下新建一个目录、
    放入五个文件即可，不需要改任何配置。
  </p>
  <div v-else class="grid">
    <ComponentCard
      v-for="c in components"
      :key="c.name"
      :ws="ws"
      :name="c.name"
      :framework="c.framework"
    />
  </div>
</template>

<style scoped>
.desc {
  color: var(--ew-color-text-secondary);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  margin-top: 24px;
}
.empty {
  color: var(--ew-color-text-secondary);
}
</style>
```

- [ ] **Step 4: 写三个 md 页面**

创建 `docs/workspaces/index.md`：

```md
# 组件

每个工作空间是一个独立的组件集合。侧边栏里的组件直接按空间分组列出。

<WorkspaceIndex />
```

创建 `docs/workspaces/[ws]/index.md`：

```md
<WorkspaceGrid :ws="$params.ws" />
```

创建 `docs/workspaces/[ws]/index.paths.ts`：

```ts
import { listWorkspaces } from '../../.vitepress/workspaces'

export default {
  // 保持同步：listWorkspaces 只扫文件系统，所以这里不需要 await
  paths: () => listWorkspaces().map((ws) => ({ params: { ws: ws.id } })),
}
```

> **这两个动态页没有 markdown 级的 `<h1>`**，标题由 `WorkspaceGrid` 在运行时渲染。VitePress 的 `page.title` 是从 markdown 的 h1 token 提取的（`titlePlugin`），拿不到组件渲染出来的东西，所以这两类页面的**浏览器标签页标题会回落到站点名**（页面内的可见标题正常）。这是已知的、可接受的外观损失，不在本次验收范围内；真要修，用 `config.mts` 的 `transformPageData(pageData)` 读 `pageData.params` 去 `readWorkspaceMeta` 补 `title`。

- [ ] **Step 5: 注册全局组件**

把 `docs/.vitepress/theme/index.ts` 替换为：

```ts
import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import '@src/tokens/tokens.css'
import ComponentDemo from './components/ComponentDemo.vue'
import WorkspaceGrid from './components/WorkspaceGrid.vue'
import WorkspaceIndex from './components/WorkspaceIndex.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('ComponentDemo', ComponentDemo)
    app.component('WorkspaceGrid', WorkspaceGrid)
    app.component('WorkspaceIndex', WorkspaceIndex)
  },
} satisfies Theme
```

> `ComponentOverview` 的注册在这里被移除。该文件本身在 Task 6 删除 —— 此时它已无人引用，但 `docs/components/index.md` 还在引用它，所以本任务不要删文件，否则会与 Task 6 的删除撞车。

- [ ] **Step 6: 起 dev 手工确认**

Run: `pnpm run dev`
在浏览器打开 `http://localhost:5173/workspaces/`，确认：

- 页面上有一张 `演示组件` 卡片，写着「2 个组件」
- 点进去，URL 变成 `/workspaces/demo/`，页面标题是「演示组件」，下面两张卡片（`hello-vue` 带绿色 Vue 图标、`hello-react` 带青色 React 图标）
- 左侧边栏「组件」分组下是「演示组件 → hello-vue / hello-react」两层，且默认展开

先不要点卡片 —— 详情页在 Task 6 才补齐，此时点进去会 404。确认完按 Ctrl-C 停掉 dev。

- [ ] **Step 7: 提交**

```bash
git add docs/workspaces docs/.vitepress/theme
git commit -m "feat: 文档站按工作空间浏览，空间与组件都用 grid 展示"
```

---

## Task 6: 组件详情页与散文迁移

**Files:**
- Create: `docs/.vitepress/theme/components/ComponentDetail.vue`
- Create: `docs/workspaces/[ws]/[name].md`
- Create: `docs/workspaces/[ws]/[name].paths.ts`
- Move: `docs/components/hello-vue.md` → `docs/workspaces/demo/hello-vue.md`
- Move: `docs/components/hello-react.md` → `docs/workspaces/demo/hello-react.md`
- Delete: `docs/components/`
- Delete: `docs/.vitepress/theme/components/ComponentOverview.vue`
- Modify: `docs/.vitepress/theme/index.ts`

- [ ] **Step 1: 写兜底详情页组件**

创建 `docs/.vitepress/theme/components/ComponentDetail.vue`：

```vue
<script setup lang="ts">
import ComponentDemo from './ComponentDemo.vue'

defineProps<{ ws: string; name: string }>()
</script>

<template>
  <p class="hint">
    这个组件还没有独立的说明页。下面是它的实时面板 —— 想补散文，新建
    <code>docs/workspaces/{{ ws }}/{{ name }}.md</code> 即可。
  </p>
  <ComponentDemo :name="name" />
</template>

<style scoped>
.hint {
  color: var(--ew-color-text-secondary);
  font-size: var(--ew-font-size-sm);
}
</style>
```

- [ ] **Step 2: 注册它**

把 `docs/.vitepress/theme/index.ts` 替换为：

```ts
import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import '@src/tokens/tokens.css'
import ComponentDemo from './components/ComponentDemo.vue'
import ComponentDetail from './components/ComponentDetail.vue'
import WorkspaceGrid from './components/WorkspaceGrid.vue'
import WorkspaceIndex from './components/WorkspaceIndex.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('ComponentDemo', ComponentDemo)
    app.component('ComponentDetail', ComponentDetail)
    app.component('WorkspaceGrid', WorkspaceGrid)
    app.component('WorkspaceIndex', WorkspaceIndex)
  },
} satisfies Theme
```

- [ ] **Step 3: 写动态兜底详情页**

创建 `docs/workspaces/[ws]/[name].md`：

```md
<ComponentDetail :ws="$params.ws" :name="$params.name" />
```

创建 `docs/workspaces/[ws]/[name].paths.ts`：

```ts
import { listWorkspaces } from '../../.vitepress/workspaces'

export default {
  paths() {
    // 必须排除已写散文的组件：docs/workspaces/<ws>/<name>.md 是静态页，会占掉同一个 URL，
    // 动态路由再生成一遍就是重复路由。
    return listWorkspaces().flatMap((ws) =>
      ws.components
        .filter((c) => !c.documented)
        .map((c) => ({ params: { ws: ws.id, name: c.name } })),
    )
  },
}
```

- [ ] **Step 4: 迁移两篇散文**

```bash
mkdir -p docs/workspaces/demo
git mv docs/components/hello-vue.md docs/workspaces/demo/hello-vue.md
git mv docs/components/hello-react.md docs/workspaces/demo/hello-react.md
git rm docs/components/index.md
git rm docs/.vitepress/theme/components/ComponentOverview.vue
rmdir docs/components
```

- [ ] **Step 5: 改散文里的源码路径**

在 `docs/workspaces/demo/hello-vue.md` 的「说明」一节，把

```md
组件源码在 `src/components/hello-vue/Component.vue`。用哪个框架写不影响最终交付形态 —— 它同样产出一个 `<ew-hello-vue>` 自定义元素。
```

替换为

```md
组件源码在 `src/workspaces/demo/components/hello-vue/Component.vue`。用哪个框架写不影响最终交付形态 —— 它同样产出一个 `<ew-hello-vue>` 自定义元素。
```

在 `docs/workspaces/demo/hello-react.md` 的「说明」一节，把

```md
组件源码在 `src/components/hello-react/Component.tsx`。
```

替换为

```md
组件源码在 `src/workspaces/demo/components/hello-react/Component.tsx`。
```

其余内容（属性表、事件表、用法示例）一律不动。

- [ ] **Step 6: 两种详情页都验一遍**

Run: `pnpm run docs:build`
Expected: 退出码 0

Run: `rm -rf docs/.vitepress/dist && pnpm run docs:build && find docs/.vitepress/dist -name '*.html' | sort`
Expected: 输出里包含

```
docs/.vitepress/dist/index.html
docs/.vitepress/dist/guide/index.html
docs/.vitepress/dist/guide/authoring.html
docs/.vitepress/dist/guide/theming.html
docs/.vitepress/dist/guide/build.html
docs/.vitepress/dist/workspaces/index.html
docs/.vitepress/dist/workspaces/demo/index.html
docs/.vitepress/dist/workspaces/demo/hello-vue.html
docs/.vitepress/dist/workspaces/demo/hello-react.html
```

且**不含**任何 `components/` 下的页面、不含 `superpowers/` 下的页面。

- [ ] **Step 7: 起 dev 确认兜底详情页也能点**

先临时造一个没有散文的组件：

```bash
mkdir -p src/workspaces/demo/components/tmp-probe
printf "import { defineComponentMeta } from '../../../../runtime/types'\n\nexport default defineComponentMeta({ tag: 'ew-tmp-probe', props: {} })\n" > src/workspaces/demo/components/tmp-probe/meta.ts
printf "export default {}\n" > src/workspaces/demo/components/tmp-probe/Component.vue
: > src/workspaces/demo/components/tmp-probe/style.css
printf "export {}\n" > src/workspaces/demo/components/tmp-probe/index.ts
printf "" > src/workspaces/demo/components/tmp-probe/define.ts
```

Run: `pnpm run dev`，浏览器打开 `http://localhost:5173/workspaces/demo/`
Expected: grid 上出现第三张卡片 `tmp-probe`；点进去是兜底详情页，有一句「还没有独立的说明页」的提示和一块（属性为空的）交互面板。确认完 Ctrl-C 停掉，然后：

```bash
rm -rf src/workspaces/demo/components/tmp-probe
```

- [ ] **Step 8: 提交**

```bash
git add -A docs
git commit -m "feat: 组件详情页支持无散文兜底，散文页迁入工作空间目录"
```

---

## Task 7: 文案同步

**Files:**
- Modify: `README.md`
- Modify: `docs/guide/index.md`
- Modify: `docs/guide/authoring.md`
- Modify: `docs/index.md`

- [ ] **Step 1: 改 README 的目录结构说明**

在 `README.md` 中，把

```md
在 `src/components/` 下新建目录，放入五个文件即可，**不需要修改任何构建配置或路由**：

```
src/components/<组件名>/
```

替换为

```md
先在某个工作空间下新建目录，放入五个文件即可，**不需要修改任何构建配置或路由**：

```
src/workspaces/<空间名>/components/<组件名>/
```

并在「## 新增一个组件」这一节之前插入一节：

```md
## 工作空间

组件必须住在工作空间里，没有隐式的默认空间。一个工作空间是一个目录，加一份清单：

```
src/workspaces/
└── demo/
    ├── workspace.ts            # 展示名与描述，供文档站用
    └── components/
        ├── hello-vue/
        └── hello-react/
```

新建一个工作空间：

```bash
pnpm run new:workspace <空间名>
```

目录名即工作空间 id，清单里不重复声明。**新建后要重启 dev** —— VitePress 的动态路由扫不出新目录。

工作空间只是**文件组织单位**，不影响交付：自定义元素 tag、`package.json` 的 `exports` 键、CDN 文件名都不带空间前缀。代价是**组件名必须全局唯一**，撞名时构建会直接报错。
```

- [ ] **Step 2: 改 README 的其它路径引用**

在 `README.md` 中：

- 「没有单独写页面的组件会出现在[组件总览](/components/)里」→「没有单独写页面的组件会在空间页里给出兜底详情页」
- `meta.ts` 示例里的 `from '../../runtime/types'` → `from '../../../../runtime/types'`
- `useEmit` 示例那一行（两个路径写在同一行）里的 `'../../runtime/vue'` 与 `'../../runtime/react'` → 各自改成 `'../../../../runtime/vue'` / `'../../../../runtime/react'`

**是深了两层，不是一层**：组件目录从 `src/components/<组件名>/` 变成 `src/workspaces/<空间名>/components/<组件名>/`。文档里的示例必须与 Task 2 改过的真实源码一致。

- [ ] **Step 3: 改 README 的测试计数**

「验证」那张表里写着 `Vitest + jsdom，7 个文件 46 个用例`。变化的账是：Task 1 加了 `tests/scripts/new-workspace.test.ts`（4 例），Task 3 删掉 `tests/docs/components.test.ts`（5 例）、加上 `tests/docs/workspaces.test.ts`（11 例）。46 + 4 − 5 + 11 = **56 个用例、8 个文件**。先跑一遍确认：

```bash
pnpm run test
```

把那一行改成：

```
| `test` | Vitest + jsdom，8 个文件 56 个用例，覆盖桥接层全部易错点与组件扫描 |
```

**以实际输出为准** —— 若数字与此不符，照实际情况改，并回头确认 Task 1、Task 3 的用例是否都真的加上了。

- [ ] **Step 4: 改 `docs/guide/index.md`**

把

```md
组件写哪个框架由你决定：Vue 组件放 `Component.vue`，React 组件放 `Component.tsx`。构建脚本按文件名自动判别，两者最终产出一致的 `<ew-*>` 自定义元素。
```

替换为

```md
组件写哪个框架由你决定：Vue 组件放 `Component.vue`，React 组件放 `Component.tsx`。构建脚本按文件名自动判别，两者最终产出一致的 `<ew-*>` 自定义元素。

组件必须住在某个**工作空间**下，没有隐式的默认空间 —— 见[新增一个组件](/guide/authoring)。
```

- [ ] **Step 5: 改 `docs/guide/authoring.md`**

把开头的

```md
在 `src/components/` 下新建目录，放入五个文件即可，**不需要修改任何构建配置或路由**：

```
src/components/<组件名>/
```

替换为

```md
## 先建一个工作空间

组件必须属于某个工作空间。工作空间是一个目录 + 一份清单，用脚手架生成：

```bash
pnpm run new:workspace my-space
```

```
src/workspaces/my-space/
├── workspace.ts            # 展示名与描述，供文档站用
└── components/             # 组件都放这里
```

目录名就是工作空间 id，清单里不重复声明。**新建后必须重启 dev** —— VitePress 的动态路由扫不出运行时新出现的目录。

工作空间不影响交付：tag、`npm` 子路径、CDN 文件名都不带空间前缀。代价是**组件名要全局唯一**，两个空间下同名会在构建时报错。

## 再加一个组件

在空间的 `components/` 下新建目录，放入五个文件即可，**不需要修改任何构建配置或路由**：

```
src/workspaces/<空间名>/components/<组件名>/
```

同一页里还有两处相对导入要跟着改（它们指向的是真实源码，深了两层就不是同一个文件了）：

- `meta.ts` 一节的 `import { defineComponentMeta } from '../../runtime/types'` → `'../../../../runtime/types'`
- 派发事件一节的 `import { useEmit } from '../../runtime/vue'   // React 组件改为 '../../runtime/react'` → 两个路径都改成四层，即 `'../../../../runtime/vue'` / `'../../../../runtime/react'`

把「加完之后」一节末尾

```md
不用改导航。构建脚本扫目录生成入口与 `package.json` 的 `exports`；文档站的侧边栏同样扫目录 —— 组件会立刻出现在左侧导航里，链接指向总览页上的那块面板。想给它一页散文，就新建 `docs/components/<组件名>.md`，侧边栏会自动指过去。
```

替换为

```md
不用改导航。构建脚本扫目录生成入口与 `package.json` 的 `exports`；文档站同样扫目录 —— 组件会立刻出现在侧边栏与它所属空间的 grid 里，卡片上有框架图标。还没写散文的组件也点得进去，会看到一个只有交互面板的兜底页。想给它一页散文，新建 `docs/workspaces/<空间名>/<组件名>.md`，下次构建就自动改用那一页。

加完组件不用重启 dev，改完保存即可；只有**新增工作空间**才需要重启。
```

- [ ] **Step 6: 改首页的按钮指向**

在 `docs/index.md` 中，把 hero 的第二个 action

```yaml
    - theme: alt
      text: 组件总览
      link: /components/
```

替换为

```yaml
    - theme: alt
      text: 浏览组件
      link: /workspaces/
```

再把这个 feature

```yaml
  - title: meta.ts 驱动零配置
    details: tag、props、events 写在 meta.ts 里；构建入口、package exports、文档站导航全部自动生成。
    link: /components/
    linkText: 看组件总览
```

替换为

```yaml
  - title: meta.ts 驱动零配置
    details: tag、props、events 写在 meta.ts 里；构建入口、package exports、文档站导航全部自动生成。
    link: /workspaces/
    linkText: 浏览组件
```

**这一处不要引入任何裸尖括号**：`details` 走 `v-html` 且不经 markdown，裸的 `<script>` 会变成真脚本元素并吞掉后面的文档，整站挂掉。要写尖括号就用 `&lt;` / `&gt;` 实体。

- [ ] **Step 7: 全仓搜一遍残留**

Run: `grep -rn "src/components\|@src/components\|docs/components\|/components/" --include="*.ts" --include="*.tsx" --include="*.vue" --include="*.mts" --include="*.md" --include="*.html" . 2>/dev/null | grep -v node_modules | grep -v "/dist/" | grep -v "docs/superpowers" | grep -v "\.vitepress/cache"`
Expected: 无输出

- [ ] **Step 8: 提交**

```bash
git add README.md docs
git commit -m "docs: 全站文案与示例同步到工作空间布局"
```

---

## Task 8: 端到端验收

**Files:** 无（只验证，除发现问题外不改代码）

- [ ] **Step 1: 跑完整验证链**

Run: `pnpm run verify`
Expected: 五项全绿，退出码 0

| 阶段 | 期望 |
|---|---|
| `typecheck` | 无输出 |
| `test` | 全绿（`tests/runtime/*` + `tests/docs/workspaces.test.ts` + `tests/scripts/new-workspace.test.ts`） |
| `build` | 打印三个 CDN 产物的 gzip 体积，与基线量级一致 |
| `docs:build` | 退出码 0 |
| `test:e2e` | 8 个用例全绿 |

- [ ] **Step 2: 验收 spec 第 11 节第 2 条 —— 脚手架与空空间**

```bash
pnpm run new:workspace tmp-ws
pnpm run build
```

Expected: build 退出码 0，日志里只有 `demo/hello-react, demo/hello-vue` 两个组件，不含 `tmp-ws`。

```bash
rm -rf docs/.vitepress/dist && pnpm run docs:build && find docs/.vitepress/dist/workspaces -name '*.html' | sort
```

Expected: 多出 `docs/.vitepress/dist/workspaces/tmp-ws/index.html`。

Run: `pnpm run dev`，打开 `http://localhost:5173/workspaces/`
Expected: 出现第二张空间卡片；点进去是空态文案「这个工作空间下还没有组件…」。Ctrl-C 停掉。

```bash
rm -rf src/workspaces/tmp-ws
pnpm run build
```

Expected: 退出码 0（回到两个组件）。

- [ ] **Step 3: 验收 spec 第 11 节第 3、4 条 —— 浏览器逐项核对**

Run: `pnpm run docs:preview`（先 `pnpm run docs:build`），打开 `http://localhost:4173/`

逐项确认：

- 首页四个 feature 卡片都能点，第二个按钮「浏览组件」跳到 `/workspaces/`
- 左侧边栏「组件」分组下是「**演示组件**」这一层；若显示成 `demo`，说明 `readWorkspaceMeta` 回落了，见 spec 第 12 节风险 6
- `/workspaces/` 是空间 grid
- `/workspaces/demo/` 是组件 grid，两张卡片图标颜色正确（Vue 绿 `#41B883`、React 青 `#61DAFB`）
- 点 `hello-vue` 卡片 → 散文与交互面板都在；面板默认 **WC 模式**；改 `name` 输入框实时生效；点按钮后事件日志出现 `ew-select`
- 点 `hello-react` 卡片 → 同样行为
- 切到源码模式，行为一致
- 浏览器控制台无报错

- [ ] **Step 4: 验收 spec 第 11 节第 5 条 —— 全局重名校验**

```bash
mkdir -p src/workspaces/demo/components/dup-probe src/workspaces/tmp-dup/components/dup-probe
touch src/workspaces/demo/components/dup-probe/Component.vue
touch src/workspaces/tmp-dup/components/dup-probe/Component.vue
pnpm run build
```

Expected: FAIL，报错含 `组件名 "dup-probe" 在 "demo" 与 "tmp-dup" 下重复` 与 `全局唯一`。

```bash
rm -rf src/workspaces/demo/components/dup-probe src/workspaces/tmp-dup
pnpm run build
```

Expected: 退出码 0，报错消失。

- [ ] **Step 5: 验收 spec 第 11 节第 6、7 条 —— 产物与交付契约**

Run: `rm -rf docs/.vitepress/dist && pnpm run docs:build && find docs/.vitepress/dist -name '*.html' | sort`
Expected: 含 `workspaces/index.html`、`workspaces/demo/index.html`、`workspaces/demo/hello-vue.html`、`workspaces/demo/hello-react.html`；**不含**任何 `components/` 或 `superpowers/` 下的页面。

Run: `node -e "console.log(Object.keys(require('./package.json').exports).join('\n'))"`
Expected: 与 Task 2 Step 7 列出的九个键逐字一致。

Run: `ls dist/cdn`
Expected: 只有 `ew-all.js`、`hello-react.js`、`hello-vue.js` —— **没有** `demo` 之类的空间目录或带前缀的文件名。（`dist/` 被 gitignore，所以这里用 `ls` 而不是 `git diff`。）

- [ ] **Step 6: 确认工作区干净**

Run: `git status --short`
Expected: 无输出（步骤 2、4 造的临时目录都已删除）

- [ ] **Step 7: 提交（如有残留改动）**

若上面任何一步产生了需要固化的改动（例如修掉了文案里的残留路径），提交它：

```bash
git add -A
git commit -m "chore: 工作空间改造的收尾修正"
```

若 `git status` 已经干净，跳过这一步。

---

## 收尾

全部任务完成后，分支上应有一串按 Task 划分的提交。**不要推送、不要建远端、不要合并** —— 由使用者自己处理。

实施中途若发现 spec 与代码现实不符（尤其是 Task 3 Step 4 备注里那条 `tsImport` 的退路，以及 spec 第 12 节风险 6），**回头改 spec 再继续**，不要把偏离留在代码里不说。
