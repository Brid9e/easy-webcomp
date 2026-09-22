// @vitest-environment node
// readWorkspaceMeta 经 tsx 加载清单，而 tsx 依赖 esbuild。jsdom 环境下 esbuild 无法初始化：
// 它的 TextEncoder 返回的是别的 realm 的 Uint8Array，触发 esbuild 启动时的
// "new TextEncoder().encode(\"\") instanceof Uint8Array" 不变式失败。所以本文件必须跑在 node 环境。
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
  // 临时目录里放一个 package.json 复刻真实项目的模块类型：项目根是 "type": "module"，
  // src/workspaces/<id>/workspace.ts 因此被 tsx 当 ESM 加载，mod.default 就是清单本身。
  // 少了它，tsx 会把清单当 CJS 转译，mod.default 变成 { default: {...} }（多包一层）。
  writeFileSync(join(root, 'package.json'), '{"type":"module"}\n')
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
