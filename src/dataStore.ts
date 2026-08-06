import { computed, ref, watch } from 'vue'
import { FIELD_MAPPINGS } from './config'
import { PLAYER_HERO_COLUMNS, TEAM_GAME_COLUMNS } from './excelExporter'
import type { Row } from './types'

export interface FetchedData {
  playerRows: Row[]
  heroRows: Row[]
  teamRows: Row[]
  teamGameRows: Row[]
  playerHeroRows: Row[]
  groupData: Record<string, string>
}

export interface ResultTab {
  key: string
  label: string
  columns: string[]
  rows: Row[]
}

export interface RangeFilter {
  min: string
  max: string
}

export interface SortState {
  column: string
  dir: 'asc' | 'desc'
}

/** The data most recently fetched via GetAllDataView's "获取数据" — shared so other
 * views (e.g. 队伍英雄亲合度) can analyze the same data without a re-fetch or file upload. */
export const fetchedData = ref<FetchedData | null>(null)

export const resultTabs = computed<ResultTab[]>(() => {
  if (!fetchedData.value) return []
  return [
    { key: 'player', label: '选手数据', columns: [...Object.values(FIELD_MAPPINGS.player)], rows: fetchedData.value.playerRows },
    { key: 'hero', label: '英雄数据', columns: [...Object.values(FIELD_MAPPINGS.hero)], rows: fetchedData.value.heroRows },
    { key: 'team', label: '队伍数据', columns: [...Object.values(FIELD_MAPPINGS.team)], rows: fetchedData.value.teamRows },
    { key: 'teamGame', label: '队伍小分数据', columns: TEAM_GAME_COLUMNS, rows: fetchedData.value.teamGameRows },
    { key: 'playerHero', label: '选手英雄数据', columns: PLAYER_HERO_COLUMNS, rows: fetchedData.value.playerHeroRows },
  ]
})

export function tabByKey(key: string): ResultTab | undefined {
  return resultTabs.value.find((t) => t.key === key)
}

export function parseNumeric(value: unknown): number {
  return parseFloat(String(value ?? '').replace('%', '').replace(/,/g, ''))
}

const COLUMN_FILTERS_KEY = 'loldata_column_filters_v1'

function loadPersistedFilters(): { cat: Record<string, Record<string, Set<string>>>; range: Record<string, Record<string, RangeFilter>> } {
  try {
    const raw = localStorage.getItem(COLUMN_FILTERS_KEY)
    if (!raw) return { cat: {}, range: {} }
    const parsed = JSON.parse(raw)
    const cat: Record<string, Record<string, Set<string>>> = {}
    for (const [tabKey, cols] of Object.entries(parsed?.cat ?? {})) {
      cat[tabKey] = {}
      for (const [col, vals] of Object.entries(cols as Record<string, string[]>)) {
        if (Array.isArray(vals)) cat[tabKey][col] = new Set(vals)
      }
    }
    const range = parsed?.range && typeof parsed.range === 'object' ? parsed.range : {}
    return { cat, range }
  } catch {
    return { cat: {}, range: {} }
  }
}

const persistedFilters = loadPersistedFilters()

/** Per-tab column filters/ranges — shared so any view can read the "current filtered slice"
 * of a dataset (hero/teamGame/playerHero/...) exactly as the user configured it in GetAllDataView. */
export const columnFilters = ref<Record<string, Record<string, Set<string>>>>(persistedFilters.cat)
export const columnRanges = ref<Record<string, Record<string, RangeFilter>>>(persistedFilters.range)

watch(
  [columnFilters, columnRanges],
  () => {
    try {
      const cat: Record<string, Record<string, string[]>> = {}
      for (const [tabKey, cols] of Object.entries(columnFilters.value)) {
        cat[tabKey] = {}
        for (const [col, set] of Object.entries(cols)) cat[tabKey][col] = Array.from(set)
      }
      localStorage.setItem(COLUMN_FILTERS_KEY, JSON.stringify({ cat, range: columnRanges.value }))
    } catch {
      // localStorage 不可用或已满时忽略
    }
  },
  { deep: true },
)

const COLUMN_SORT_KEY = 'loldata_column_sort_v1'

function loadPersistedSort(): Record<string, SortState | null> {
  try {
    const raw = localStorage.getItem(COLUMN_SORT_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

/** Per-tab sort column/direction — persisted the same way as columnFilters/columnRanges. */
export const columnSort = ref<Record<string, SortState | null>>(loadPersistedSort())

watch(
  columnSort,
  () => {
    try {
      localStorage.setItem(COLUMN_SORT_KEY, JSON.stringify(columnSort.value))
    } catch {
      // localStorage 不可用或已满时忽略
    }
  },
  { deep: true },
)

export function tabSort(tabKey: string): SortState | null {
  return columnSort.value[tabKey] ?? null
}

export function setTabSort(tabKey: string, sort: SortState | null) {
  columnSort.value[tabKey] = sort
}

// Mutating accessors: create the per-tab container if missing. Only call from
// event handlers (never from computed()/render, to avoid mutating state while Vue tracks reads).
export function tabFilters(tabKey: string): Record<string, Set<string>> {
  if (!columnFilters.value[tabKey]) columnFilters.value[tabKey] = {}
  return columnFilters.value[tabKey]
}

export function tabRanges(tabKey: string): Record<string, RangeFilter> {
  if (!columnRanges.value[tabKey]) columnRanges.value[tabKey] = {}
  return columnRanges.value[tabKey]
}

// Read-only accessors: safe to call from computed()/render — never mutate state.
export function tabFiltersReadonly(tabKey: string): Record<string, Set<string>> {
  return columnFilters.value[tabKey] ?? {}
}

export function tabRangesReadonly(tabKey: string): Record<string, RangeFilter> {
  return columnRanges.value[tabKey] ?? {}
}

export function numericColumnsFor(tabKey: string): Set<string> {
  const tab = tabByKey(tabKey)
  const set = new Set<string>()
  if (!tab) return set
  for (const col of tab.columns) {
    let numeric = 0
    let total = 0
    for (const row of tab.rows) {
      const raw = row[col]
      if (raw === null || raw === undefined || String(raw).trim() === '') continue
      total++
      if (!Number.isNaN(parseNumeric(raw))) numeric++
    }
    if (total > 0 && numeric / total >= 0.9) set.add(col)
  }
  return set
}

/** The rows for a tab after applying its current column filters/ranges — this is the
 * "post-filter" view other analyses (e.g. 队伍英雄亲合度) should read, not the raw fetch. */
export function filteredRowsFor(tabKey: string): Row[] {
  const tab = tabByKey(tabKey)
  if (!tab) return []
  let rows = tab.rows

  const filters = tabFiltersReadonly(tabKey)
  const ranges = tabRangesReadonly(tabKey)
  const numeric = numericColumnsFor(tabKey)

  const catFilters = Object.entries(filters).filter(([col]) => tab.columns.includes(col) && !numeric.has(col))
  if (catFilters.length) {
    rows = rows.filter((row) => catFilters.every(([col, set]) => set.has(String(row[col] ?? ''))))
  }

  const rangeFilters = Object.entries(ranges).filter(([col, r]) => tab.columns.includes(col) && (r.min !== '' || r.max !== ''))
  if (rangeFilters.length) {
    rows = rows.filter((row) =>
      rangeFilters.every(([col, r]) => {
        const n = parseNumeric(row[col])
        if (Number.isNaN(n)) return false
        if (r.min !== '' && n < parseFloat(r.min)) return false
        if (r.max !== '' && n > parseFloat(r.max)) return false
        return true
      }),
    )
  }

  return rows
}
