import { listWorkspaces } from '../../.vitepress/workspaces'

export default {
  paths() {
    // 必须排除已写散文的组件：docs/workspaces/<ws>/<name>.md 是静态页，会占掉同一个 URL，
    // 动态路由再生成一遍就是重复路由。
    return listWorkspaces().flatMap((ws) =>
      ws.components
        .filter((c) => !c.documented)
        .map((c) => ({ params: { ws: ws.id, name: c.name } })),
    )
  },
}
