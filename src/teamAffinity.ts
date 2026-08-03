import ExcelJS from 'exceljs'
import { toNumeric } from './dataProcessor'
import { addStyledSheet } from './utils/excel'
import type { Row } from './types'

export interface TeamAffinityResult {
  columns: string[]
  teamNames: string[]
  rows: Row[]
  totalsRow: Row
}

/** Mirrors GetLastSheetData.py's 队伍版本亲合度 sheet, computed purely in JS so it can be
 * displayed live and re-exported without an Excel round-trip. */
export function computeTeamAffinity(heroRows: Row[], teamGameRows: Row[], playerHeroRows: Row[]): TeamAffinityResult {
  const filteredScore = teamGameRows.filter((r) => r['队伍分组'] === '无分组')

  const teamNames: string[] = []
  const seen = new Set<string>()
  for (const r of filteredScore) {
    for (const key of ['队伍A名字', '队伍B名字'] as const) {
      const name = String(r[key] ?? '')
      if (name && !seen.has(name)) {
        seen.add(name)
        teamNames.push(name)
      }
    }
  }

  const rows: Row[] = heroRows.map((r) => ({ 英雄分路: r['英雄分路'], 英雄名: r['英雄名'], 胜率: r['胜率'] }))

  for (const teamName of teamNames) {
    const counts = new Map<string, number>()
    for (const ph of playerHeroRows) {
      if (String(ph['队伍名'] ?? '') !== teamName) continue
      const hero = String(ph['英雄名'] ?? '')
      counts.set(hero, (counts.get(hero) ?? 0) + 1)
    }
    for (const row of rows) {
      const hero = String(row['英雄名'] ?? '')
      row[teamName] = counts.get(hero) ?? 0
    }
  }

  for (const row of rows) {
    let sum = 0
    for (const teamName of teamNames) sum += toNumeric(row[teamName])
    row['出场次数'] = sum
  }

  const teamTotalGames = new Map<string, number>()
  for (const r of filteredScore) {
    const a = String(r['队伍A名字'] ?? '')
    const b = String(r['队伍B名字'] ?? '')
    const score = toNumeric(r['队伍A比分']) + toNumeric(r['队伍B比分'])
    if (a) teamTotalGames.set(a, (teamTotalGames.get(a) ?? 0) + score)
    if (b) teamTotalGames.set(b, (teamTotalGames.get(b) ?? 0) + score)
  }

  const totalsRow: Row = { 英雄分路: '', 英雄名: '比赛场次合计', 胜率: '' }
  for (const teamName of teamNames) totalsRow[teamName] = teamTotalGames.get(teamName) ?? ''
  totalsRow['出场次数'] = ''

  const columns = ['英雄分路', '英雄名', '胜率', ...teamNames, '出场次数']
  return { columns, teamNames, rows, totalsRow }
}

export function exportTeamAffinity(result: TeamAffinityResult): { workbook: ExcelJS.Workbook; filename: string } {
  const workbook = new ExcelJS.Workbook()
  addStyledSheet(workbook, '队伍版本亲合度'.slice(0, 31), result.columns, [...result.rows, result.totalsRow])
  return { workbook, filename: '队伍版本亲合度.xlsx' }
}
