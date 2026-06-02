// 인수인계증 Excel 생성 (서식 포함) — wms_v2 gen_handover_xlsx 포팅 (exceljs)
import ExcelJS from 'exceljs'
import { buildCenterPivot, XLSX_ROW_ORDER, type TerminalMovement } from './terminal'

const FONT = '맑은 고딕'
const bold14 = { name: FONT, bold: true, size: 14 }
const bold11 = { name: FONT, bold: true, size: 11 }
const bold10 = { name: FONT, bold: true, size: 10 }
const norm10 = { name: FONT, size: 10 }
const ca = { horizontal: 'center', vertical: 'middle' } as const
const la = { horizontal: 'left', vertical: 'middle' } as const
const thin = { style: 'thin' as const }
const bdr = { top: thin, left: thin, bottom: thin, right: thin }
const fillGray = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } } as const
const fillLblue = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDD7EE' } } as const
const fillTotal = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } } as const

type WS = ExcelJS.Worksheet
type CellOpts = {
  font?: Partial<ExcelJS.Font>
  align?: Partial<ExcelJS.Alignment>
  fill?: ExcelJS.Fill
  border?: Partial<ExcelJS.Borders>
}
function put(ws: WS, r: number, c: number, value: ExcelJS.CellValue, o: CellOpts = {}) {
  const cell = ws.getCell(r, c)
  cell.value = value
  if (o.font) cell.font = o.font
  if (o.align) cell.alignment = o.align
  if (o.fill) cell.fill = o.fill
  if (o.border) cell.border = o.border
  return cell
}

function orderEntries(rows: TerminalMovement[]): { device: string; sub: string; cnt: number }[] {
  const counts = new Map<string, number>()
  for (const r of rows) {
    const k = `${r.device_type}|${r.sub_type}`
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const orderMap = new Map(XLSX_ROW_ORDER.map(([d, s], i) => [`${d}|${s}`, i]))
  return [...counts.entries()]
    .sort((a, b) => (orderMap.get(a[0]) ?? 999) - (orderMap.get(b[0]) ?? 999))
    .map(([k, cnt]) => { const [device, sub] = k.split('|'); return { device, sub, cnt } })
}

function setWidths(ws: WS) {
  ;[12, 30, 28, 22].forEach((w, i) => { ws.getColumn(i + 1).width = w })
}

function writeHeader(ws: WS, r: number, title: string, from: string, to: string, rows: TerminalMovement[], date: string) {
  ws.mergeCells(r, 1, r, 4)
  put(ws, r, 1, title, { font: bold14, align: ca })
  ws.getRow(r).height = 30
  put(ws, r + 1, 1, '출발센터', { font: bold11, align: la })
  put(ws, r + 1, 2, from, { font: norm10, align: la })
  put(ws, r + 1, 3, '도착센터', { font: bold11, align: la })
  put(ws, r + 1, 4, to, { font: norm10, align: la })
  put(ws, r + 2, 1, '날짜', { font: bold11, align: la })
  put(ws, r + 2, 2, date, { font: norm10, align: la })
  put(ws, r + 2, 3, '총 수량', { font: bold11, align: la })
  put(ws, r + 2, 4, `${rows.length.toLocaleString()}대`, { font: norm10, align: la })
}

function writeDeviceSummary(ws: WS, r: number, rows: TerminalMovement[]): number {
  ws.mergeCells(r, 1, r, 4)
  put(ws, r, 1, '종류별 수량 요약', { font: bold11, align: ca, fill: fillLblue })
  r++
  ;['No', '단말기종류', '유형', '수량'].forEach((h, i) =>
    put(ws, r, i + 1, h, { font: bold11, align: ca, fill: fillGray, border: bdr }))
  r++
  const entries = orderEntries(rows)
  entries.forEach((e, idx) => {
    ;[idx + 1, e.device, e.sub, e.cnt].forEach((v, i) =>
      put(ws, r, i + 1, v, { font: norm10, align: ca, border: bdr }))
    r++
  })
  ws.mergeCells(r, 1, r, 3)
  put(ws, r, 1, '합계', { font: bold10, align: ca, fill: fillTotal, border: bdr })
  put(ws, r, 2, '', { fill: fillTotal, border: bdr })
  put(ws, r, 3, '', { fill: fillTotal, border: bdr })
  put(ws, r, 4, rows.length, { font: bold10, align: ca, fill: fillTotal, border: bdr })
  r++
  return r
}

function writeNotesSig(ws: WS, r: number, notes: string): number {
  r++
  ws.mergeCells(r, 1, r, 4)
  put(ws, r, 1, '비고', { font: bold11, align: ca, fill: fillGray, border: bdr })
  for (let c = 2; c <= 4; c++) put(ws, r, c, '', { fill: fillGray, border: bdr })
  r++
  const ns = r
  ws.mergeCells(ns, 1, ns + 3, 4)
  put(ws, ns, 1, notes || '', { font: norm10, align: { horizontal: 'left', vertical: 'top', wrapText: true } as const })
  for (let ri = ns; ri <= ns + 3; ri++) {
    ws.getRow(ri).height = 18
    for (let ci = 1; ci <= 4; ci++) {
      put(ws, ri, ci, ws.getCell(ri, ci).value, {
        border: {
          top: ri === ns ? thin : undefined,
          bottom: ri === ns + 3 ? thin : undefined,
          left: ci === 1 ? thin : undefined,
          right: ci === 4 ? thin : undefined,
        },
      })
    }
  }
  r += 4
  r += 2
  put(ws, r, 2, '인계자', { font: bold11 })
  put(ws, r, 4, '인수자', { font: bold11 })
  r++
  put(ws, r, 2, '(서명)', { align: ca })
  put(ws, r, 4, '(서명)', { align: ca })
  r++
  return r
}

function writeTrcnList(ws: WS, r: number, rows: TerminalMovement[]): number {
  const CHUNK = 30
  const list = rows.map(r => r.trcn_id).sort()
  ws.mergeCells(r, 1, r, 4)
  put(ws, r, 1, '단말기 IH 목록', { font: bold11, align: ca, fill: fillLblue })
  r++
  for (const base of [1, 3]) {
    put(ws, r, base, 'No', { font: bold11, align: ca, fill: fillGray, border: bdr })
    put(ws, r, base + 1, 'IH (TRCN_ID)', { font: bold11, align: ca, fill: fillGray, border: bdr })
  }
  r++
  for (let blk = 0; blk < Math.max(list.length, 1); blk += CHUNK * 2) {
    const left = list.slice(blk, blk + CHUNK)
    const right = list.slice(blk + CHUNK, blk + CHUNK * 2)
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
      if (i < left.length) {
        put(ws, r, 1, blk + i + 1, { font: norm10, align: ca, border: bdr })
        put(ws, r, 2, left[i], { font: norm10, align: ca, border: bdr })
      }
      if (i < right.length) {
        put(ws, r, 3, blk + CHUNK + i + 1, { font: norm10, align: ca, border: bdr })
        put(ws, r, 4, right[i], { font: norm10, align: ca, border: bdr })
      }
      r++
    }
  }
  return r
}

function writeCenterSheet(ws: WS, rows: TerminalMovement[], from: string, to: string, notes: string, date: string) {
  setWidths(ws)
  writeHeader(ws, 1, '단말기 이동 인수인계증 — 요약', from, to, rows, date)
  let r = 5
  r = writeDeviceSummary(ws, r, rows)
  r = writeNotesSig(ws, r, notes)
  r += 2
  writeHeader(ws, r, '단말기 이동 인수인계증 — 상세', from, to, rows, date)
  r += 4
  r = writeTrcnList(ws, r, rows)
  r += 1
  ws.pageSetup = {
    fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true,
    margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
  }
}

function safeSheetName(name: string): string {
  return name.replace(/[\\/*?:[\]]/g, '_').slice(0, 31)
}

function writeSummarySheet(
  ws: WS, rows: TerminalMovement[], fromC: string, toC: string, direction: 'in' | 'out', date: string,
) {
  const pivot = buildCenterPivot(rows, direction)
  const cols = pivot?.centers ?? []
  const totalCols = cols.length + 2
  ws.getColumn(1).width = 16
  for (let ci = 2; ci <= totalCols; ci++) ws.getColumn(ci).width = 9

  const lblFrom = fromC === '타센터' ? '각 센터' : fromC
  const lblTo = toC === '타센터' ? '각 센터' : toC

  ws.mergeCells(1, 1, 1, totalCols)
  put(ws, 1, 1, '단말기 이동 인수인계증 — 센터별 요약', { font: bold14, align: ca })
  ws.getRow(1).height = 30
  put(ws, 2, 1, '출발센터', { font: bold11, align: la })
  put(ws, 2, 2, lblFrom, { font: norm10, align: la })
  put(ws, 2, 3, '도착센터', { font: bold11, align: la })
  put(ws, 2, 4, lblTo, { font: norm10, align: la })
  put(ws, 3, 1, '날짜', { font: bold11, align: la })
  put(ws, 3, 2, date, { font: norm10, align: la })
  put(ws, 3, 3, '총 수량', { font: bold11, align: la })
  put(ws, 3, 4, `${rows.length.toLocaleString()}대`, { font: norm10, align: la })

  let r = 5
  ws.mergeCells(r, 1, r, totalCols)
  put(ws, r, 1, direction === 'out' ? '센터별 출고 현황' : '센터별 입고 현황', { font: bold11, align: ca, fill: fillLblue })
  r++

  if (pivot && pivot.rows.length) {
    const sumCi = cols.length + 2
    put(ws, r, 1, '종류', { font: bold11, align: ca, fill: fillGray, border: bdr })
    cols.forEach((cn, i) => put(ws, r, i + 2, cn, { font: bold11, align: ca, fill: fillGray, border: bdr }))
    put(ws, r, sumCi, '합계', { font: bold11, align: ca, fill: fillGray, border: bdr })
    r++
    const colTotals = new Array(cols.length).fill(0)
    for (const row of pivot.rows) {
      put(ws, r, 1, row.rowKey, { font: norm10, align: la, border: bdr })
      row.cells.forEach((v, i) => {
        put(ws, r, i + 2, v > 0 ? v : '', { font: norm10, align: ca, border: bdr })
        colTotals[i] += v
      })
      put(ws, r, sumCi, row.total, { font: bold10, align: ca, fill: fillTotal, border: bdr })
      r++
    }
    put(ws, r, 1, '합계', { font: bold10, align: ca, fill: fillTotal, border: bdr })
    colTotals.forEach((ct, i) => put(ws, r, i + 2, ct, { font: bold10, align: ca, fill: fillTotal, border: bdr }))
    put(ws, r, sumCi, rows.length, { font: bold10, align: ca, fill: fillTotal, border: bdr })
  } else {
    ws.mergeCells(r, 1, r, totalCols)
    put(ws, r, 1, '데이터 없음', { font: norm10, align: ca })
  }
}

/**
 * 인수인계증 다운로드.
 * perCenter: 'from'|'to' 이면 해당 센터별로 시트 분리(+전체요약), null 이면 단일 시트.
 */
export async function downloadHandover(
  rows: TerminalMovement[],
  fromC: string,
  toC: string,
  date: string,
  notes: string,
  perCenter: 'from' | 'to' | null,
) {
  const wb = new ExcelJS.Workbook()

  if (perCenter) {
    const field = perCenter === 'to' ? 'to_center' : 'from_center'
    const direction: 'in' | 'out' = perCenter === 'to' ? 'out' : 'in'
    // 전체요약 시트
    const ws0 = wb.addWorksheet('전체요약')
    writeSummarySheet(ws0, rows, fromC, toC, direction, date)
    // 센터별 시트
    const groups = new Map<string, TerminalMovement[]>()
    for (const r of rows) {
      const k = r[field] || '미확인'
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(r)
    }
    for (const cname of [...groups.keys()].sort()) {
      const ws = wb.addWorksheet(safeSheetName(cname))
      const f = perCenter === 'to' ? fromC : cname
      const t = perCenter === 'to' ? cname : toC
      writeCenterSheet(ws, groups.get(cname)!, f, t, notes, date)
    }
  } else {
    const ws = wb.addWorksheet('인수인계증')
    writeCenterSheet(ws, rows, fromC, toC, notes, date)
  }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `인수인계증_${date}_${fromC}→${toC}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
