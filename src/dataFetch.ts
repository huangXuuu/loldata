import { ref } from 'vue'
import { fetchHeroData, fetchPlayerData, fetchPlayerHeroData, fetchTeamData, fetchTeamGameData, type FetchConfig } from './api'
import { processHeroData, processPlayerData, processPlayerHeroData, processTeamData, processTeamGameData } from './dataProcessor'
import { DEFAULT_API_KEY, DEFAULT_SEASON_ID, DEFAULT_STAGE_IDS } from './config'
import { fetchedData, type FetchedData } from './dataStore'
import type { Row } from './types'

// 获取参数（赛季/赛段选择）与实际获取数据的逻辑，从 GetAllDataView 抽出来共享——
// 这样「全局BP模拟器」等其他 tab 也能在没有数据时自己触发一次获取，不用先手动跑一遍「获取全部数据」。

export interface FormState {
  apiKey: string
  filterDate: string
  seasonId: number
  stageIds: string
}

const FORM_STATE_KEY = 'loldata_form_state_v1'

export function loadFormState(): Partial<FormState> {
  try {
    const raw = localStorage.getItem(FORM_STATE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

export function saveFormState(state: FormState) {
  try {
    localStorage.setItem(FORM_STATE_KEY, JSON.stringify(state))
  } catch {
    // localStorage 不可用或已满时忽略
  }
}

/** 上次保存的选择，没有的话回退到默认赛季/赛段 —— 供未经手动配置直接触发获取的场景使用 */
export function defaultFormState(): FormState {
  const saved = loadFormState()
  return {
    apiKey: saved.apiKey ?? DEFAULT_API_KEY,
    seasonId: saved.seasonId ?? DEFAULT_SEASON_ID,
    stageIds: saved.stageIds ?? DEFAULT_STAGE_IDS,
    filterDate: saved.filterDate ?? '',
  }
}

const FETCHED_DATA_CACHE_KEY = 'loldata_fetched_data_v1'
const FETCHED_DATA_CACHE_TTL_MS = 24 * 60 * 60 * 1000

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

function cacheMatches(cache: FetchedDataCache, cfg: FormState): boolean {
  return (
    cache.apiKey === cfg.apiKey.trim() &&
    cache.seasonId === Number(cfg.seasonId) &&
    cache.stageIds === cfg.stageIds.trim() &&
    cache.filterDate === cfg.filterDate &&
    Date.now() - cache.fetchedAt <= FETCHED_DATA_CACHE_TTL_MS
  )
}

export type LogFn = (text: string, error?: boolean) => void

export const fetching = ref(false)

/** 命中本地缓存时直接展示，不发任何请求；返回是否命中 */
export function tryUseCachedData(cfg: FormState, log?: LogFn): boolean {
  const cached = readFetchedDataCache()
  if (!cached || !cacheMatches(cached, cfg)) return false
  fetchedData.value = cached.data
  log?.('赛季 / 赛段选择未变化，已使用本地缓存数据（未调用接口）。')
  return true
}

export async function fetchAllData(cfg: FormState, opts: { log?: LogFn; forceRefetch?: boolean } = {}): Promise<void> {
  const log = opts.log ?? (() => {})
  if (!opts.forceRefetch && tryUseCachedData(cfg, log)) return

  fetching.value = true
  fetchedData.value = null
  try {
    const apiCfg: FetchConfig = {
      apiKey: cfg.apiKey.trim(),
      seasonId: Number(cfg.seasonId),
      playerStageIds: cfg.stageIds.trim(),
      heroStageIds: cfg.stageIds.trim(),
      teamStageId: cfg.stageIds.trim(),
    }
    const groupData: Record<string, string> = {}

    log('正在获取选手数据...')
    const playerRaw = await fetchPlayerData(apiCfg)
    log(`获取到 ${playerRaw.length} 条选手数据`)
    const playerRows = processPlayerData(playerRaw)

    log('正在获取英雄数据...')
    const heroRaw = await fetchHeroData(apiCfg)
    log(`获取到 ${heroRaw.length} 条英雄数据`)
    const heroRows = processHeroData(heroRaw)

    log('正在获取队伍数据...')
    const teamRaw = await fetchTeamData(apiCfg)
    log(`获取到 ${teamRaw.length} 条队伍数据`)
    const teamRows = processTeamData(teamRaw)
    const teamIdNameMap: Record<number, string> = {}
    for (const t of teamRaw) teamIdNameMap[t.teamId] = t.teamName ?? ''

    log('正在获取队伍小分数据...')
    const teamGameRaw = await fetchTeamGameData(apiCfg)
    log(`获取到 ${teamGameRaw.length} 条队伍小分数据`)
    const teamGameRows = processTeamGameData(teamGameRaw, teamIdNameMap, groupData)

    log('正在获取选手英雄数据...')
    let playerHeroRows: Row[] = []
    for (const player of playerRaw) {
      const playerId = player.playerId
      if (!playerId) continue
      const records = await fetchPlayerHeroData(playerId, apiCfg)
      playerHeroRows = playerHeroRows.concat(processPlayerHeroData(records, playerId, player.playerName ?? ''))
    }
    log(`选手英雄数据处理完成: ${playerHeroRows.length} 条记录`)

    if (cfg.filterDate) {
      const threshold = new Date(cfg.filterDate).getTime()
      playerHeroRows = playerHeroRows.filter((r) => {
        const t = new Date(String(r['选取时间'])).getTime()
        return Number.isFinite(t) && t > threshold
      })
      log(`按过滤时间筛选后剩余 ${playerHeroRows.length} 条记录`)
    }

    fetchedData.value = { playerRows, heroRows, teamRows, teamGameRows, playerHeroRows, groupData }
    writeFetchedDataCache({
      apiKey: apiCfg.apiKey,
      seasonId: apiCfg.seasonId,
      stageIds: apiCfg.playerStageIds,
      filterDate: cfg.filterDate,
      fetchedAt: Date.now(),
      data: fetchedData.value,
    })
    log('数据获取完成，可在下方查看，或点击「导出 Excel」下载。')
  } catch (err) {
    console.error(err)
    log(`出错: ${err instanceof Error ? err.message : String(err)}`, true)
    throw err
  } finally {
    fetching.value = false
  }
}
