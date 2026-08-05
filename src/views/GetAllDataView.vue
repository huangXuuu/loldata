<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { fetchHeroData, fetchPlayerData, fetchPlayerHeroData, fetchSeasonList, fetchStageList, fetchTeamData, fetchTeamGameData, type FetchConfig, type StageInfo } from '../api'
import { processHeroData, processPlayerData, processPlayerHeroData, processTeamData, processTeamGameData } from '../dataProcessor'
import { exportToExcel, type ExportColumnOverrides } from '../excelExporter'
import { downloadWorkbook } from '../utils/excel'
import { DEFAULT_API_KEY, DEFAULT_SEASON_ID, DEFAULT_STAGE_IDS } from '../config'
import {
  columnFilters,
  columnRanges,
  fetchedData,
  filteredRowsFor,
  numericColumnsFor,
  parseNumeric,
  resultTabs,
  tabFilters,
  tabFiltersReadonly,
  tabRanges,
  tabRangesReadonly,
  type FetchedData,
} from '../dataStore'
import type { Row } from '../types'

const PAGE_SIZE = 500
const FILTER_OPTION_LIMIT = 300
const HIDDEN_COLUMNS_KEY = 'loldata_hidden_columns_v1'
const FORM_STATE_KEY = 'loldata_form_state_v1'
const FETCHED_DATA_CACHE_KEY = 'loldata_fetched_data_v1'
const FETCHED_DATA_CACHE_TTL_MS = 24 * 60 * 60 * 1000

interface SeasonNode {
  seasonId: number
  seasonName: string
  stageInfos: StageInfo[]
}

const SEASON_CACHE_KEY = 'loldata_season_tree_v2'
const PROBE_BEFORE = 20
const PROBE_AFTER = 10

interface FormState {
  apiKey: string
  filterDate: string
  seasonId: number
  stageIds: string
}

function loadFormState(): Partial<FormState> {
  try {
    const raw = localStorage.getItem(FORM_STATE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

const savedForm = loadFormState()

const apiKey = ref(savedForm.apiKey ?? DEFAULT_API_KEY)
const seasonId = ref(savedForm.seasonId ?? DEFAULT_SEASON_ID)
const playerStageIds = ref(savedForm.stageIds ?? DEFAULT_STAGE_IDS)
const heroStageIds = ref(savedForm.stageIds ?? DEFAULT_STAGE_IDS)
const teamStageId = ref(savedForm.stageIds ?? DEFAULT_STAGE_IDS)
const filterDate = ref(savedForm.filterDate ?? '')

watch([apiKey, filterDate, seasonId, playerStageIds], () => {
  try {
    const state: FormState = { apiKey: apiKey.value, filterDate: filterDate.value, seasonId: seasonId.value, stageIds: playerStageIds.value }
    localStorage.setItem(FORM_STATE_KEY, JSON.stringify(state))
  } catch {
    // localStorage 不可用或已满时忽略
  }
})

const seasonNodes = ref<SeasonNode[]>([])
const treeLoading = ref(false)
const treeError = ref('')
const expandedSeasonId = ref<number | null>(null)
const selectedStageIds = ref<number[]>([])

const showCustomInput = ref(false)
const customSeasonInput = ref('')
const customResolving = ref(false)
const customError = ref('')

function readSeasonCache(): SeasonNode[] | null {
  try {
    const raw = localStorage.getItem(SEASON_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.fetchedAt || !Array.isArray(parsed?.nodes)) return null
    return parsed.nodes
  } catch {
    return null
  }
}

function writeSeasonCache(nodes: SeasonNode[]) {
  try {
    localStorage.setItem(SEASON_CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), nodes }))
  } catch {
    // localStorage 不可用或已满时忽略缓存
  }
}

async function loadSeasonTree(force = false) {
  treeError.value = ''
  if (!force) {
    const cached = readSeasonCache()
    if (cached && cached.length) {
      seasonNodes.value = cached
      selectInitialSeason()
      return
    }
  }

  treeLoading.value = true
  try {
    const key = apiKey.value.trim()
    const candidateIds = new Set<number>()
    for (let id = DEFAULT_SEASON_ID - PROBE_BEFORE; id <= DEFAULT_SEASON_ID + PROBE_AFTER; id++) candidateIds.add(id)

    const dictList = await fetchSeasonList(key).catch(() => [])
    for (const s of dictList) candidateIds.add(s.seasonId)

    const results = await Promise.allSettled(Array.from(candidateIds).map((id) => fetchStageList(id, key)))
    const nodes: SeasonNode[] = []
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.stageInfos.length > 0) {
        nodes.push({ seasonId: r.value.seasonId, seasonName: r.value.seasonName, stageInfos: r.value.stageInfos })
      }
    }

    const sorted = nodes.sort((a, b) => b.seasonId - a.seasonId)
    seasonNodes.value = sorted
    writeSeasonCache(sorted)
  } catch (err) {
    treeError.value = err instanceof Error ? err.message : String(err)
  } finally {
    treeLoading.value = false
    selectInitialSeason()
  }
}

function selectInitialSeason() {
  if (expandedSeasonId.value !== null || !seasonNodes.value.length) return
  const match = seasonNodes.value.find((n) => n.seasonId === seasonId.value) ?? seasonNodes.value[0]
  selectSeason(match)
}

function selectSeason(node: SeasonNode) {
  expandedSeasonId.value = node.seasonId
  seasonId.value = node.seasonId

  const existing = new Set(
    playerStageIds.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
  selectedStageIds.value = node.stageInfos.filter((s) => existing.has(String(s.stageId))).map((s) => s.stageId)
}

function formatDate(iso: string) {
  return iso ? iso.slice(0, 10) : ''
}

function syncStageCsv() {
  const csv = selectedStageIds.value
    .slice()
    .sort((a, b) => a - b)
    .join(',')
  playerStageIds.value = csv
  heroStageIds.value = csv
  teamStageId.value = csv
}

function toggleStage(id: number) {
  const idx = selectedStageIds.value.indexOf(id)
  if (idx >= 0) selectedStageIds.value.splice(idx, 1)
  else selectedStageIds.value.push(id)
  syncStageCsv()
}

async function applyCustomSeason() {
  const id = Number(customSeasonInput.value)
  if (!Number.isFinite(id) || id <= 0) {
    customError.value = '请输入有效的赛季 ID 数字'
    return
  }
  customResolving.value = true
  customError.value = ''
  try {
    const result = await fetchStageList(id, apiKey.value.trim())
    if (result.stageInfos.length === 0) {
      customError.value = `赛季「${result.seasonName}」没有可用的赛段数据`
      return
    }
    const node: SeasonNode = { seasonId: result.seasonId, seasonName: result.seasonName, stageInfos: result.stageInfos }
    const idx = seasonNodes.value.findIndex((n) => n.seasonId === node.seasonId)
    if (idx >= 0) seasonNodes.value[idx] = node
    else seasonNodes.value = [node, ...seasonNodes.value].sort((a, b) => b.seasonId - a.seasonId)
    writeSeasonCache(seasonNodes.value)
    selectSeason(node)
    showCustomInput.value = false
    customSeasonInput.value = ''
  } catch (err) {
    customError.value = err instanceof Error ? err.message : String(err)
  } finally {
    customResolving.value = false
  }
}

onMounted(() => loadSeasonTree(false))

const fetching = ref(false)
const forceRefetch = ref(false)
const exporting = ref(false)
const exportMode = ref<'all' | 'filtered'>('all')
const logs = ref<{ text: string; error?: boolean }[]>([])

function log(text: string, error = false) {
  logs.value.push({ text: `[${new Date().toLocaleTimeString()}] ${text}`, error })
}

interface FetchedDataCache {
  apiKey: string
  seasonId: number
  stageIds: string
  filterDate: string
  fetchedAt: number
  data: FetchedData
}

function readFetchedDataCache(): FetchedDataCache | null {
  try {
    const raw = localStorage.getItem(FETCHED_DATA_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.data) return null
    return parsed
  } catch {
    return null
  }
}

function writeFetchedDataCache(cache: FetchedDataCache) {
  try {
    localStorage.setItem(FETCHED_DATA_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // localStorage 不可用或数据过大时忽略缓存，不影响当次获取结果
  }
}

function selectionMatchesCache(cache: FetchedDataCache): boolean {
  return (
    cache.apiKey === apiKey.value.trim() &&
    cache.seasonId === Number(seasonId.value) &&
    cache.stageIds === playerStageIds.value.trim() &&
    cache.filterDate === filterDate.value &&
    Date.now() - cache.fetchedAt <= FETCHED_DATA_CACHE_TTL_MS
  )
}

/** 命中本地缓存时直接展示，不发任何请求；返回是否命中 */
function tryUseCachedData(): boolean {
  if (forceRefetch.value) return false
  const cached = readFetchedDataCache()
  if (!cached || !selectionMatchesCache(cached)) return false
  fetchedData.value = cached.data
  activeResultKey.value = 'player'
  log('赛季 / 赛段选择未变化，已使用本地缓存数据（未调用接口）。')
  return true
}

onMounted(() => {
  tryUseCachedData()
})

async function fetchData() {
  logs.value = []
  fetching.value = true
  try {
    if (tryUseCachedData()) return

    fetchedData.value = null
    const cfg: FetchConfig = {
      apiKey: apiKey.value.trim(),
      seasonId: Number(seasonId.value),
      playerStageIds: playerStageIds.value.trim(),
      heroStageIds: heroStageIds.value.trim(),
      teamStageId: teamStageId.value.trim(),
    }
    const groupData: Record<string, string> = {}

    log('正在获取选手数据...')
    const playerRaw = await fetchPlayerData(cfg)
    log(`获取到 ${playerRaw.length} 条选手数据`)
    const playerRows = processPlayerData(playerRaw)

    log('正在获取英雄数据...')
    const heroRaw = await fetchHeroData(cfg)
    log(`获取到 ${heroRaw.length} 条英雄数据`)
    const heroRows = processHeroData(heroRaw)

    log('正在获取队伍数据...')
    const teamRaw = await fetchTeamData(cfg)
    log(`获取到 ${teamRaw.length} 条队伍数据`)
    const teamRows = processTeamData(teamRaw)
    const teamIdNameMap: Record<number, string> = {}
    for (const t of teamRaw) teamIdNameMap[t.teamId] = t.teamName ?? ''

    log('正在获取队伍小分数据...')
    const teamGameRaw = await fetchTeamGameData(cfg)
    log(`获取到 ${teamGameRaw.length} 条队伍小分数据`)
    const teamGameRows = processTeamGameData(teamGameRaw, teamIdNameMap, groupData)

    log('正在获取选手英雄数据...')
    let playerHeroRows: Row[] = []
    for (const player of playerRaw) {
      const playerId = player.playerId
      if (!playerId) continue
      const records = await fetchPlayerHeroData(playerId, cfg)
      playerHeroRows = playerHeroRows.concat(processPlayerHeroData(records, playerId, player.playerName ?? ''))
    }
    log(`选手英雄数据处理完成: ${playerHeroRows.length} 条记录`)

    if (filterDate.value) {
      const threshold = new Date(filterDate.value).getTime()
      playerHeroRows = playerHeroRows.filter((r) => {
        const t = new Date(String(r['选取时间'])).getTime()
        return Number.isFinite(t) && t > threshold
      })
      log(`按过滤时间筛选后剩余 ${playerHeroRows.length} 条记录`)
    }

    fetchedData.value = { playerRows, heroRows, teamRows, teamGameRows, playerHeroRows, groupData }
    activeResultKey.value = 'player'
    writeFetchedDataCache({
      apiKey: apiKey.value.trim(),
      seasonId: Number(seasonId.value),
      stageIds: playerStageIds.value.trim(),
      filterDate: filterDate.value,
      fetchedAt: Date.now(),
      data: fetchedData.value,
    })
    log('数据获取完成，可在下方查看，或点击「导出 Excel」下载。')
  } catch (err) {
    console.error(err)
    log(`出错: ${err instanceof Error ? err.message : String(err)}`, true)
  } finally {
    fetching.value = false
  }
}

function visibleColumnsForTab(tabKey: string): string[] {
  const tab = resultTabs.value.find((t) => t.key === tabKey)
  if (!tab) return []
  const hidden = hiddenColumns.value[tabKey]
  if (!hidden || hidden.size === 0) return tab.columns
  return tab.columns.filter((c) => !hidden.has(c))
}

function withFilteredSuffix(filename: string): string {
  return filename.replace(/\.xlsx$/, '_已筛选.xlsx')
}

async function exportData() {
  if (!fetchedData.value) return
  exporting.value = true
  try {
    const useFiltered = exportMode.value === 'filtered'
    const base = fetchedData.value
    const exportParams = {
      playerRows: useFiltered ? filteredRowsFor('player') : base.playerRows,
      heroRows: useFiltered ? filteredRowsFor('hero') : base.heroRows,
      teamRows: useFiltered ? filteredRowsFor('team') : base.teamRows,
      teamGameRows: useFiltered ? filteredRowsFor('teamGame') : base.teamGameRows,
      playerHeroRows: useFiltered ? filteredRowsFor('playerHero') : base.playerHeroRows,
      groupData: base.groupData,
      columns: useFiltered
        ? ({
            player: visibleColumnsForTab('player'),
            hero: visibleColumnsForTab('hero'),
            team: visibleColumnsForTab('team'),
            teamGame: visibleColumnsForTab('teamGame'),
            playerHero: visibleColumnsForTab('playerHero'),
          } satisfies ExportColumnOverrides)
        : undefined,
    }

    log(useFiltered ? '正在生成过滤后 Excel...' : '正在生成完整版 Excel...')
    const full = exportToExcel({ ...exportParams, includeHeroCategories: true })
    await downloadWorkbook(full.workbook, useFiltered ? withFilteredSuffix(full.filename) : full.filename)

    log('正在生成精简版 Excel...')
    const slim = exportToExcel({ ...exportParams, includeHeroCategories: false })
    await downloadWorkbook(slim.workbook, useFiltered ? withFilteredSuffix(slim.filename) : slim.filename)

    log('已触发两个 Excel 文件下载。')
  } catch (err) {
    console.error(err)
    log(`导出出错: ${err instanceof Error ? err.message : String(err)}`, true)
  } finally {
    exporting.value = false
  }
}

const activeResultKey = ref('player')
const activeResultTab = computed(() => resultTabs.value.find((t) => t.key === activeResultKey.value) ?? resultTabs.value[0])

const sortState = ref<{ column: string; dir: 'asc' | 'desc' } | null>(null)
const openFilterColumn = ref<string | null>(null)
const filterSearch = ref('')
const currentPage = ref(1)
const popoverStyle = ref({ top: '0px', left: '0px' })

watch(activeResultKey, () => {
  sortState.value = null
  openFilterColumn.value = null
  filterSearch.value = ''
  currentPage.value = 1
})

watch(
  [columnFilters, columnRanges],
  () => {
    currentPage.value = 1
  },
  { deep: true },
)

const rangeMin = computed({
  get: () => (openFilterColumn.value ? (tabRangesReadonly(activeResultKey.value)[openFilterColumn.value]?.min ?? '') : ''),
  set: (v: string) => {
    const column = openFilterColumn.value
    if (!column) return
    const ranges = tabRanges(activeResultKey.value)
    if (!ranges[column]) ranges[column] = { min: '', max: '' }
    ranges[column].min = v
  },
})

const rangeMax = computed({
  get: () => (openFilterColumn.value ? (tabRangesReadonly(activeResultKey.value)[openFilterColumn.value]?.max ?? '') : ''),
  set: (v: string) => {
    const column = openFilterColumn.value
    if (!column) return
    const ranges = tabRanges(activeResultKey.value)
    if (!ranges[column]) ranges[column] = { min: '', max: '' }
    ranges[column].max = v
  },
})

function filterSetFor(column: string | null): Set<string> | undefined {
  if (!column) return undefined
  return tabFiltersReadonly(activeResultKey.value)[column]
}

function loadHiddenColumns(): Record<string, Set<string>> {
  try {
    const raw = localStorage.getItem(HIDDEN_COLUMNS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    const result: Record<string, Set<string>> = {}
    for (const [key, cols] of Object.entries(parsed)) {
      if (Array.isArray(cols)) result[key] = new Set(cols as string[])
    }
    return result
  } catch {
    return {}
  }
}

const hiddenColumns = ref<Record<string, Set<string>>>(loadHiddenColumns())
const showColumnPanel = ref(false)

watch(
  hiddenColumns,
  () => {
    try {
      const plain: Record<string, string[]> = {}
      for (const [key, set] of Object.entries(hiddenColumns.value)) plain[key] = Array.from(set)
      localStorage.setItem(HIDDEN_COLUMNS_KEY, JSON.stringify(plain))
    } catch {
      // localStorage 不可用或已满时忽略
    }
  },
  { deep: true },
)

function toggleColumnPanel() {
  showColumnPanel.value = !showColumnPanel.value
}

function toggleColumnVisibility(tabKey: string, column: string) {
  if (!hiddenColumns.value[tabKey]) hiddenColumns.value[tabKey] = new Set()
  const set = hiddenColumns.value[tabKey]
  if (set.has(column)) {
    set.delete(column)
  } else {
    set.add(column)
    resetFilter(column)
    resetRangeFilter(column)
    if (sortState.value?.column === column) sortState.value = null
  }
}

const visibleColumns = computed(() => {
  const tab = activeResultTab.value
  if (!tab) return []
  const hidden = hiddenColumns.value[activeResultKey.value]
  if (!hidden || hidden.size === 0) return tab.columns
  return tab.columns.filter((c) => !hidden.has(c))
})

function isLink(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value)
}

const numericColumns = computed(() => numericColumnsFor(activeResultKey.value))

function isNumericColumn(column: string | null): boolean {
  return column !== null && numericColumns.value.has(column)
}

function distinctValuesForColumn(column: string): string[] {
  const tab = activeResultTab.value
  if (!tab) return []
  const set = new Set<string>()
  for (const row of tab.rows) set.add(String(row[column] ?? ''))
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
    const r = tabRangesReadonly(activeResultKey.value)[column]
    return !!r && (r.min !== '' || r.max !== '')
  }
  const set = tabFiltersReadonly(activeResultKey.value)[column]
  if (!set) return false
  return set.size < distinctValuesForColumn(column).length
}

function ensureFilterState(column: string) {
  if (isNumericColumn(column)) {
    const ranges = tabRanges(activeResultKey.value)
    if (!ranges[column]) ranges[column] = { min: '', max: '' }
  } else {
    const filters = tabFilters(activeResultKey.value)
    if (!filters[column]) filters[column] = new Set(distinctValuesForColumn(column))
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
  const set = tabFiltersReadonly(activeResultKey.value)[column]
  if (!set) return
  if (set.has(value)) set.delete(value)
  else set.add(value)
}

function clearFilter(column: string | null) {
  if (!column) return
  tabFilters(activeResultKey.value)[column] = new Set()
}

function resetFilter(column: string | null) {
  if (!column) return
  delete tabFiltersReadonly(activeResultKey.value)[column]
}

function resetRangeFilter(column: string | null) {
  if (!column) return
  tabRanges(activeResultKey.value)[column] = { min: '', max: '' }
}

function removeColumnFilter(column: string) {
  if (isNumericColumn(column)) resetRangeFilter(column)
  else resetFilter(column)
}

function clearAllFilters() {
  columnFilters.value[activeResultKey.value] = {}
  columnRanges.value[activeResultKey.value] = {}
}

const activeFilterChips = computed(() => {
  const tab = activeResultTab.value
  if (!tab) return []
  const filters = tabFiltersReadonly(activeResultKey.value)
  const ranges = tabRangesReadonly(activeResultKey.value)
  const chips: { column: string; label: string }[] = []
  for (const col of tab.columns) {
    if (isNumericColumn(col)) {
      const r = ranges[col]
      if (r && (r.min !== '' || r.max !== '')) {
        let label = col
        if (r.min !== '' && r.max !== '') label += `：${r.min} ~ ${r.max}`
        else if (r.min !== '') label += `：≥ ${r.min}`
        else label += `：≤ ${r.max}`
        chips.push({ column: col, label })
      }
    } else {
      const set = filters[col]
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

const displayRows = computed(() => {
  const tab = activeResultTab.value
  if (!tab) return []
  let rows = filteredRowsFor(activeResultKey.value)

  if (sortState.value && tab.columns.includes(sortState.value.column)) {
    const { column, dir } = sortState.value
    rows = [...rows].sort((a, b) => compareRows(a, b, column) * (dir === 'asc' ? 1 : -1))
  }

  return rows
})

const totalPages = computed(() => Math.max(1, Math.ceil(displayRows.value.length / PAGE_SIZE)))

const pagedRows = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return displayRows.value.slice(start, start + PAGE_SIZE)
})
</script>

<template>
  <div class="card">
    <h2>获取全部数据</h2>
    <p class="desc">先「获取数据」拉取选手 / 英雄 / 队伍 / 选手英雄数据并在下方查看，确认无误后再「导出 Excel」下载完整版与精简版。</p>

    <details class="advanced-fields">
      <summary>高级</summary>
      <div class="field-grid">
        <div class="field">
          <label>API 密钥 (Authorization)</label>
          <input v-model="apiKey" type="text" />
        </div>
        <div class="field">
          <label>过滤时间(可选)</label>
          <div class="input-with-clear">
            <input v-model="filterDate" type="datetime-local" />
            <button v-if="filterDate" type="button" class="clear-btn" title="清除过滤时间" @click="filterDate = ''">×</button>
          </div>
          <p class="hint">
            仅对「选手英雄数据」生效：只保留此时间之后的英雄选取记录。接口不提供逐条记录的版本号，如果想按版本筛选，可以把这里设成目标版本的上线日期作为近似替代。
          </p>
        </div>
      </div>
    </details>

    <div class="field season-tree-wrap">
      <label>赛季与赛段</label>

      <div class="season-tree-toolbar">
        <span v-if="treeLoading" class="season-status">正在扫描赛季列表...</span>
        <span v-else-if="treeError" class="season-status error">{{ treeError }}</span>
        <button type="button" class="link-btn" :disabled="treeLoading" @click="loadSeasonTree(true)">重新扫描最新赛季</button>
        <button type="button" class="link-btn" @click="showCustomInput = !showCustomInput">找不到？手动输入赛季 ID</button>
      </div>

      <div v-if="showCustomInput" class="custom-season">
        <input v-model="customSeasonInput" type="number" placeholder="输入赛季 ID" @keyup.enter="applyCustomSeason" />
        <button type="button" class="primary small" :disabled="customResolving" @click="applyCustomSeason">确认</button>
        <span v-if="customResolving" class="season-status">识别中...</span>
        <span v-else-if="customError" class="season-status error">{{ customError }}</span>
      </div>

      <div class="season-tree">
        <div v-for="node in seasonNodes" :key="node.seasonId" class="season-node">
          <div class="season-row" :class="{ active: expandedSeasonId === node.seasonId }" @click="selectSeason(node)">
            <span class="season-caret">{{ expandedSeasonId === node.seasonId ? '▾' : '▸' }}</span>
            <span class="season-name">{{ node.seasonName }}</span>
            <span class="season-id">#{{ node.seasonId }}</span>
          </div>
          <div v-if="expandedSeasonId === node.seasonId" class="stage-list nested">
            <label v-for="s in node.stageInfos" :key="s.stageId" class="stage-item">
              <input type="checkbox" :checked="selectedStageIds.includes(s.stageId)" @change="toggleStage(s.stageId)" />
              {{ s.stageName }}
              <span v-if="s.startTime" class="stage-date">{{ formatDate(s.startTime) }} ~ {{ formatDate(s.endTime) }}</span>
            </label>
          </div>
        </div>
      </div>
    </div>

    <div class="button-row">
      <button class="primary" :disabled="fetching" @click="fetchData">
        {{ fetching ? '获取中...' : '获取数据' }}
      </button>
      <label class="radio-option" title="赛季/赛段选择不变时默认使用本地缓存数据，勾选后本次强制重新调用接口">
        <input v-model="forceRefetch" type="checkbox" />
        忽略缓存，强制刷新
      </label>
      <button class="primary" :disabled="!fetchedData || exporting" @click="exportData">
        {{ exporting ? '导出中...' : '导出 Excel' }}
      </button>
      <label class="radio-option">
        <input v-model="exportMode" type="radio" value="all" />
        导出全部
      </label>
      <label class="radio-option">
        <input v-model="exportMode" type="radio" value="filtered" />
        导出筛选后数据（含当前列显示设置）
      </label>
    </div>

    <div v-if="logs.length" class="log-box">
      <div v-for="(l, i) in logs" :key="i" class="log-line" :class="{ error: l.error }">{{ l.text }}</div>
    </div>

    <div v-if="resultTabs.length" class="result-area">
      <div class="result-tabs">
        <button
          v-for="t in resultTabs"
          :key="t.key"
          type="button"
          class="result-tab"
          :class="{ active: activeResultKey === t.key }"
          @click="activeResultKey = t.key"
        >
          {{ t.label }}（{{ t.rows.length }}）
        </button>
      </div>

      <div class="result-toolbar">
        <p v-if="activeResultTab" class="hint">
          共 {{ activeResultTab.rows.length }} 条{{ displayRows.length !== activeResultTab.rows.length ? `，筛选后 ${displayRows.length} 条` : '' }}{{
            totalPages > 1 ? `，共 ${totalPages} 页` : ''
          }}，导出的 Excel 包含全部数据（不受页面排序/筛选/分页影响）。
        </p>

        <div v-if="activeResultTab" class="column-panel-wrap">
          <button type="button" class="column-panel-btn" @click.stop="toggleColumnPanel">列显示 ▾</button>
          <div v-if="showColumnPanel" class="column-panel" @click.stop>
            <label v-for="c in activeResultTab.columns" :key="c" class="column-panel-item">
              <input
                type="checkbox"
                :checked="!hiddenColumns[activeResultKey]?.has(c)"
                @change="toggleColumnVisibility(activeResultKey, c)"
              />
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

      <div v-if="activeResultTab" class="result-table-wrap">
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
    </div>
  </div>
</template>
