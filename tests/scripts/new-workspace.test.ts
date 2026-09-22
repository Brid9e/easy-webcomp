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

  it('title 预填目录名，description 留空，并用 satisfies 校验类型', () => {
    createWorkspace(root, 'demo')
    const source = readFileSync(join(root, 'src/workspaces/demo/workspace.ts'), 'utf8')
    expect(source).toContain("import type { WorkspaceMeta } from '../define'")
    expect(source).toContain('satisfies WorkspaceMeta')
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
