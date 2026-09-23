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
    expect(pkg.exports).toEqual({
      '.': './esm/index.js',
      './*': './esm/*.js',
      './vue': './framework/vue.js',
    })
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
