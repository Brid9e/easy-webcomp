import { describe, expect, it } from 'vitest'
import {
  bareSpecifiersOf,
  packageNameOf,
  workspacePackageJson,
} from '../../scripts/workspace-packages'

describe('packageNameOf', () => {
  it('空间目录名进 @ew scope，与 @ew/runtime、@ew/utils 一致', () => {
    expect(packageNameOf('self-monitor')).toBe('@ew/self-monitor')
  })
})

describe('bareSpecifiersOf', () => {
  it('取包名：scoped 留两段，子路径砍掉', () => {
    const code = `
import { a } from "vue";
import "react-dom/client";
import { b } from "element-plus/es/locale/lang/zh-cn";
import { c } from "@ew/runtime";
`
    expect(bareSpecifiersOf(code)).toEqual(['@ew/runtime', 'element-plus', 'react-dom', 'vue'])
  })

  it('相对路径与绝对路径不是包，丢掉', () => {
    expect(bareSpecifiersOf('import "./style-DMkl47vG.js";\nimport "/abs.js";')).toEqual([])
  })

  it('同一个包出现多次只算一个', () => {
    expect(bareSpecifiersOf('export { a } from "vue";\nimport { b } from "vue";')).toEqual(['vue'])
  })

  it('压缩产物的 }from"vue" 形态照样认得出', () => {
    expect(bareSpecifiersOf('import{a}from"vue";import"pinia";')).toEqual(['pinia', 'vue'])
  })

  it('字符串字面量里的 "from" 不算导入 —— axios 的禁用请求头清单里就有', () => {
    // 真实踩到过：`"from",\n  "host"` 被 `\b(?:from|import)\s*["']` 当成 `from ",\n  "`，
    // 于是反推出一个叫 ",\n  " 的包，构建失败。
    const code = 'const forbidden = [\n  "age",\n  "from",\n  "host"\n];'
    expect(bareSpecifiersOf(code)).toEqual([])
  })
})

describe('workspacePackageJson', () => {
  const base = {
    workspace: 'demo',
    version: '0.1.0',
    private: true,
    versions: { vue: '^3.5.0', react: '^19.0.0', 'react-dom': '^19.0.0' },
  }

  it('只有该空间真有产物的框架才出 ./vue ./react', () => {
    const pkg = workspacePackageJson({ ...base, frameworks: ['vue'], externals: ['vue'] })
    expect(pkg.name).toBe('@ew/demo')
    expect(pkg.version).toBe('0.1.0')
    expect(pkg.private).toBe(true)
    expect(pkg.type).toBe('module')
    expect(pkg.types).toBe('./esm/index.d.ts')
    // 每条都是条件对象且 types 排在前：裸字符串没有 types 条件，消费方的 tsc 会报 TS7016
    expect(pkg.exports).toEqual({
      '.': { types: './esm/index.d.ts', default: './esm/index.js' },
      './*': { types: './esm/*.d.ts', default: './esm/*.js' },
      './vue': { types: './framework/vue.d.ts', default: './framework/vue.js' },
    })
  })

  it('产物有样式表时导出 ./styles.css，指向空间根上那个文件', () => {
    const pkg = workspacePackageJson({
      ...base,
      frameworks: ['vue'],
      externals: ['vue'],
      hasCss: true,
    })
    expect(pkg.exports).toHaveProperty('./styles.css', './styles.css')
  })

  it('没有样式表就不出 ./styles.css —— 那条导出会解析到不存在的文件', () => {
    const pkg = workspacePackageJson({ ...base, frameworks: ['vue'], externals: ['vue'] })
    expect(pkg.exports).not.toHaveProperty('./styles.css')
  })

  it('外部依赖一律声明成 optional peer', () => {
    const pkg = workspacePackageJson({
      ...base,
      frameworks: ['vue', 'react'],
      externals: ['react', 'react-dom', 'vue'],
    })
    expect(pkg.peerDependencies).toEqual({
      react: '^19.0.0',
      'react-dom': '^19.0.0',
      vue: '^3.5.0',
    })
    expect(pkg.peerDependenciesMeta).toEqual({
      react: { optional: true },
      'react-dom': { optional: true },
      vue: { optional: true },
    })
  })

  it('没有外部依赖时不写 peer 三兄弟', () => {
    const pkg = workspacePackageJson({ ...base, frameworks: ['vue'], externals: [] })
    expect(pkg).not.toHaveProperty('peerDependencies')
    expect(pkg).not.toHaveProperty('peerDependenciesMeta')
  })

  it('根包没有版本的依赖直接报错，不静默写个空串', () => {
    expect(() =>
      workspacePackageJson({ ...base, frameworks: ['vue'], externals: ['lodash'] }),
    ).toThrow('lodash')
  })
})
