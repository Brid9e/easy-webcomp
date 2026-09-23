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
    expect(existsSync(join(root, 'packages/workspaces/demo/workspace.ts'))).toBe(true)
    expect(existsSync(join(root, 'packages/workspaces/demo/components/.gitkeep'))).toBe(true)
  })

  it('生成 styles/index.scss，写明空间级共享样式的用法', () => {
    createWorkspace(root, 'demo')
    const scss = readFileSync(join(root, 'packages/workspaces/demo/styles/index.scss'), 'utf8')
    // 注释里那行用法是使用者唯一能发现这条约定的地方，不应让它悄然消失
    expect(scss).toContain("@use 'demo/styles' as styles")
    expect(scss).toContain('$gutter')
    expect(scss).toContain('@mixin focus-ring')
  })

  it('生成包名 @ew/<空间名> 的 package.json，供构建期取版本与依赖', () => {
    createWorkspace(root, 'demo')
    const manifest = JSON.parse(
      readFileSync(join(root, 'packages/workspaces/demo/package.json'), 'utf8'),
    )
    expect(manifest.name).toBe('@ew/demo')
    expect(manifest.private).toBe(true)
    // 组件的 index.ts 引 runtime、workspace.ts 引 utils，缺了就要靠根包的 node_modules 兜底
    expect(manifest.dependencies['@ew/runtime']).toBe('workspace:*')
    expect(manifest.dependencies['@ew/utils']).toBe('workspace:*')
  })

  it('title 预填目录名，description 留空，并从 @ew/utils 取 defineWorkspace', () => {
    createWorkspace(root, 'demo')
    const source = readFileSync(join(root, 'packages/workspaces/demo/workspace.ts'), 'utf8')
    // 走裸说明符而不是相对路径：空间挪层级时清单文件不该跟着改
    expect(source).toContain("import { defineWorkspace } from '@ew/utils'")
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
