import ExcelJS from 'exceljs'
import { FIELD_MAPPINGS } from './config'
import { addKdaRanking, filterHeroesByWinRate } from './dataProcessor'
import { addStyledSheet } from './utils/excel'
import type { Row } from './types'

export interface ExportColumnOverrides {
  player?: string[]
  hero?: string[]
  team?: string[]
  teamGame?: string[]
  playerHero?: string[]
}

export interface ExportParams {
  playerRows: Row[]
  heroRows: Row[]
  teamRows: Row[]
  teamGameRows: Row[]
  playerHeroRows: Row[]
  groupData: Record<string, string>
  includeHeroCategories: boolean
  /** Optional per-sheet column subset (e.g. reflecting the user's "列显示" choices).
   * Only affects the five raw-data sheets — 选手排名/英雄分类 sheets always use the full column set. */
  columns?: ExportColumnOverrides
}

export const TEAM_GAME_COLUMNS = [...Object.values(FIELD_MAPPINGS.team_game), '比赛详情页', '获胜队伍名']
export const PLAYER_HERO_COLUMNS = ['选手系统ID', '选手名', ...Object.values(FIELD_MAPPINGS.player_hero), '获胜方队伍名']

/** Mirrors ExcelExporter.export_to_excel in GetAllData.py. */
export function exportToExcel(params: ExportParams): { workbook: ExcelJS.Workbook; filename: string } {
  const workbook = new ExcelJS.Workbook()
  const playerColumns = params.columns?.player ?? Object.values(FIELD_MAPPINGS.player)
  const heroColumns = params.columns?.hero ?? Object.values(FIELD_MAPPINGS.hero)
  const teamColumns = params.columns?.team ?? Object.values(FIELD_MAPPINGS.team)
  const teamGameColumns = params.columns?.teamGame ?? TEAM_GAME_COLUMNS
  const playerHeroColumns = params.columns?.playerHero ?? PLAYER_HERO_COLUMNS

  if (params.playerRows.length) {
    addStyledSheet(workbook, '选手数据', playerColumns, params.playerRows)
  }

  const ranked = addKdaRanking(params.playerRows, params.groupData)
  if (ranked.rows.length) {
    addStyledSheet(workbook, '选手排名', ranked.columns, ranked.rows)
  }

  if (params.heroRows.length) {
    addStyledSheet(workbook, '英雄数据', heroColumns, params.heroRows)

    if (params.includeHeroCategories) {
      const categories = filterHeroesByWinRate(params.heroRows)
      for (const [sheetName, rows] of Object.entries(categories)) {
        if (rows.length) addStyledSheet(workbook, sheetName, Object.values(FIELD_MAPPINGS.hero), rows)
      }
    }
  }

  if (params.teamRows.length) {
    addStyledSheet(workbook, '队伍主数据', teamColumns, params.teamRows)
  }

  if (params.teamGameRows.length) {
    addStyledSheet(workbook, '队伍小分数据', teamGameColumns, params.teamGameRows)
  }

  if (params.playerHeroRows.length) {
    addStyledSheet(workbook, '选手英雄数据', playerHeroColumns, params.playerHeroRows)
  }

  const filename = params.includeHeroCategories ? '综合数据.xlsx' : '综合数据_精简版.xlsx'
  return { workbook, filename }
}
