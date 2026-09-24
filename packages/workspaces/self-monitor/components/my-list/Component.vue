<script setup lang="ts">
// <script setup> 里 import 进来的组件自动可用，模板写 <ElButton> 或 <el-button> 都行。
// v-loading 是**指令**而非组件，必须显式引入 vLoading 才能在模板里使用
// （只引组件、不安装插件时，v-loading 不会自动注册）。
import {
  ElButton,
  ElConfigProvider,
  ElDescriptions,
  ElDescriptionsItem,
  ElDialog,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElOption,
  ElPagination,
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTag,
  vLoading,
} from 'element-plus'
// Element Plus 默认是英文。本项目没有全局装 EP 插件（见 index.ts：只 makeComponent 按需引），
// 所以语言要按组件挂 ElConfigProvider，而不是在 app.use(ElementPlus, { locale })。
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { onMounted, ref } from 'vue'
import { useVueEmit } from '@ew/runtime'
import {
  fetchOutletDetail,
  MAKE_STATUSES,
  MONITOR_TYPES,
  NETWORKING_STATUSES,
  PRODUCTION_STATUSES,
  RISK_LEVELS,
  type OutletDetail,
  type OutletRow,
} from './api'
import { useMyListStore } from './store'
import { throttle } from 'lodash' // 测试包图标自动获取

throttle(() => {})

const props = defineProps<{ label?: string }>()

const emit = useVueEmit()
const store = useMyListStore()

// 详情弹框：拉回来的那一份档案、它开着没有、拉到没有。
// 关掉时不清 detail，避免关闭动画播到一半内容突然变空。
const detail = ref<OutletDetail | null>(null)
const detailVisible = ref(false)
const detailLoading = ref(false)
const detailError = ref('')

onMounted(() => {
  void store.fetchRows()
})

// el-table 的插槽把 row 定型成 DefaultRow（Record<string, any> 的别名），
// 而不是传入的 OutletRow。这里处理的是运行时数据，因此收窄类型即可。
async function handleView(row: unknown): Promise<void> {
  const item = row as OutletRow
  detail.value = null
  detailError.value = ''
  detailVisible.value = true
  // 派发与请求并行：id / name 列表行上就有，不必等详情回来才告诉宿主点了哪一行。
  emit('select', { source: 'my-list', id: item.outletId, name: item.outletName })

  detailLoading.value = true
  try {
    detail.value = await fetchOutletDetail(item.outletId)
  } catch (e: unknown) {
    detailError.value = e instanceof Error ? e.message : String(e)
  } finally {
    detailLoading.value = false
  }
}

// --- 取值与配色 ---

/** 后端对没有的字段给 null 或空串，两种都算「没有」。逐项写 ?? '--' 太吵，收在这里。 */
function or(value: unknown): string {
  return value === null || value === undefined || value === '' ? '--' : String(value)
}

function percent(value: number | null | undefined): string {
  return value === null || value === undefined ? '--' : `${value}%`
}

/**
 * 评分配色走 Element Plus 的变量，不写死色值：宿主换个主题时这里跟着走，
 * 也就不会与同页其它组件对不上。档位与宿主的 risk-early-warning 一致（80 / 60）。
 */
function scoreColor(score: number): string {
  if (score >= 80) return 'var(--el-color-danger)'
  return score >= 60 ? 'var(--el-color-warning)' : 'var(--el-color-primary)'
}

/** 风险等级配色按 code 分，拿中文名去比对等于把后端文案当成协议。 */
function levelType(code: number | null | undefined): 'info' | 'warning' | 'danger' {
  if (code === 30) return 'danger'
  return code === 20 ? 'warning' : 'info'
}

/**
 * 监测类型只有三种，但色板里没有宿主那种自定义的 blue / cyan，
 * 于是雨水与「其它」都落在 info —— 宁可两种灰，也不给一个含义不对的绿。
 *
 * 下面两个收的是字段本身而不是整行：el-table 插槽给的是 DefaultRow，传整行会报
 * 「不是 OutletRow」，而为它放宽成 any 就等于把这层收窄白做了。
 */
function monitorTypeOf(name: string | undefined): 'primary' | 'warning' | 'info' {
  if (name === '废水') return 'primary'
  return name === '废气' ? 'warning' : 'info'
}

/** 未投产时把预计投产月份带出来（后端给的是格式化日期），比单说「未投产」多一条信息。 */
function productionText(status: string, formatDate: string | null | undefined): string {
  if (status !== '未投产') return status
  const month = formatDate?.slice(0, 7)
  return month ? `未投产 · ${month}` : '未投产'
}
</script>

<template>
  <!-- EP 2.14.6 有一批 prop 的 .d.ts 写成 ExtractPropTypes<{ ...__epPropKey: true }>，vue-tsc
       2.x 展不平，于是每个 prop 都报 TS2322「Type 'string' is not assignable to …__epPropKey」。
       中招的是 ElConfigProvider 的 locale、ElSelect 与 ElOption 的各项；ElForm / ElInput 等
       用的是普通接口，不受影响。运行时完全无碍 —— 等上游修好，把这几行 @vue-ignore 一起删。 -->
  <!-- @vue-ignore -->
  <ElConfigProvider :locale="zhCn">
    <section class="ew-my-list">
      <header class="ew-my-list__head">
        <h3 class="ew-my-list__title">{{ props.label }}</h3>

        <!-- ElForm 渲染的是原生 <form>，回车会触发浏览器提交并刷新整页 —— 拦掉。 -->
        <ElForm :inline="true" class="ew-my-list__filters" @submit.prevent>
          <ElFormItem label="排放口">
            <ElInput
              v-model="store.filters.keyword"
              placeholder="排放口编号 / 名称"
              clearable
              class="ew-my-list__keyword"
              @keyup.enter="store.search()"
            />
          </ElFormItem>

          <ElFormItem label="风险等级">
            <!-- value-on-clear 显式给 null：ElSelect 清空时默认写 undefined，而筛选条件里
                 「没选」是 null —— 不写这行就会留个 undefined 混进请求参数（虽然会被 axios
                 丢掉，但类型是个谎）。下面几组字符串项给 '' 是同一条规矩的另一种取值。 -->
            <!-- @vue-ignore -->
            <ElSelect
              v-model="store.filters.riskLevel"
              :value-on-clear="null"
              clearable
              placeholder="全部风险等级"
              class="ew-my-list__level"
            >
              <!-- @vue-ignore -->
              <ElOption
                v-for="item in RISK_LEVELS"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </ElSelect>
          </ElFormItem>

          <ElFormItem label="监测类型">
            <!-- @vue-ignore -->
            <ElSelect
              v-model="store.filters.monitorType"
              :value-on-clear="''"
              clearable
              placeholder="全部监测类型"
              class="ew-my-list__type"
            >
              <!-- @vue-ignore -->
              <ElOption
                v-for="item in MONITOR_TYPES"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </ElSelect>
          </ElFormItem>

          <ElFormItem label="投产情况">
            <!-- @vue-ignore -->
            <ElSelect
              v-model="store.filters.productionStatus"
              :value-on-clear="''"
              clearable
              placeholder="全部投产情况"
              class="ew-my-list__type"
            >
              <!-- @vue-ignore -->
              <ElOption
                v-for="item in PRODUCTION_STATUSES"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </ElSelect>
          </ElFormItem>

          <ElFormItem label="生产情况">
            <!-- @vue-ignore -->
            <ElSelect
              v-model="store.filters.makeStatus"
              :value-on-clear="''"
              clearable
              placeholder="全部生产情况"
              class="ew-my-list__type"
            >
              <!-- @vue-ignore -->
              <ElOption
                v-for="item in MAKE_STATUSES"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </ElSelect>
          </ElFormItem>

          <ElFormItem label="联网情况">
            <!-- @vue-ignore -->
            <ElSelect
              v-model="store.filters.networkingStatus"
              :value-on-clear="''"
              clearable
              placeholder="全部联网情况"
              class="ew-my-list__type"
            >
              <!-- @vue-ignore -->
              <ElOption
                v-for="item in NETWORKING_STATUSES"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </ElSelect>
          </ElFormItem>

          <ElFormItem label="有效传输率">
            <!-- 「近90个生产日」这个限定放 placeholder：放进标签会折两行，
                 把同一行的控件一起撑高。 -->
            <ElInputNumber
              v-model="store.filters.validTransRate90Lt"
              :min="0"
              :max="100"
              :precision="2"
              :controls="false"
              placeholder="近90个生产日，小于"
              class="ew-my-list__rate"
            >
              <template #suffix>%</template>
            </ElInputNumber>
          </ElFormItem>

          <ElFormItem>
            <ElButton type="primary" :loading="store.loading" @click="store.search()">查询</ElButton>
            <ElButton @click="store.reset()">重置</ElButton>
          </ElFormItem>
        </ElForm>
      </header>

      <div class="ew-my-list__body">
        <!-- 请求失败时表格本就是空的，用 empty-text 把原因说出来，否则与「查出来没数据」
             长得一模一样。 -->
        <ElTable
          v-loading="store.loading"
          :data="store.rows"
          :empty-text="store.error || '暂无数据'"
          stripe
        >
          <ElTableColumn prop="outletCode" label="排放口编号" width="120" />
          <ElTableColumn prop="outletName" label="排放口名称" min-width="160" show-overflow-tooltip />
          <ElTableColumn prop="psName" label="所属企业" min-width="180" show-overflow-tooltip />
          <ElTableColumn prop="regionName" label="行政区" min-width="150" show-overflow-tooltip />
          <ElTableColumn label="监测类型" width="100">
            <template #default="{ row }">
              <ElTag :type="monitorTypeOf(row.monitorTypeName)" size="small">
                {{ row.monitorTypeName }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn label="投产情况" width="150">
            <template #default="{ row }">
              <ElTag
                v-if="row.productionStatus"
                :type="row.productionStatus === '已投产' ? 'success' : 'info'"
                size="small"
              >
                {{ productionText(row.productionStatus, row.commissionFormatDate) }}
              </ElTag>
              <span v-else>--</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="生产情况" width="120">
            <template #default="{ row }">
              <ElTag
                v-if="row.makeStatus"
                :type="row.makeStatus === '正常生产' ? 'success' : 'warning'"
                size="small"
              >
                {{ row.makeStatus }}
              </ElTag>
              <span v-else>--</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="联网状态" width="110">
            <template #default="{ row }">
              <ElTag
                :type="row.networkingStatus === '已联网' ? 'success' : 'danger'"
                size="small"
                effect="light"
              >
                {{ row.networkingStatus }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn label="本月风险评分" width="140">
            <!-- 没有画像的排口 riskScore 为 null，补 0 会被读成「评了 0 分」，所以留 -- -->
            <template #default="{ row }">
              <template v-if="row.riskScore != null">
                <span :style="{ color: scoreColor(row.riskScore), fontWeight: 700 }">
                  {{ row.riskScore }}
                </span>
                <ElTag :type="levelType(row.riskLevel)" size="small" class="ew-my-list__level-tag">
                  {{ row.riskLevelName ?? '低风险' }}
                </ElTag>
              </template>
              <span v-else>--</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="近90个生产日有效传输率" width="180">
            <template #default="{ row }">
              <!-- 低于 90 标红：这是这一列的筛选条件所指的那条线，扫一眼就能看出哪些排口不合格 -->
              <span
                v-if="row.validTransRate90 != null"
                :style="row.validTransRate90 < 90 ? { color: 'var(--el-color-danger)' } : undefined"
              >
                {{ percent(row.validTransRate90) }}
              </span>
              <span v-else>--</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="操作" width="100" fixed="right">
            <template #default="{ row }">
              <ElButton link type="primary" @click="handleView(row)">查看档案</ElButton>
            </template>
          </ElTableColumn>
        </ElTable>
      </div>

      <footer class="ew-my-list__foot">
        <ElPagination
          :current-page="store.page"
          :page-size="store.pageSize"
          :total="store.total"
          layout="total, prev, pager, next"
          background
          @current-change="store.changePage"
        />
      </footer>
    </section>

    <!-- append-to-body 是必须的：不写的话弹框留在本组件的 DOM 里，会被列表容器的
         overflow/层叠上下文裁掉，也压不过调试页自己的右栏。 -->
    <ElDialog
      v-model="detailVisible"
      :title="detail ? `排放口档案 · ${detail.outletCode}` : '排放口档案'"
      width="min(760px, 92vw)"
      append-to-body
    >
      <div v-loading="detailLoading" class="ew-my-list__detail">
        <ElDescriptions v-if="detail" :column="2" border size="small">
          <ElDescriptionsItem label="排放口编号">{{ or(detail.outletCode) }}</ElDescriptionsItem>
          <ElDescriptionsItem label="排放口名称">{{ or(detail.outletName) }}</ElDescriptionsItem>
          <ElDescriptionsItem label="监测类型">{{ or(detail.monitorTypeName) }}</ElDescriptionsItem>
          <ElDescriptionsItem label="排放口类型">{{ or(detail.outletType) }}</ElDescriptionsItem>
          <ElDescriptionsItem label="所属企业">{{ or(detail.psName) }}</ElDescriptionsItem>
          <ElDescriptionsItem label="行政区">{{ or(detail.regionName) }}</ElDescriptionsItem>
          <ElDescriptionsItem label="排污许可证编号">{{ or(detail.permitNo) }}</ElDescriptionsItem>
          <ElDescriptionsItem label="许可证有效期">{{ or(detail.times) }}</ElDescriptionsItem>
          <ElDescriptionsItem label="主要行业">{{ or(detail.mainSectorName) }}</ElDescriptionsItem>
          <ElDescriptionsItem label="环保重点行业">{{ or(detail.hbSectorName) }}</ElDescriptionsItem>
          <ElDescriptionsItem label="地址" :span="2">{{ or(detail.opeaddress) }}</ElDescriptionsItem>
          <ElDescriptionsItem label="投产情况">
            {{ or(detail.productionStatus) }}
            <template v-if="detail.commissionFormatDate">（{{ detail.commissionFormatDate }}）</template>
          </ElDescriptionsItem>
          <ElDescriptionsItem label="联网状态">{{ or(detail.networkingStatus) }}</ElDescriptionsItem>
          <ElDescriptionsItem label="设备联网状态">{{ or(detail.deviceNetworkStatus) }}</ElDescriptionsItem>
          <ElDescriptionsItem label="本月风险评分">{{ or(detail.riskScore) }}</ElDescriptionsItem>
          <ElDescriptionsItem label="风险等级">{{ or(detail.riskLevelName) }}</ElDescriptionsItem>
          <ElDescriptionsItem label="近90个生产日有效传输率">
            {{ percent(detail.validTransRate90) }}
          </ElDescriptionsItem>
          <ElDescriptionsItem label="经度">{{ or(detail.longitude) }}</ElDescriptionsItem>
          <ElDescriptionsItem label="纬度">{{ or(detail.latitude) }}</ElDescriptionsItem>
          <ElDescriptionsItem label="站房视频">{{ or(detail.stationVideoStatus) }}</ElDescriptionsItem>
          <ElDescriptionsItem label="采样平台视频">
            {{ or(detail.platformVideoStatus) }}
          </ElDescriptionsItem>
          <ElDescriptionsItem label="超期未运维最大天数" :span="2">
            {{ detail.maxOpsOverdueDays }} 天
          </ElDescriptionsItem>
        </ElDescriptions>

        <!-- 详情没回来时才可能出现空态：请求失败给出原因，成功但后端没有这份档案就照后端说。 -->
        <ElEmpty v-else :description="detailError || '暂无排放口档案数据'" />
      </div>

      <template #footer>
        <ElButton type="primary" @click="detailVisible = false">关闭</ElButton>
      </template>
    </ElDialog>
  </ElConfigProvider>
</template>
