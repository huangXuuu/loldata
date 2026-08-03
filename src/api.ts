import { API_BASE_URL } from './config'

export interface FetchConfig {
  apiKey: string
  seasonId: number
  playerStageIds: string
  heroStageIds: string
  teamStageId: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RawRecord = Record<string, any>

async function fetchList(endpoint: string, params: Record<string, string | number>, apiKey: string): Promise<RawRecord[]> {
  const url = new URL(`${API_BASE_URL}/${endpoint}`, window.location.origin)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value))
  }

  let response: Response
  try {
    response = await fetch(url.toString(), { headers: { Authorization: apiKey } })
  } catch (err) {
    throw new Error(`网络请求失败 [${url.toString()}]: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`请求失败 [${url.toString()}]: ${response.status} ${response.statusText}${body ? ` - ${body.slice(0, 300)}` : ''}`)
  }
  const data = await response.json()
  if (data?.success === false) {
    throw new Error(`接口返回失败 [${url.toString()}]: ${data?.message ?? JSON.stringify(data).slice(0, 300)}`)
  }

  if (data?.data?.list && Array.isArray(data.data.list)) return data.data.list
  if (Array.isArray(data?.data)) return data.data
  return []
}

export interface StageInfo {
  stageId: number
  stageName: string
  startTime: string
  endTime: string
}

export interface SeasonStages {
  seasonId: number
  seasonName: string
  stageInfos: StageInfo[]
}

export interface SeasonInfo {
  seasonId: number
  seasonName: string
  startTime: string
  endTime: string
  openStatus: boolean
}

export async function fetchSeasonList(apiKey: string): Promise<SeasonInfo[]> {
  const url = new URL(`${API_BASE_URL}/schedule/season`, window.location.origin)

  let response: Response
  try {
    response = await fetch(url.toString(), { headers: { Authorization: apiKey } })
  } catch (err) {
    throw new Error(`网络请求失败 [${url.toString()}]: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`请求失败 [${url.toString()}]: ${response.status} ${response.statusText}${body ? ` - ${body.slice(0, 300)}` : ''}`)
  }
  const data = await response.json()
  if (data?.success === false) {
    throw new Error(`接口返回失败 [${url.toString()}]: ${data?.message ?? JSON.stringify(data).slice(0, 300)}`)
  }
  return Array.isArray(data?.data) ? data.data : []
}

export async function fetchStageList(seasonId: number, apiKey: string): Promise<SeasonStages> {
  const url = new URL(`${API_BASE_URL}/schedule/stage`, window.location.origin)
  url.searchParams.set('seasonId', String(seasonId))

  let response: Response
  try {
    response = await fetch(url.toString(), { headers: { Authorization: apiKey } })
  } catch (err) {
    throw new Error(`网络请求失败 [${url.toString()}]: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`请求失败 [${url.toString()}]: ${response.status} ${response.statusText}${body ? ` - ${body.slice(0, 300)}` : ''}`)
  }
  const data = await response.json()
  if (data?.success === false) {
    throw new Error(`接口返回失败 [${url.toString()}]: ${data?.message ?? JSON.stringify(data).slice(0, 300)}`)
  }
  const result = data?.data
  if (!result?.seasonId || !result?.seasonName) {
    throw new Error(`赛季 ID ${seasonId} 无效或不存在`)
  }
  return result
}

export function fetchPlayerData(cfg: FetchConfig): Promise<RawRecord[]> {
  return fetchList('compound/public/player', { seasonId: cfg.seasonId, stageIds: cfg.playerStageIds }, cfg.apiKey)
}

export function fetchHeroData(cfg: FetchConfig): Promise<RawRecord[]> {
  return fetchList('compound/public/hero', { seasonId: cfg.seasonId, stageIds: cfg.heroStageIds }, cfg.apiKey)
}

export function fetchTeamData(cfg: FetchConfig): Promise<RawRecord[]> {
  return fetchList('compound/public/team', { seasonId: cfg.seasonId }, cfg.apiKey)
}

export function fetchTeamGameData(cfg: FetchConfig): Promise<RawRecord[]> {
  return fetchList('schedule/match', { seasonId: cfg.seasonId }, cfg.apiKey)
}

export async function fetchPlayerHeroData(playerId: number, cfg: FetchConfig): Promise<RawRecord[]> {
  const url = new URL(`${API_BASE_URL}/compound/heroRecord`, window.location.origin)
  url.searchParams.set('playerId', String(playerId))
  url.searchParams.set('seasonId', String(cfg.seasonId))
  url.searchParams.set('stageIds', cfg.teamStageId)

  let response: Response
  try {
    response = await fetch(url.toString(), { headers: { Authorization: cfg.apiKey } })
  } catch (err) {
    throw new Error(`网络请求失败 [${url.toString()}]: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`请求失败 [${url.toString()}]: ${response.status} ${response.statusText}${body ? ` - ${body.slice(0, 300)}` : ''}`)
  }
  const data = await response.json()
  if (data?.success) return data?.data?.heroRecordList ?? []
  throw new Error(`获取选手 ${playerId} 英雄数据失败 [${url.toString()}]: ${data?.message ?? '未知错误'}`)
}
