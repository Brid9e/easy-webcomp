import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import { fetchMyList, type MyListItem, type MyListStatus } from './api'

export interface MyListFilters {
  keyword: string
  status: MyListStatus | ''
  dateRange: [string, string] | null
}

/**
 * 每个 <ew-my-list> 元素各持一份 pinia（index.ts 里按实例 createPinia），
 * 所以同页放两个元素，状态互不影响。
 */
export const useMyListStore = defineStore('my-list', () => {
  const filters = reactive<MyListFilters>({ keyword: '', status: '', dateRange: null })
  const rows = ref<MyListItem[]>([])
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(10)
  const loading = ref(false)

  // 慢的那次请求可能后回来。只认最后一次发出的，否则「先查 A 再查 B」会被 A 的结果覆盖。
  let seq = 0

  async function fetchRows(): Promise<void> {
    const mine = ++seq
    loading.value = true
    try {
      const result = await fetchMyList({ ...filters, page: page.value, pageSize: pageSize.value })
      if (mine !== seq) return
      rows.value = result.rows
      total.value = result.total
    } finally {
      if (mine === seq) loading.value = false
    }
  }

  /** 查询条件变了要回到第一页，否则可能停在超出结果集的页码上，看到一张空表。 */
  function search(): void {
    page.value = 1
    void fetchRows()
  }

  function reset(): void {
    filters.keyword = ''
    filters.status = ''
    filters.dateRange = null
    search()
  }

  function changePage(next: number): void {
    page.value = next
    void fetchRows()
  }

  return { filters, rows, total, page, pageSize, loading, fetchRows, search, reset, changePage }
})
