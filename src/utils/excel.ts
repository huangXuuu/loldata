import ExcelJS from 'exceljs'
import type { Row } from '../types'

export async function downloadWorkbook(workbook: ExcelJS.Workbook, filename: string): Promise<void> {
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function safeSheetName(name: string): string {
  return name.slice(0, 31)
}

function autoSizeColumns(sheet: ExcelJS.Worksheet, columns: string[]): void {
  columns.forEach((col, idx) => {
    let maxLen = col.length
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return
      const v = row.getCell(idx + 1).value
      const len = v == null ? 0 : String(v).length
      if (len > maxLen) maxLen = len
    })
    sheet.getColumn(idx + 1).width = Math.min(maxLen + 2, 50)
  })
}

/** Mirrors ExcelExporter.set_sheet_style in GetAllData.py: bold header, fill, borders, autosized columns. */
export function addStyledSheet(workbook: ExcelJS.Workbook, sheetName: string, columns: string[], rows: Row[]): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(safeSheetName(sheetName))
  sheet.addRow(columns)
  for (const row of rows) {
    sheet.addRow(columns.map((c) => row[c] ?? ''))
  }

  const headerRow = sheet.getRow(1)
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF000000' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB3D9B3' } }
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    }
  })

  autoSizeColumns(sheet, columns)
  return sheet
}

/** Plain sheet with header row only, no styling (mirrors plain pandas to_excel calls). */
export function addPlainSheet(workbook: ExcelJS.Workbook, sheetName: string, columns: string[], rows: Row[]): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(safeSheetName(sheetName))
  sheet.addRow(columns)
  for (const row of rows) {
    sheet.addRow(columns.map((c) => row[c] ?? ''))
  }
  return sheet
}

export async function readWorkbookFromFile(file: File): Promise<ExcelJS.Workbook> {
  const buffer = await file.arrayBuffer()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  return workbook
}

export interface SheetTable {
  columns: string[]
  rows: Row[]
}

export function readSheetAsTable(sheet: ExcelJS.Worksheet): SheetTable {
  const headerRow = sheet.getRow(1)
  const columns: string[] = []
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    columns[colNumber - 1] = String(cell.value ?? '')
  })

  const rows: Row[] = []
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const obj: Row = {}
    columns.forEach((col, idx) => {
      if (!col) return
      const cell = row.getCell(idx + 1)
      const value = cell.value
      obj[col] = typeof value === 'object' && value !== null && 'result' in value
        ? ((value as { result: unknown }).result as Row[string])
        : (value as Row[string])
    })
    rows.push(obj)
  })

  return { columns: columns.filter(Boolean), rows }
}
