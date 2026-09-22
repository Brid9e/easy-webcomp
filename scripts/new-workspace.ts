import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const NAME_RE = /^[a-z][a-z0-9-]*$/

function template(name: string): string {
  return `import { defineWorkspace } from '../define'

export default defineWorkspace({
  title: '${name}',
  description: '',
})
`
}

/**
 * 空间级共享样式的落点：变量与 mixin 放在这里，组件以 `@use '<空间>/styles'` 取用。
 * 文件本身不产生任何 CSS，但注释里的用法得留着 —— 这是使用者唯一能发现这条约定
 * 的地方，否则它就是一个没人知道存在的空文件。demo/styles/index.scss 是同内容。
 */
function stylesTemplate(name: string): string {
  return `// ${name} 空间的共享样式：变量与 mixin 写这里，组件按需取用。
//
//   @use '${name}/styles' as styles;
//   .foo { padding: styles.$gutter; @include styles.focus-ring; }
//
// loadPaths 已指向 src/workspaces，所以写空间名而不是相对路径 —— 组件挪到更深层级也不用改。

$gutter: 8px;

@mixin focus-ring {
  outline: 2px solid var(--ew-color-primary, #1677ff);
  outline-offset: 2px;
}
`
}

export function createWorkspace(targetRoot: string, name: string): string {
  if (!NAME_RE.test(name)) {
    throw new Error(
      `[new:workspace] 目录名不合法："${name}"。只允许小写字母、数字与连字符，且以字母开头`,
    )
  }

  const wsDir = join(targetRoot, 'src/workspaces', name)
  if (existsSync(wsDir)) {
    throw new Error(`[new:workspace] 已存在：src/workspaces/${name}`)
  }

  mkdirSync(join(wsDir, 'components'), { recursive: true })
  mkdirSync(join(wsDir, 'styles'), { recursive: true })
  writeFileSync(join(wsDir, 'workspace.ts'), template(name))
  writeFileSync(join(wsDir, 'components/.gitkeep'), '')
  writeFileSync(join(wsDir, 'styles/index.scss'), stylesTemplate(name))
  return wsDir
}

function main(): void {
  const name = process.argv[2]
  if (!name) {
    throw new Error('[new:workspace] 用法：pnpm run new:workspace <name>')
  }

  createWorkspace(root, name)

  console.log(`[new:workspace] 已创建 src/workspaces/${name}/`)
  console.log('  下一步：')
  console.log(`    1. 编辑 src/workspaces/${name}/workspace.ts 的 title 与 description`)
  console.log(`    2. 空间共享的变量与 mixin 放 src/workspaces/${name}/styles/index.scss`)
  console.log(`    3. 在 src/workspaces/${name}/components/ 下新建组件目录（五个文件，零配置）`)
  console.log('    4. 重启 dev（pnpm run dev）—— 页面清单与侧边栏在启动时就定好了')
}

// 只有被当作脚本直接执行时才跑 CLI。被测试 import 时 process.argv[1] 是 vitest 的可执行文件。
// 比较解析后的文件路径而不是 `import.meta.url` 字符串：tsx 下后者可能带 query，
// 字符串一不等 CLI 就静默不执行 —— 那是比报错更难查的失败。
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
