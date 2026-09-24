import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureLocalConfig, LOCAL_CONFIG_PATH } from '../../devtools/shared/local-config'

let dir: string
const file = () => join(dir, 'config.local.ts')

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ew-local-config-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('ensureLocalConfig', () => {
  it('文件不存在时落一份模板', () => {
    ensureLocalConfig(file())
    expect(readFileSync(file(), 'utf8')).toContain('export default {} satisfies Partial<EwConfig>')
  })

  it('模板不预置任何地址 —— 预置一个就是替所有人猜，猜错是整站 404', () => {
    ensureLocalConfig(file())
    const source = readFileSync(file(), 'utf8')
    // 示例写在注释里，真值一个都不给
    expect(source).not.toMatch(/^\s*baseURL:/m)
    expect(source).not.toMatch(/^\s*auth:/m)
  })

  it('已经存在就一个字都不动 —— 那是开发者填过的本机地址', () => {
    const mine = "export default { baseURL: 'https://mine.example.com' }\n"
    writeFileSync(file(), mine)
    ensureLocalConfig(file())
    expect(readFileSync(file(), 'utf8')).toBe(mine)
  })

  it('落盘位置与 .gitignore 那条对得上', () => {
    // vite.config.ts 拼的是仓库根 + LOCAL_CONFIG_PATH。改了这个常量却忘了同步 .gitignore，
    // 每个开发者就会把自己的后端地址提交上去 —— 正是这份文件要避免的事。
    const ignored = readFileSync(join(process.cwd(), '.gitignore'), 'utf8').split('\n')
    expect(ignored).toContain(LOCAL_CONFIG_PATH)
  })
})
