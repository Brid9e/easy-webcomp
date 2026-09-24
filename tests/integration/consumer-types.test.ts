import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * 消费方视角的类型检查：把 dist/<空间> 软链进一个临时项目，让 tsc 走**真实解析路径** ——
 * 读空间包的 package.json、按 exports 里的 types 条件找声明文件。
 *
 * 临时目录必须落在仓库的 node_modules/ 下：从它往上找 node_modules 会命中仓库根那份，
 * 声明里的 `import type { DefineComponent } from 'vue'` 因此能解析到，不必逐个软链依赖。
 *
 * 换成在 tsconfig 里写 paths 直指 dist/<空间>/esm/index.d.ts 就绕开了这次要验的那段接线
 * （exports 的 types 条件、清单里的 types 字段），声明文件全丢了测试也照样绿。
 */
const CONSUMER = `
import { MyList } from '@ew/self-monitor'
import { MyList as MyListVue, type MyListProps } from '@ew/self-monitor/vue'
import '@ew/self-monitor/my-list/define'
import { HelloReact, type HelloReactProps } from '@ew/demo/react'
import { HelloVue, type HelloVueProps } from '@ew/demo/vue'
import { HelloVueElement } from '@ew/demo/hello-vue'
import { configure, getConfig, type EwConfig } from '@ew/self-monitor/config'

// 命名空间桶：meta 是对象不是 any，register 是函数
const tag: string = MyList.meta.tag
const events: string[] = MyList.meta.events ?? []
MyList.register()

// ESM 单组件入口的 Element 构造器挂了 refresh()
HelloVueElement.refresh()

// 事件回调也要能写在 props 字面量里 —— 声明里漏掉 on* 时，这一行就是那道回归的哨兵
const vueProps: HelloVueProps = { name: 'World', count: 3, onSelect: (detail) => void detail }
const reactProps: HelloReactProps = {
  name: 'World',
  autoLoad: true,
  onSelect: (detail) => void detail,
}
const listProps: MyListProps = { label: '我的列表' }

// 配置入口：类型与函数都要拿得到，退化成 any 这条就红
const config: EwConfig = {
  baseURL: 'https://api.example.com',
  timeout: 3_000,
  headers: { 'x-tenant': 'a' },
}
configure(config)
const readBack: EwConfig = getConfig()

export const used = [
  MyListVue,
  HelloVue,
  HelloReact,
  tag,
  events,
  vueProps,
  reactProps,
  listProps,
  readBack,
]
`

const TSCONFIG = {
  compilerOptions: {
    target: 'ES2022',
    lib: ['ES2022', 'DOM'],
    module: 'ESNext',
    moduleResolution: 'bundler',
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    jsx: 'react-jsx',
  },
  include: ['consumer.ts'],
}

function tscOn(dir: string): string {
  // 不用 import.meta.resolve：vitest 的 SSR 转换把它换掉了，运行时不是函数
  const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc')
  const result = spawnSync(process.execPath, [tsc, '-p', dir], { encoding: 'utf8' })
  if (result.error) throw result.error
  return `${result.stdout}${result.stderr}`
}

describe('空间包的类型声明', () => {
  it('消费方 import 得到类型，不是隐式 any', () => {
    const dir = mkdtempSync(join(root, 'node_modules/.ew-consumer-'))
    try {
      const scopeDir = join(dir, 'node_modules/@ew')
      mkdirSync(scopeDir, { recursive: true })
      for (const workspace of ['demo', 'self-monitor']) {
        symlinkSync(join(root, 'dist', workspace), join(scopeDir, workspace), 'dir')
      }
      writeFileSync(join(dir, 'consumer.ts'), CONSUMER)
      writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify(TSCONFIG, null, 2))

      expect(tscOn(dir)).toBe('')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
