import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createComponent, type ComponentSpec } from '../../scripts/new-component'

let root: string

const wsDir = (name: string) => join(root, 'packages/workspaces', name)

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ew-new-comp-'))
  mkdirSync(join(wsDir('demo'), 'components'), { recursive: true })
  writeFileSync(join(wsDir('demo'), 'workspace.ts'), 'export default {}\n')
  writeFileSync(join(wsDir('demo'), 'package.json'), '{"name":"@ew/demo"}\n')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const dirOf = (name: string) => join(wsDir('demo'), 'components', name)
const read = (name: string, file: string) => readFileSync(join(dirOf(name), file), 'utf8')

function spec(overrides: Partial<ComponentSpec> = {}): ComponentSpec {
  return { workspace: 'demo', name: 'my-card', framework: 'vue', addons: [], ...overrides }
}

describe('createComponent · 基础骨架', () => {
  it('Vue：生成五件套，没有 Component.tsx', () => {
    createComponent(root, spec())
    for (const f of ['Component.vue', 'meta.ts', 'style.scss', 'index.ts', 'define.ts']) {
      expect(existsSync(join(dirOf('my-card'), f)), f).toBe(true)
    }
    expect(existsSync(join(dirOf('my-card'), 'Component.tsx'))).toBe(false)
  })

  it('React：生成 Component.tsx，没有 Component.vue', () => {
    createComponent(root, spec({ framework: 'react' }))
    expect(existsSync(join(dirOf('my-card'), 'Component.tsx'))).toBe(true)
    expect(existsSync(join(dirOf('my-card'), 'Component.vue'))).toBe(false)
    expect(read('my-card', 'index.ts')).toContain("from './Component'")
  })

  it('tag 是 ew-<name>，默认开 shadow', () => {
    createComponent(root, spec())
    const meta = read('my-card', 'meta.ts')
    expect(meta).toContain("tag: 'ew-my-card'")
    expect(meta).toContain('shadow: true')
  })

  it('导出名按 PascalCase 派生，register 用 meta.tag', () => {
    createComponent(root, spec({ name: 'user-profile' }))
    const index = read('user-profile', 'index.ts')
    expect(index).toContain('export const UserProfileElement')
    expect(index).toContain('registerElement(meta.tag, UserProfileElement)')
  })

  it('运行时用具名包引入，不用相对路径', () => {
    createComponent(root, spec())
    expect(read('my-card', 'index.ts')).toContain(
      "import { createElementClass, registerElement, vueAdapter } from '@ew/runtime'",
    )
    expect(read('my-card', 'Component.vue')).toContain(
      "import { useVueEmit } from '@ew/runtime'",
    )
  })

  it('不选配套设施时不返回任何依赖，也不多生成文件', () => {
    const result = createComponent(root, spec())
    expect(result.dependencies).toEqual([])
    expect(result.devDependencies).toEqual([])
    expect(existsSync(join(dirOf('my-card'), 'store.ts'))).toBe(false)
    expect(existsSync(join(dirOf('my-card'), 'api.ts'))).toBe(false)
  })

  it('index.ts 以 ?inline 引 .scss', () => {
    createComponent(root, spec())
    expect(read('my-card', 'index.ts')).toContain("from './style.scss?inline'")
  })

  it('空间没有 styles/index.scss 时不写 @use —— self-monitor 这类空间要能建组件', () => {
    createComponent(root, spec())
    expect(read('my-card', 'style.scss')).not.toContain('@use')
  })

  it('空间有 styles/index.scss 时，@use 排在所有规则之前', () => {
    mkdirSync(join(wsDir('demo'), 'styles'), { recursive: true })
    writeFileSync(join(wsDir('demo'), 'styles/index.scss'), '$gutter: 8px;\n')

    createComponent(root, spec())
    const scss = read('my-card', 'style.scss')
    expect(scss.indexOf("@use 'demo/styles' as styles;")).toBe(0)
    // @use 必须在任何规则之前，排在 :host 后面 Sass 会直接报错
    expect(scss.indexOf(':host')).toBeGreaterThan(0)
  })

  // 组件名刻意与默认的 my-card 不同：用默认名的话断言里的 ew-my-card 与硬编码的
  // 字面量无从区分，测不出类名是从 spec.name 派生的
  it('Vue 组件根元素用 ew-<组件名> 作类名，不用共享的 ew-root', () => {
    createComponent(root, spec({ name: 'user-profile' }))
    const vue = read('user-profile', 'Component.vue')
    expect(vue).toContain('class="ew-user-profile"')
    expect(vue).not.toContain('ew-root')
  })

  it('React 组件同理', () => {
    createComponent(root, spec({ name: 'user-profile', framework: 'react' }))
    const tsx = read('user-profile', 'Component.tsx')
    expect(tsx).toContain('className="ew-user-profile"')
    expect(tsx).not.toContain('ew-root')
  })
})

describe('createComponent · 校验', () => {
  it('拒绝非法组件名', () => {
    for (const bad of ['Demo', '-x', 'a/b', '', '有中文', 'a b']) {
      expect(() => createComponent(root, spec({ name: bad })), bad).toThrow(/不合法/)
    }
  })

  it('拒绝不存在的工作空间', () => {
    expect(() => createComponent(root, spec({ workspace: 'nope' }))).toThrow(/工作空间不存在/)
  })

  it('拒绝目录已存在的组件名', () => {
    createComponent(root, spec())
    expect(() => createComponent(root, spec())).toThrow(/已存在/)
  })

  it('拒绝跨工作空间重名 —— 组件名必须全局唯一', () => {
    mkdirSync(join(wsDir('other'), 'components'), { recursive: true })
    writeFileSync(join(wsDir('other'), 'workspace.ts'), 'export default {}\n')
    writeFileSync(join(wsDir('other'), 'package.json'), '{"name":"@ew/other"}\n')
    createComponent(root, spec({ workspace: 'other' }))
    expect(() => createComponent(root, spec())).toThrow(/全局唯一/)
  })

  it('拒绝没有 package.json 的空间 —— 依赖没处装，版本也没处取', () => {
    mkdirSync(join(wsDir('bare'), 'components'), { recursive: true })
    writeFileSync(join(wsDir('bare'), 'workspace.ts'), 'export default {}\n')
    expect(() => createComponent(root, spec({ workspace: 'bare' }))).toThrow(/没有 package.json/)
  })

  it('拒绝与框架不匹配的配套设施', () => {
    expect(() => createComponent(root, spec({ framework: 'react', addons: ['pinia'] }))).toThrow(
      /pinia/,
    )
    expect(() =>
      createComponent(root, spec({ framework: 'react', addons: ['element-plus'] })),
    ).toThrow(/element-plus/)
    expect(() => createComponent(root, spec({ addons: ['antd'] }))).toThrow(/antd/)
  })

  it('拒绝未知的配套设施', () => {
    // @ts-expect-error 故意传一个不在联合类型里的键
    expect(() => createComponent(root, spec({ addons: ['redux'] }))).toThrow(/未知的配套设施/)
  })

  it('拒绝同时选两个 UI 库', () => {
    expect(() =>
      createComponent(root, spec({ addons: ['element-plus', 'ant-design-vue'] })),
    ).toThrow(/只能选一个 UI 库/)
  })

})

describe('createComponent · 配套设施', () => {
  it('Pinia：生成 store.ts，index.ts 传的是插件工厂，返回 pinia 依赖', () => {
    const result = createComponent(root, spec({ addons: ['pinia'] }))
    expect(existsSync(join(dirOf('my-card'), 'store.ts'))).toBe(true)
    expect(read('my-card', 'store.ts')).toContain('export const useMyCardStore')
    expect(read('my-card', 'index.ts')).toContain('plugins: () => [createPinia()]')
    expect(read('my-card', 'index.ts')).toContain("import { createPinia } from 'pinia'")
    expect(result.dependencies).toEqual(['pinia'])
  })

  it('axios：生成 api.ts，返回 axios 依赖', () => {
    const result = createComponent(root, spec({ addons: ['axios'] }))
    const api = read('my-card', 'api.ts')
    expect(api).toContain("from 'axios'")
    expect(api).toContain('http.interceptors.request.use')
    expect(api).toContain('http.interceptors.response.use')
    expect(result.dependencies).toEqual(['axios'])
  })

  it('Element Plus：关掉 shadow，内联 index.css，模板用 ElButton', () => {
    const result = createComponent(root, spec({ addons: ['element-plus'] }))
    expect(read('my-card', 'meta.ts')).toContain('shadow: false')
    const index = read('my-card', 'index.ts')
    expect(index).toContain("from 'element-plus/dist/index.css?inline'")
    expect(index).toContain("libCss + '\\n' + css")
    // 不能是裸 import：那样 Vite lib 模式会把 CSS 抽成独立产物，CDN 就不单文件了
    expect(index).not.toContain("from 'element-plus'")
    expect(read('my-card', 'Component.vue')).toContain("from 'element-plus'")
    expect(result.dependencies).toEqual(['element-plus'])
  })

  it('React + antd：内联 reset.css，模板用 antd 的 Button', () => {
    const result = createComponent(root, spec({ framework: 'react', addons: ['antd'] }))
    expect(read('my-card', 'index.ts')).toContain("from 'antd/dist/reset.css?inline'")
    expect(read('my-card', 'meta.ts')).toContain('shadow: false')
    expect(read('my-card', 'Component.tsx')).toContain("from 'antd'")
    expect(result.dependencies).toEqual(['antd'])
  })

  it('Tailwind：装到 devDependencies，不改 shadow —— v4 的主题选择器本身就含 :host', () => {
    const result = createComponent(root, spec({ addons: ['tailwind'] }))
    const css = read('my-card', 'style.css')
    expect(css).toContain('@import "tailwindcss"')
    expect(css).toContain('@source "./Component.vue"')
    // @import 必须在最前，否则整条 CSS 失效
    expect(css.indexOf('@import "tailwindcss"')).toBe(0)
    expect(read('my-card', 'meta.ts')).toContain('shadow: true')
    expect(result.dependencies).toEqual([])
    expect(result.devDependencies).toEqual(['@tailwindcss/vite', 'tailwindcss'])
    // Tailwind 走 .css，不能同时留一个 .scss 出来
    expect(existsSync(join(dirOf('my-card'), 'style.scss'))).toBe(false)
  })

  it('Tailwind 组件保持 .css —— @tailwindcss/vite 不处理 .scss', () => {
    createComponent(root, spec({ addons: ['tailwind'] }))
    expect(read('my-card', 'index.ts')).toContain("from './style.css?inline'")
  })

  it('空间有共享样式时 Tailwind 也不加 @use —— @import 必须排在最前，两者会打架', () => {
    mkdirSync(join(wsDir('demo'), 'styles'), { recursive: true })
    writeFileSync(join(wsDir('demo'), 'styles/index.scss'), '$gutter: 8px;\n')

    createComponent(root, spec({ addons: ['tailwind'] }))
    const css = read('my-card', 'style.css')
    expect(css).not.toContain('@use')
    expect(css.indexOf('@import "tailwindcss"')).toBe(0)
  })

  it('echarts 只加依赖，不生成任何文件', () => {
    const result = createComponent(root, spec({ addons: ['echarts'] }))
    expect(result.dependencies).toEqual(['echarts'])
    expect(result.devDependencies).toEqual([])
    expect(readdirSync(dirOf('my-card')).sort()).toEqual([
      'Component.vue',
      'define.ts',
      'index.ts',
      'meta.ts',
      'style.scss',
    ])
  })

  it('React 下也能选 echarts —— 两个框架都有', () => {
    const result = createComponent(root, spec({ framework: 'react', addons: ['echarts'] }))
    expect(result.dependencies).toEqual(['echarts'])
  })

  // preflight 是一份全局 reset：UI 库要求关 shadow，它落到 document.head 就会抹掉宿主页面的
  // 标题与列表样式。改成只引 theme + utilities，同选才成立。
  it('Tailwind 与 UI 库同选：去掉 preflight，改成 theme + utilities 两层', () => {
    const result = createComponent(root, spec({ addons: ['element-plus', 'tailwind'] }))
    const css = read('my-card', 'style.css')
    expect(css).not.toContain('@import "tailwindcss"')
    expect(css).toContain('@import "tailwindcss/theme.css" layer(theme);')
    expect(css).toContain('@import "tailwindcss/utilities.css" layer(utilities);')
    // @import 必须排在所有规则之前
    expect(css.indexOf('@import "tailwindcss/theme.css"')).toBe(0)
    // UI 库照旧关 shadow，两个选项都还生效
    expect(read('my-card', 'meta.ts')).toContain('shadow: false')
    expect(result.dependencies).toEqual(['element-plus'])
    expect(result.devDependencies).toEqual(['@tailwindcss/vite', 'tailwindcss'])
  })

  it('React 的 @source 指向 Component.tsx', () => {
    createComponent(root, spec({ framework: 'react', addons: ['tailwind'] }))
    expect(read('my-card', 'style.css')).toContain('@source "./Component.tsx"')
  })

  it('依赖去重且顺序稳定', () => {
    const result = createComponent(root, spec({ addons: ['element-plus', 'axios', 'pinia'] }))
    expect(result.dependencies).toEqual(['axios', 'element-plus', 'pinia'])
  })
})
