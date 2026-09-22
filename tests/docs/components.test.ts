import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listComponents } from '../../docs/.vitepress/components'

let root: string

function makeComponent(name: string, files: string[]): void {
  mkdirSync(join(root, 'components', name), { recursive: true })
  for (const file of files) writeFileSync(join(root, 'components', name, file), '')
}

const scan = () => listComponents(join(root, 'components'), join(root, 'docs/components'))

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ctc-docs-'))
  mkdirSync(join(root, 'docs/components'), { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('listComponents', () => {
  it('识别框架并按目录名排序', () => {
    makeComponent('b-react', ['Component.tsx'])
    makeComponent('a-vue', ['Component.vue'])
    expect(scan()).toEqual([
      { name: 'a-vue', framework: 'vue', documented: false },
      { name: 'b-react', framework: 'react', documented: false },
    ])
  })

  it('docs/components/<name>.md 存在时 documented 为 true', () => {
    makeComponent('a-vue', ['Component.vue'])
    writeFileSync(join(root, 'docs/components/a-vue.md'), '')
    expect(scan()[0]?.documented).toBe(true)
  })

  it('Component.vue 与 Component.tsx 同时存在时抛错', () => {
    makeComponent('both', ['Component.vue', 'Component.tsx'])
    expect(scan).toThrow(/必须且只能有一个/)
  })

  it('两者都不存在时抛错', () => {
    makeComponent('neither', [])
    expect(scan).toThrow(/必须且只能有一个/)
  })

  it('忽略非目录条目', () => {
    mkdirSync(join(root, 'components'), { recursive: true })
    writeFileSync(join(root, 'components/README.md'), '')
    makeComponent('a-vue', ['Component.vue'])
    expect(scan().map((c) => c.name)).toEqual(['a-vue'])
  })
})
