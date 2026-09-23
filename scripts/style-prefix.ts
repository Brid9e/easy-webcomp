/**
 * 组件样式的类名必须落在自己的命名空间里。
 *
 * 这条检查存在的唯一理由是「不影响其他组件」这句承诺：shadow 模式下各写各的、互不干扰，
 * 一旦落到 light DOM（框架产物，或组件自己的 disable-shadow 模式），同页两个组件用了
 * 同一个类名就是直接互相覆盖。demo 里的 hello-vue 与 hello-react 共用 `.ew-hello` 正是
 * 这种情形，构建必须拦住它，而不是靠人自觉。
 */

/**
 * 非本组件但允许出现的类名前缀：UI 库自己的类名。
 *
 * `el-` 是 Element Plus，`ant-` 覆盖 ant-design-vue 与 antd —— 脚手架支持的三个 UI 库全在这。
 * 组件里写 `.el-form-item { ... }` 覆盖库样式是既有模式，三个库应当一视同仁。
 * （antd 的 prefixCls 理论上可被 ConfigProvider 改写，那样仍然会报；真遇到再说，别为它放开规则。）
 */
const LIBRARY_PREFIXES = ['el-', 'ant-']

/** 去掉注释，避免注释里的花括号干扰配对 */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * 取出所有选择器文本：每个 `{` 之前那段就是它的选择器，`@` 开头的是 at 规则的条件
 * 而不是选择器。用这种括号配对而不是正则匹配 `{...}`，是为了让 `@media` 块里嵌套的
 * 选择器也能被扫到 —— 只按顶层切会把它们整段漏掉。
 *
 * `;` 也要清 buffer：无 block 的 at 规则（`@charset "UTF-8";`、`@import ...;`）不会走到
 * `{`，不清的话它会和紧随其后的第一条规则粘成一个以 `@` 开头的 buffer，把那条规则整条
 * 跳过。Sass 在产物含非 ASCII 时会自动补 `@charset`，所以这不是假想的情况。选择器里
 * 不可能出现 `;`，无条件清是安全的。
 *
 * `[...]` 与引号内的内容要跳过，理由不是洁癖而是误报：`[href$=".pdf"]` 里的 `.pdf` 会被
 * 类名正则当成一个类名报出来，文案还会错误地报出「出现类名 ".pdf"」，而那个类并不存在。
 * 同一条规则也顺带挡住 `content: "{.fake{"` 这种值里带花括号、把声明内容漏进 buffer 的情况。
 */
function selectorsOf(css: string): string[] {
  const out: string[] = []
  let buffer = ''
  let quote: string | null = null
  let inAttribute = false
  // 引号内要认 `\` 转义。不认的话 `content: "\""` 会把第二个引号当成收尾，状态机
  // 此后一直认为「仍在字符串内」，文件剩下的选择器全部被跳过，造成静默的全量漏报。
  let escaped = false

  for (const char of stripComments(css)) {
    if (quote !== null) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = null
      }
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '[') {
      inAttribute = true
      continue
    }
    if (char === ']') {
      inAttribute = false
      continue
    }
    if (inAttribute) continue

    if (char === '{') {
      const text = buffer.trim()
      if (text !== '' && !text.startsWith('@')) out.push(text)
      buffer = ''
    } else if (char === '}' || char === ';') {
      buffer = ''
    } else {
      buffer += char
    }
  }
  return out
}

/**
 * 返回该 CSS 里所有不属于 `name` 命名空间的类名，去重并保持出现顺序。
 *
 * 命名空间靠分隔符界定：`ew-my-list` 放行 `ew-my-list__head`、`ew-my-list--active`、
 * `ew-my-list-filters`，但 `ew-hellovue` 对 `hello-vue` 不算 —— 缺了分隔符就只是
 * 名字碰巧长在一起。
 */
export function findPrefixViolations(css: string, name: string): string[] {
  const base = `ew-${name}`
  const inNamespace = (token: string): boolean =>
    token === base ||
    token.startsWith(`${base}__`) ||
    token.startsWith(`${base}--`) ||
    token.startsWith(`${base}-`)

  const violations = new Set<string>()
  for (const selector of selectorsOf(css)) {
    for (const match of selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
      const token = match[1] as string
      if (inNamespace(token)) continue
      if (LIBRARY_PREFIXES.some((prefix) => token.startsWith(prefix))) continue
      violations.add(token)
    }
  }
  return [...violations]
}
