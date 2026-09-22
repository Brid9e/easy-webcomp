import { describe, expect, it } from 'vitest'
import { findPrefixViolations } from '../../scripts/style-prefix'

describe('findPrefixViolations', () => {
  it('合规的类名不报', () => {
    const css = '.ew-my-list { display: flex; }\n.ew-my-list__head { gap: 8px; }'
    expect(findPrefixViolations(css, 'my-list')).toEqual([])
  })

  it('库前缀 el- 放行', () => {
    expect(findPrefixViolations('.el-form-item { max-width: 100%; }', 'my-list')).toEqual([])
  })

  // 这条检查存在的唯一理由：demo 里 hello-vue 与 hello-react 曾经共用 .ew-hello
  it('前缀指向别的组件时报出来', () => {
    expect(findPrefixViolations('.ew-hello { color: red; }', 'hello-vue')).toEqual(['ew-hello'])
  })

  it('裸根类名不算违规', () => {
    expect(findPrefixViolations('.ew-my-list { a: 1 }', 'my-list')).toEqual([])
  })

  it('同名前缀但缺分隔符也算违规 —— ew-hello 不能冒充 ew-hello-vue 的命名空间', () => {
    expect(findPrefixViolations('.ew-hellovue { a: 1 }', 'hello-vue')).toEqual(['ew-hellovue'])
  })

  it('只扫选择器，声明里的点号不算类名', () => {
    expect(findPrefixViolations('.ew-my-list { content: ".other"; }', 'my-list')).toEqual([])
  })

  it('@media 里的选择器照样扫，@media 自身的条件文本不当选择器', () => {
    const css = '@media (min-width: 600px) { .ew-my-list { a: 1 } .other { b: 2 } }'
    expect(findPrefixViolations(css, 'my-list')).toEqual(['other'])
  })

  it('注释里的花括号不影响括号配对', () => {
    const css = '/* { .other } */\n.ew-my-list { a: 1 }'
    expect(findPrefixViolations(css, 'my-list')).toEqual([])
  })

  it('去重后按出现顺序返回', () => {
    const css = '.b { a: 1 }\n.a { a: 1 }\n.b { c: 2 }'
    expect(findPrefixViolations(css, 'my-list')).toEqual(['b', 'a'])
  })

  // Sass 产物含非 ASCII 时会在最前面补 @charset，它没有 block，不切成一条独立语句的话
  // 会把紧随其后的第一条规则整条吞掉。my-list 编译出来就带这行。
  it('@charset 开头时第一条规则照样被扫', () => {
    const css = '@charset "UTF-8";\n.bad { a: 1 }\n.ew-ok { b: 2 }'
    expect(findPrefixViolations(css, 'ok')).toEqual(['bad'])
  })

  // 属性选择器里的点不是类名。不跳过 [...] 的话这里会报出一个根本不存在的类 ".pdf"。
  it('属性选择器里的值不算类名', () => {
    expect(findPrefixViolations('.ew-my-list [href$=".pdf"] { a: 1 }', 'my-list')).toEqual([])
  })

  // 声明值里带花括号时，值的内容会漏进 buffer 被当选择器 —— 引号内要跳过
  it('声明值里带花括号不会漏出假的类名', () => {
    expect(findPrefixViolations('.ew-my-list::after { content: "{.fake{" }', 'my-list')).toEqual([])
  })

  // 引号里的 \" 是转义，不是字符串收尾。状态机不认转义就会在第二个引号处提前出栈，
  // 之后的整个文件全被当成「还在字符串里」跳过 —— 守卫于是静默漏报后面所有选择器。
  it('字符串里的转义双引号不会让后续选择器被跳过', () => {
    const css = '.ew-ok { content: "\\"" }\n.bad-class { a: 1 }'
    expect(findPrefixViolations(css, 'ok')).toEqual(['bad-class'])
  })

  it('字符串里的转义单引号不会让后续选择器被跳过', () => {
    const css = ".ew-ok::after { content: 'it\\'s' }\n.bad-class { a: 1 }"
    expect(findPrefixViolations(css, 'ok')).toEqual(['bad-class'])
  })

  it('属性选择器值里的转义引号同样不吞掉后续选择器', () => {
    const css = '[data-y="a\\"b"] .bad-class { a: 1 }'
    expect(findPrefixViolations(css, 'ok')).toEqual(['bad-class'])
  })

  it('ant- 前缀与 el- 一样放行', () => {
    expect(findPrefixViolations('.ant-form-item { max-width: 100%; }', 'my-table')).toEqual([])
  })

  it('用破折号分隔的同命名空间类名放行', () => {
    expect(findPrefixViolations('.ew-my-list-filters { a: 1 }', 'my-list')).toEqual([])
  })
})
