/**
 * 空间包（`dist/<空间>/package.json`）的生成规则。
 *
 * 单独成模块而不是写在 build.ts 里：build.ts 顶层就调 main()，import 它等于跑一次完整
 * 构建，没法单测。这里三个函数都是纯的。
 */

export interface WorkspacePackageInput {
  /** 空间目录名，如 self-monitor */
  workspace: string
  /** 继承根包版本，全仓库锁步 */
  version: string
  /** 继承根包。不是 true 时不出这个字段 */
  private?: boolean
  /** 该空间真有框架产物的框架 —— 决定出不出 ./vue / ./react */
  frameworks: ReadonlyArray<'vue' | 'react'>
  /** 从 dist/<空间>/framework/*.js 扫出来的包名，调用方去重后传入 */
  externals: readonly string[]
  /** 版本来源：根包的 peerDependencies ⊕ dependencies */
  versions: Readonly<Record<string, string>>
}

/** 空间目录名 → 包名。与 @ew/runtime、@ew/utils 同一个 scope。 */
export function packageNameOf(workspace: string): string {
  return `@ew/${workspace}`
}

/** `@scope/name/sub` → `@scope/name`；`name/sub` → `name` */
function packageRootOf(specifier: string): string {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

/**
 * 从产物代码里抽出裸说明符的包名，去重排序。
 *
 * **不能只写 `\b(?:from|import)\s*["']`** —— 那会在字符串字面量内部误命中。实测踩到过：
 * axios 的禁用请求头清单里有 `"from"` 与 `"host"` 两个字符串，`"from",\n  "host"` 被当成
 * 一句 `from ",\n  "`，于是反推出一个叫 `,\n  ` 的包，构建直接失败。所以加两条约束：
 * from/import 前面不是引号也不是标识符字符（`(?<!["'\w])`），且捕获到的说明符里没有空白。
 * 压缩产物里真实的导入长 `}from"vue"`，前一个字符是 `}`，照样认得出。
 *
 * 相对路径与绝对路径不是包，丢掉。
 *
 * check-artifacts.ts 的 stripSpecifiers 用**同一条**前缀约束 —— 那边抹掉说明符好数运行时
 * 标记，这边留下说明符好反推依赖。两处必须同步，否则同一个误命中会在一处被忽略、在另一处
 * 又被抹掉。
 */
export function bareSpecifiersOf(code: string): string[] {
  const found = new Set<string>()
  for (const match of code.matchAll(/(?<!["'\w])(?:from|import)\s*["']([^"'\s]+)["']/g)) {
    const specifier = match[1]
    if (specifier.startsWith('.') || specifier.startsWith('/')) continue
    found.add(packageRootOf(specifier))
  }
  return [...found].sort()
}

/**
 * 空间包的 package.json。
 *
 * 依赖声明成 peer 而不是 dependency：frameworkExternals 那张表的存在理由就是「宿主必须
 * 带同一份实例」（见 build.ts 里那段注释）。声明成 dependency 会让包管理器自动装第二份，
 * 正好制造该表要防的事故。一律 optional —— Vue 项目不该因为没装 React 而告警。
 */
export function workspacePackageJson(input: WorkspacePackageInput): Record<string, unknown> {
  const exports: Record<string, string> = {
    '.': './esm/index.js',
    './*': './esm/*.js',
  }
  for (const framework of ['vue', 'react'] as const) {
    if (input.frameworks.includes(framework)) {
      exports[`./${framework}`] = `./framework/${framework}.js`
    }
  }

  const peerDependencies: Record<string, string> = {}
  for (const name of input.externals) {
    const version = input.versions[name]
    if (version === undefined) {
      throw new Error(
        `[build] ${packageNameOf(input.workspace)} 的产物引了 "${name}"，` +
          '但根 package.json 的 peerDependencies / dependencies 里没有它的版本',
      )
    }
    peerDependencies[name] = version
  }

  const manifest: Record<string, unknown> = {
    name: packageNameOf(input.workspace),
    version: input.version,
  }
  if (input.private === true) manifest.private = true
  manifest.type = 'module'
  manifest.exports = exports
  if (input.externals.length > 0) {
    manifest.peerDependencies = peerDependencies
    manifest.peerDependenciesMeta = Object.fromEntries(
      input.externals.map((name) => [name, { optional: true }]),
    )
  }

  return manifest
}
