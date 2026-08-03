<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import ExcelJS from 'exceljs'
import { fetchedData, filteredRowsFor, parseNumeric } from '../dataStore'
import { computeTeamAffinity, exportTeamAffinity } from '../teamAffinity'
import { addStyledSheet, downloadWorkbook } from '../utils/excel'
import type { Row } from '../types'

const PAGE_SIZE = 500
const FILTER_OPTION_LIMIT = 300
const FILTERS_KEY = 'loldata_affinity_filters_v1'
const HIDDEN_COLUMNS_KEY = 'loldata_affinity_hidden_columns_v1'

interface RangeFilter {
  min: string
  max: string
}

const exporting = ref(false)
const exportError = ref('')
const exportMode = ref<'all' | 'filtered'>('all')

const affinity = computed(() => {
  if (!fetchedData.value) return null
  return computeTeamAffinity(filteredRowsFor('hero'), filteredRowsFor('teamGame'), filteredRowsFor('playerHero'))
})

const columns = computed(() => affinity.value?.columns ?? [])
const rows = computed(() => affinity.value?.rows ?? [])

async function exportExcel() {
  if (!affinity.value) return
  exporting.value = true
  exportError.value = ''
  try {
    let workbook: ExcelJS.Workbook
    let filename: string
    if (exportMode.value === 'filtered') {
      workbook = new ExcelJS.Workbook()
      addStyledSheet(workbook, '队伍版本亲合度', visibleColumns.value, [...displayRows.value, affinity.value.totalsRow])
      filename = '队伍版本亲合度_已筛选.xlsx'
    } else {
      ;({ workbook, filename } = exportTeamAffinity(affinity.value))
    }
    await downloadWorkbook(workbook, filename)
  } catch (err) {
    exportError.value = err instanceof Error ? err.message : String(err)
  } finally {
    exporting.value = false
  }
}

// ---- filters (categorical + numeric range), persisted to localStorage ----

function loadPersistedFilters(): { cat: Record<string, Set<string>>; range: Record<string, RangeFilter> } {
  try {
    const raw = localStorage.getItem(FILTERS_KEY)
    if (!raw) return { cat: {}, range: {} }
    const parsed = JSON.parse(raw)
    const cat: Record<string, Set<string>> = {}
    for (const [col, vals] of Object.entries(parsed?.cat ?? {})) {
      if (Array.isArray(vals)) cat[col] = new Set(vals as string[])
    }
    const range = parsed?.range && typeof parsed.range === 'object' ? parsed.range : {}
    return { cat, range }
  } catch {
    return { cat: {}, range: {} }
  }
}

const persisted = loadPersistedFilters()

const sortState = ref<{ column: string; dir: 'asc' | 'desc' } | null>(null)
const columnFilters = ref<Record<string, Set<string>>>(persisted.cat)
const columnRanges = ref<Record<string, RangeFilter>>(persisted.range)
const openFilterColumn = ref<string | null>(null)
const filterSearch = ref('')
const currentPage = ref(1)
const popoverStyle = ref({ top: '0px', left: '0px' })

watch(
  [columnFilters, columnRanges],
  () => {
    currentPage.value = 1
    try {
      const cat: Record<string, string[]> = {}
      for (const [col, set] of Object.entries(columnFilters.value)) cat[col] = Array.from(set)
      localStorage.setItem(FILTERS_KEY, JSON.stringify({ cat, range: columnRanges.value }))
    } catch {
      // localStorage 不可用或已满时忽略
    }
  },
  { deep: true },
)

const numericColumns = computed(() => {
  const set = new Set<string>()
  for (const col of columns.value) {
    let numeric = 0
    let total = 0
    for (const row of rows.value) {
      const raw = row[col]
      if (raw === null || raw === undefined || String(raw).trim() === '') continue
      total++
      if (!Number.isNaN(parseNumeric(raw))) numeric++
    }
    if (total > 0 && numeric / total >= 0.9) set.add(col)
  }
  return set
})

function isNumericColumn(column: string | null): boolean {
  return column !== null && numericColumns.value.has(column)
}

function distinctValuesForColumn(column: string): string[] {
  const set = new Set<string>()
  for (const row of rows.value) set.add(String(row[column] ?? ''))
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh'))
}

function filteredDistinctValues(column: string | null): string[] {
  if (!column) return []
  const all = distinctValuesForColumn(column)
  const q = filterSearch.value.trim().toLowerCase()
  const matched = q ? all.filter((v) => v.toLowerCase().includes(q)) : all
  return matched.slice(0, FILTER_OPTION_LIMIT)
}

function isColumnFiltered(column: string): boolean {
  if (isNumericColumn(column)) {
    const r = columnRanges.value[column]
    return !!r && (r.min !== '' || r.max !== '')
  }
  const set = columnFilters.value[column]
  if (!set) return false
  return set.size < distinctValuesForColumn(column).length
}

function ensureFilterState(column: string) {
  if (isNumericColumn(column)) {
    if (!columnRanges.value[column]) columnRanges.value[column] = { min: '', max: '' }
  } else if (!columnFilters.value[column]) {
    columnFilters.value[column] = new Set(distinctValuesForColumn(column))
  }
}

function openFilterAt(column: string, evt: MouseEvent) {
  if (openFilterColumn.value === column) {
    openFilterColumn.value = null
    return
  }
  const target = evt.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  popoverStyle.value = { top: `${rect.bottom + 6}px`, left: `${rect.left}px` }
  ensureFilterState(column)
  filterSearch.value = ''
  openFilterColumn.value = column
}

function toggleFilterValue(column: string | null, value: string) {
  if (!column) return
  const set = columnFilters.value[column]
  if (!set) return
  if (set.has(value)) set.delete(value)
  else set.add(value)
}

function clearFilter(column: string | null) {
  if (!column) return
  columnFilters.value[column] = new Set()
}

function resetFilter(column: string | null) {
  if (!column) return
  delete columnFilters.value[column]
}

function resetRangeFilter(column: string | null) {
  if (!column) return
  columnRanges.value[column] = { min: '', max: '' }
}

function removeColumnFilter(column: string) {
  if (isNumericColumn(column)) resetRangeFilter(column)
  else resetFilter(column)
}

function clearAllFilters() {
  columnFilters.value = {}
  columnRanges.value = {}
}

const activeFilterChips = computed(() => {
  const chips: { column: string; label: string }[] = []
  for (const col of columns.value) {
    if (isNumericColumn(col)) {
      const r = columnRanges.value[col]
      if (r && (r.min !== '' || r.max !== '')) {
        let label = col
        if (r.min !== '' && r.max !== '') label += `：${r.min} ~ ${r.max}`
        else if (r.min !== '') label += `：≥ ${r.min}`
        else label += `：≤ ${r.max}`
        chips.push({ column: col, label })
      }
    } else {
      const set = columnFilters.value[col]
      if (set) {
        const total = distinctValuesForColumn(col).length
        if (set.size < total) {
          const values = Array.from(set)
          const shown = values.length > 0 && values.length <= 3 ? values.map((v) => v || '(空)').join('、') : `已选 ${set.size}/${total} 项`
          chips.push({ column: col, label: `${col}：${shown}` })
        }
      }
    }
  }
  return chips
})

const rangeMin = computed({
  get: () => (openFilterColumn.value ? (columnRanges.value[openFilterColumn.value]?.min ?? '') : ''),
  set: (v: string) => {
    const column = openFilterColumn.value
    if (!column) return
    if (!columnRanges.value[column]) columnRanges.value[column] = { min: '', max: '' }
    columnRanges.value[column].min = v
  },
})

const rangeMax = computed({
  get: () => (openFilterColumn.value ? (columnRanges.value[openFilterColumn.value]?.max ?? '') : ''),
  set: (v: string) => {
    const column = openFilterColumn.value
    if (!column) return
    if (!columnRanges.value[column]) columnRanges.value[column] = { min: '', max: '' }
    columnRanges.value[column].max = v
  },
})

function filterSetFor(column: string | null): Set<string> | undefined {
  if (!column) return undefined
  return columnFilters.value[column]
}

// ---- column visibility, persisted to localStorage ----

function loadHiddenColumns(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_COLUMNS_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed as string[]) : new Set()
  } catch {
    return new Set()
  }
}

const hiddenColumns = ref<Set<string>>(loadHiddenColumns())
const showColumnPanel = ref(false)

watch(
  hiddenColumns,
  () => {
    try {
      localStorage.setItem(HIDDEN_COLUMNS_KEY, JSON.stringify(Array.from(hiddenColumns.value)))
    } catch {
      // localStorage 不可用或已满时忽略
    }
  },
  { deep: true },
)

function toggleColumnPanel() {
  showColumnPanel.value = !showColumnPanel.value
}

function toggleColumnVisibility(column: string) {
  if (hiddenColumns.value.has(column)) {
    hiddenColumns.value.delete(column)
  } else {
    hiddenColumns.value.add(column)
    resetFilter(column)
    resetRangeFilter(column)
    if (sortState.value?.column === column) sortState.value = null
  }
}

const visibleColumns = computed(() => columns.value.filter((c) => !hiddenColumns.value.has(c)))

// ---- sorting ----

function toggleSort(column: string) {
  if (!sortState.value || sortState.value.column !== column) {
    sortState.value = { column, dir: 'asc' }
  } else if (sortState.value.dir === 'asc') {
    sortState.value = { column, dir: 'desc' }
  } else {
    sortState.value = null
  }
}

function compareRows(a: Row, b: Row, column: string): number {
  const av = a[column]
  const bv = b[column]
  const an = parseNumeric(av)
  const bn = parseNumeric(bv)
  const bothNumeric = !Number.isNaN(an) && !Number.isNaN(bn) && String(av ?? '').trim() !== '' && String(bv ?? '').trim() !== ''
  if (bothNumeric) return an - bn
  return String(av ?? '').localeCompare(String(bv ?? ''), 'zh')
}

// ---- filter + sort + paginate ----

const displayRows = computed(() => {
  let result = rows.value

  const catFilters = Object.entries(columnFilters.value).filter(([col]) => columns.value.includes(col) && !numericColumns.value.has(col))
  if (catFilters.length) {
    result = result.filter((row) => catFilters.every(([col, set]) => set.has(String(row[col] ?? ''))))
  }

  const rangeFilters = Object.entries(columnRanges.value).filter(([col, r]) => columns.value.includes(col) && (r.min !== '' || r.max !== ''))
  if (rangeFilters.length) {
    result = result.filter((row) =>
      rangeFilters.every(([col, r]) => {
        const n = parseNumeric(row[col])
        if (Number.isNaN(n)) return false
        if (r.min !== '' && n < parseFloat(r.min)) return false
        if (r.max !== '' && n > parseFloat(r.max)) return false
        return true
      }),
    )
  }

  if (sortState.value && columns.value.includes(sortState.value.column)) {
    const { column, dir } = sortState.value
    result = [...result].sort((a, b) => compareRows(a, b, column) * (dir === 'asc' ? 1 : -1))
  }

  return result
})

const totalPages = computed(() => Math.max(1, Math.ceil(displayRows.value.length / PAGE_SIZE)))

const pagedRows = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return displayRows.value.slice(start, start + PAGE_SIZE)
})

function isLink(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value)
}

function handleDocumentClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.filter-btn') && !target.closest('.filter-popover') && !target.closest('.filter-chip')) {
    openFilterColumn.value = null
  }
  if (!target.closest('.column-panel-btn') && !target.closest('.column-panel')) {
    showColumnPanel.value = false
  }
}
onMounted(() => document.addEventListener('click', handleDocumentClick))
onUnmounted(() => document.removeEventListener('click', handleDocumentClick))
</script>

<template>
  <div class="card">
    <h2>队伍英雄亲合度</h2>
    <p class="desc">
      基于「获取全部数据」标签页里已获取、并按你设置的筛选条件过滤后的「英雄数据」「队伍小分数据」「选手英雄数据」实时计算，
      统计各队伍选取每个英雄的次数。回到「获取全部数据」调整筛选条件后，这里会自动同步更新，无需重新获取或上传文件。
    </p>

    <p v-if="!fetchedData" class="hint">请先在「获取全部数据」标签页点击「获取数据」。</p>

    <template v-else-if="affinity">
      <div class="button-row">
        <button class="primary" :disabled="exporting" @click="exportExcel">{{ exporting ? '导出中...' : '导出 Excel' }}</button>
        <label class="radio-option">
          <input v-model="exportMode" type="radio" value="all" />
          导出全部
        </label>
        <label class="radio-option">
          <input v-model="exportMode" type="radio" value="filtered" />
          导出筛选后数据（含当前列显示设置）
        </label>
      </div>
      <p v-if="exportError" class="season-status error">{{ exportError }}</p>

      <div class="result-toolbar">
        <p class="hint">
          共 {{ rows.length }} 条{{ displayRows.length !== rows.length ? `，筛选后 ${displayRows.length} 条` : '' }}{{
            totalPages > 1 ? `，共 ${totalPages} 页` : ''
          }}，导出的 Excel 包含全部数据（不受页面排序/筛选/分页影响）。
        </p>

        <div class="column-panel-wrap">
          <button type="button" class="column-panel-btn" @click.stop="toggleColumnPanel">列显示 ▾</button>
          <div v-if="showColumnPanel" class="column-panel" @click.stop>
            <label v-for="c in columns" :key="c" class="column-panel-item">
              <input type="checkbox" :checked="!hiddenColumns.has(c)" @change="toggleColumnVisibility(c)" />
              <span>{{ c }}</span>
            </label>
          </div>
        </div>
      </div>

      <div v-if="activeFilterChips.length" class="active-filters">
        <span class="active-filters-label">当前筛选：</span>
        <span v-for="chip in activeFilterChips" :key="chip.column" class="filter-chip" @click="openFilterAt(chip.column, $event)">
          {{ chip.label }}
          <button type="button" class="chip-remove" title="取消该筛选" @click.stop="removeColumnFilter(chip.column)">×</button>
        </span>
        <button type="button" class="link-btn" @click="clearAllFilters">清除全部筛选</button>
      </div>

      <div class="result-table-wrap">
        <table class="result-table">
          <thead>
            <tr>
              <th v-for="c in visibleColumns" :key="c">
                <div class="th-inner">
                  <span class="th-label" @click="toggleSort(c)">
                    {{ c }}
                    <span v-if="sortState && sortState.column === c" class="sort-indicator">{{ sortState.dir === 'asc' ? '▲' : '▼' }}</span>
                  </span>
                  <button type="button" class="filter-btn" :class="{ active: isColumnFiltered(c) }" @click.stop="openFilterAt(c, $event)">▾</button>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in pagedRows" :key="i">
              <td v-for="c in visibleColumns" :key="c">
                <a v-if="isLink(row[c])" :href="String(row[c])" target="_blank" rel="noopener noreferrer">{{ row[c] }}</a>
                <template v-else>{{ row[c] }}</template>
              </td>
            </tr>
            <tr v-if="currentPage === totalPages" class="affinity-total-row">
              <td v-for="c in visibleColumns" :key="c">{{ affinity.totalsRow[c] }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="totalPages > 1" class="pagination">
        <button type="button" class="page-btn" :disabled="currentPage === 1" @click="currentPage--">上一页</button>
        <span class="page-info">第 {{ currentPage }} / {{ totalPages }} 页</span>
        <button type="button" class="page-btn" :disabled="currentPage === totalPages" @click="currentPage++">下一页</button>
      </div>

      <div v-if="openFilterColumn" class="filter-popover" :style="popoverStyle" @click.stop>
        <div class="filter-popover-title">{{ openFilterColumn }}</div>
        <template v-if="isNumericColumn(openFilterColumn)">
          <div class="filter-range">
            <input v-model="rangeMin" type="number" placeholder="最小值" />
            <span>~</span>
            <input v-model="rangeMax" type="number" placeholder="最大值" />
          </div>
          <div class="filter-actions">
            <button type="button" class="link-btn" @click="resetRangeFilter(openFilterColumn)">重置</button>
          </div>
        </template>
        <template v-else>
          <input v-model="filterSearch" type="text" placeholder="搜索选项..." class="filter-search" />
          <div class="filter-actions">
            <button type="button" class="link-btn" @click="resetFilter(openFilterColumn)">全选</button>
            <button type="button" class="link-btn" @click="clearFilter(openFilterColumn)">清空</button>
          </div>
          <div class="filter-options">
            <label v-for="v in filteredDistinctValues(openFilterColumn)" :key="v" class="filter-option">
              <input type="checkbox" :checked="filterSetFor(openFilterColumn)?.has(v)" @change="toggleFilterValue(openFilterColumn, v)" />
              <span>{{ v || '(空)' }}</span>
            </label>
          </div>
        </template>
      </div>
    </template>
  </div>
</template>
