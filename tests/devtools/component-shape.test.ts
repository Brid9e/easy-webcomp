import { describe, expect, it } from 'vitest'
import type { ComponentMeta } from '@ew/runtime'
import {
  buildComponents,
  buildGroups,
  buildWorkspaceTitles,
} from '../../devtools/shared/component-shape'

function metaOf(tag: string): ComponentMeta {
  return { tag }
}

describe('buildComponents', () => {
  // glob 的 key 前缀随使用者配置而变（别名 / 相对 / 绝对），段位下标不能跟着变
  it.each(['@src', '../src', '/repo/src', 'src'])(
    'key 前缀写作 %s 时，组件名与空间名取法不变',
    (prefix) => {
      const [entry] = buildComponents(
        { [`${prefix}/workspaces/demo/components/hello-vue/Component.vue`]: { default: {} } },
        { [`${prefix}/workspaces/demo/components/hello-vue/meta.ts`]: { default: metaOf('ew-x') } },
      )

      expect(entry).toMatchObject({ name: 'hello-vue', workspace: 'demo', framework: 'vue' })
    },
  )

  it('按源码文件后缀判框架', () => {
    const built = buildComponents(
      {
        'src/workspaces/demo/components/a/Component.tsx': { default: {} },
        'src/workspaces/demo/components/b/Component.vue': { default: {} },
      },
      {},
    )

    expect(built.map((c) => [c.name, c.framework])).toEqual([
      ['a', 'react'],
      ['b', 'vue'],
    ])
  })

  it('缺 meta.ts 的组件仍在列表里，只是没有 tag 与属性', () => {
    const built = buildComponents(
      {
        'src/workspaces/demo/components/has-meta/Component.vue': { default: {} },
        'src/workspaces/demo/components/no-meta/Component.vue': { default: {} },
      },
      { 'src/workspaces/demo/components/has-meta/meta.ts': { default: metaOf('ew-has') } },
    )

    const byName = Object.fromEntries(built.map((c) => [c.name, c.meta]))
    expect(byName['has-meta']).toEqual(metaOf('ew-has'))
    expect(byName['no-meta']).toBeUndefined()
  })

  // meta 与源码只按组件名配对，不看空间 —— 能这么写是因为名字全局唯一：
  // docs/.vitepress/workspaces.ts 遇到跨空间重名会直接抛错（tag 与 exports 都不带空间前缀）。
  it('跨空间也能按名字配上各自的 meta', () => {
    const built = buildComponents(
      {
        'src/workspaces/a/components/alpha/Component.vue': { default: {} },
        'src/workspaces/b/components/beta/Component.vue': { default: {} },
      },
      {
        'src/workspaces/a/components/alpha/meta.ts': { default: metaOf('ew-alpha') },
        'src/workspaces/b/components/beta/meta.ts': { default: metaOf('ew-beta') },
      },
    )

    expect(Object.fromEntries(built.map((c) => [c.name, c.meta]))).toEqual({
      alpha: metaOf('ew-alpha'),
      beta: metaOf('ew-beta'),
    })
  })

  it('source 带上源码模块的默认导出', () => {
    const mod = { default: { marker: 'the component' } }
    const [entry] = buildComponents(
      { 'src/workspaces/demo/components/a/Component.vue': mod },
      {},
    )

    expect(entry?.source).toBe(mod.default)
  })
})

describe('buildWorkspaceTitles', () => {
  it('取 workspace.ts 的 title，取不到回落目录名', () => {
    const titles = buildWorkspaceTitles({
      'src/workspaces/demo/workspace.ts': { default: { title: '演示空间' } },
      'src/workspaces/bare/workspace.ts': { default: {} },
    })

    expect(titles.get('demo')).toBe('演示空间')
    expect(titles.get('bare')).toBe('bare')
  })
})

describe('buildGroups', () => {
  it('按空间分组，标题来自 titles，缺标题时回落空间 id', () => {
    const groups = buildGroups(
      [
        { name: 'a', workspace: 'demo', framework: 'vue', meta: undefined, source: {} },
        { name: 'b', workspace: 'demo', framework: 'react', meta: undefined, source: {} },
        { name: 'c', workspace: 'other', framework: 'vue', meta: undefined, source: {} },
      ],
      new Map([['demo', '演示空间']]),
    )

    expect(groups.map((g) => [g.id, g.title, g.items.map((i) => i.name)])).toEqual([
      ['demo', '演示空间', ['a', 'b']],
      ['other', 'other', ['c']],
    ])
  })
})
