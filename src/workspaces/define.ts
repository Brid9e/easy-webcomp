export interface WorkspaceMeta {
  /** 展示名。缺省时由读取方回落到目录名 */
  title?: string
  description?: string
}

export function defineWorkspace(meta: WorkspaceMeta): WorkspaceMeta {
  return meta
}
