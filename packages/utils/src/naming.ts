/**
 * 组件名 → 标识符（`hello-vue` → `HelloVue`）。
 *
 * 这个规则有三处消费者，必须完全一致：构建期为每个组件生成 `export * as <Id>`（scripts/build.ts），
 * 脚手架据此命名 `<Id>Element` 与 `use<Id>Store`（scripts/new-component.ts），文档站据此从组件的
 * index.ts 里取出 `Element`（docs/.vitepress/plugins/wc-mode.ts）。任何一处走偏都是运行时取不到值。
 */
export function toIdentifier(name: string): string {
  return name
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}
