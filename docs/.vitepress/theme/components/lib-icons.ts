/**
 * 依赖标签上的库图标。
 *
 * 一个包一份文件，文件名就是包名，由 `pnpm run icons:sync` 从 iconify 下载进 lib-icons/ ——
 * 下载到仓库而不是运行时拉 CDN，文档站才能离线构建、内网 http 打开。怎么找、按什么顺序找，
 * 那份脚本的头注释里有。
 *
 * 查不到的包回落到 `_placeholder.svg`（一枚中性灰的包裹轮廓）：页面上永远有东西可画，
 * 靠留白表达「不认识这个包」在成排的标签里根本看不出来。
 *
 * 走 glob 而不是逐个 import：加一个包只要丢一个 .svg 进来，「有哪些图标」就不再是另一处
 * 需要同步维护的清单。`_placeholder` 也在这张表里，取它时按名字拿即可。
 */
const icons = import.meta.glob('./lib-icons/*.svg', {
  eager: true,
  import: 'default',
}) as Record<string, string>

/** glob 的键是 `./lib-icons/vue.svg`，取末段去扩展名当包名 */
const byPackage: Record<string, string> = Object.fromEntries(
  Object.entries(icons).map(([path, url]) => [path.split('/').pop()!.replace(/\.svg$/, ''), url]),
)

const PLACEHOLDER = '_placeholder'

// 兜底图标没了，glob 只会静默少一项，每个查不到的包都变成坏图 —— 这种坏法不该等到肉眼发现
if (byPackage[PLACEHOLDER] === undefined) {
  throw new Error('[lib-icons] 缺少 lib-icons/_placeholder.svg，依赖标签没有兜底图标')
}

export function libIcon(name: string): string {
  return byPackage[name] ?? byPackage[PLACEHOLDER]
}
