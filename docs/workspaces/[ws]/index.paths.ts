import { listWorkspaces } from '../../.vitepress/workspaces'

export default {
  // 保持同步：listWorkspaces 只扫文件系统，所以这里不需要 await
  paths: () => listWorkspaces().map((ws) => ({ params: { ws: ws.id } })),
}
