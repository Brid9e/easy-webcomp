import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findIcon, packagesInUse } from '../../scripts/icons'

describe('findIcon', () => {
  /** 一张 prefix → 命中表；没写进去的 prefix 就是「那个集合里没有」 */
  const searchFrom = (hits: Record<string, string>) => async (prefix: string, term: string) =>
    hits[`${prefix}:${term}`]

  it('devicon 命中就不再看后面两个 —— 顺序是按彩色 logo 的质量排的', async () => {
    const search = searchFrom({ 'devicon:vue': 'devicon:vuejs', 'logos:vue': 'logos:vue' })
    expect(await findIcon('vue', search)).toEqual({ icon: 'devicon:vuejs', prefix: 'devicon' })
  })

  it('devicon 没有就落到 logos，再没有才到 simple-icons', async () => {
    const logos = searchFrom({ 'logos:axios': 'logos:axios' })
    expect(await findIcon('axios', logos)).toEqual({ icon: 'logos:axios', prefix: 'logos' })

    const simple = searchFrom({ 'simple-icons:dayjs': 'simple-icons:dayjs' })
    expect(await findIcon('dayjs', simple)).toEqual({
      icon: 'simple-icons:dayjs',
      prefix: 'simple-icons',
    })
  })

  it('三个集合都没有时返回 undefined，调用方回落到占位图标', async () => {
    expect(await findIcon('no-such-lib', searchFrom({}))).toBeUndefined()
  })

  it('搜不到的包按别名搜 —— react-dom 的标记与 react 是同一份', async () => {
    const seen: string[] = []
    const search = async (_prefix: string, term: string) => {
      seen.push(term)
      return 'devicon:react'
    }
    await findIcon('react-dom', search)
    expect(seen).toEqual(['react'])
  })

  it('ant-design-vue 同理，照 ant-design 搜才搜得到', async () => {
    const seen: string[] = []
    await findIcon('ant-design-vue', async (_prefix, term) => {
      seen.push(term)
      return 'logos:ant-design'
    })
    expect(seen).toEqual(['ant-design'])
  })
})

describe('packagesInUse', () => {
  let workspacesDir: string

  beforeEach(() => {
    workspacesDir = mkdtempSync(join(tmpdir(), 'ew-icons-'))
  })

  afterEach(() => {
    rmSync(workspacesDir, { recursive: true, force: true })
  })

  /** 造一个空间：workspace.ts 是空间的判据，没有它这个目录不算空间 */
  function makeWorkspace(id: string): string {
    const dir = join(workspacesDir, id)
    mkdirSync(join(dir, 'components'), { recursive: true })
    writeFileSync(join(dir, 'workspace.ts'), 'export default {}\n')
    return dir
  }

  function writeManifest(dir: string, manifest: Record<string, unknown>): void {
    writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
  }

  it('从组件源码里抽包名，与空间清单里的依赖合并', () => {
    const dir = makeWorkspace('demo')
    const componentDir = join(dir, 'components/my-card')
    mkdirSync(componentDir)
    writeFileSync(componentDir + '/index.ts', 'import { ref } from "vue"\nimport css from "./style.scss"\n')
    writeFileSync(componentDir + '/meta.ts', 'import { x } from "axios"\n')
    writeManifest(dir, { devDependencies: { tailwindcss: '^4' }, dependencies: { pinia: '^2' } })

    expect(packagesInUse(workspacesDir)).toEqual(['axios', 'pinia', 'tailwindcss', 'vue'])
  })

  it('@ew/* 与 @types/* 不进集合 —— 前者随产物内联，后者只是类型', () => {
    const dir = makeWorkspace('demo')
    const componentDir = join(dir, 'components/my-card')
    mkdirSync(componentDir)
    writeFileSync(componentDir + '/index.ts', 'import { a } from "@ew/runtime"\nimport { b } from "vue"\n')
    writeManifest(dir, { devDependencies: { '@types/node': '^26' } })

    expect(packagesInUse(workspacesDir)).toEqual(['vue'])
  })

  it('组件目录只管 ts/tsx/vue，style.css 之类的样式文件不扫', () => {
    const dir = makeWorkspace('demo')
    const componentDir = join(dir, 'components/my-card')
    mkdirSync(componentDir)
    // 样式表里也可能出现 import 形态的文本，但它不是依赖来源
    writeFileSync(componentDir + '/style.css', '@import "tailwindcss";\n')

    expect(packagesInUse(workspacesDir)).toEqual([])
  })

  it('只看组件目录的直接子目录，散在 components/ 下的文件不算组件', () => {
    const dir = makeWorkspace('demo')
    writeFileSync(join(dir, 'components/loose.ts'), 'import "vue"\n')

    expect(packagesInUse(workspacesDir)).toEqual([])
  })

  it('没有 workspace.ts 的目录不是空间，整个跳过', () => {
    const dir = join(workspacesDir, 'not-a-space')
    mkdirSync(join(dir, 'components/my-card'), { recursive: true })
    writeManifest(dir, { dependencies: { vue: '^3' } })

    expect(packagesInUse(workspacesDir)).toEqual([])
  })
})
