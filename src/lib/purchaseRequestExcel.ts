// 구매요청서 Excel 생성 — exceljs. 기존(레거시) 구매요청서 폼 양식 준수.
import ExcelJS from 'exceljs'

const FONT = '맑은 고딕'
const bold16 = { name: FONT, bold: true, size: 16 }
const bold11 = { name: FONT, bold: true, size: 11 }
const norm11 = { name: FONT, size: 11 }
const ca = { horizontal: 'center', vertical: 'middle' } as const
const la = { horizontal: 'left', vertical: 'middle' } as const
const fillHdr = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EDF5' } } as const

type WS = ExcelJS.Worksheet
type CellOpts = { font?: Partial<ExcelJS.Font>; align?: Partial<ExcelJS.Alignment>; fill?: ExcelJS.Fill }
function put(ws: WS, r: number, c: number, value: ExcelJS.CellValue, o: CellOpts = {}) {
  const cell = ws.getCell(r, c)
  cell.value = value
  if (o.font) cell.font = o.font
  if (o.align) cell.alignment = o.align
  if (o.fill) cell.fill = o.fill
  return cell
}

export type PurchaseItem = { 품명: string; 수량: number; 링크?: string }
export type PurchaseRequestData = {
  requester_name: string
  requester_center: string
  requested_at: string
  reason: string
  cost_note: string | null
  notes: string | null
  items: PurchaseItem[]
}

// KST 날짜시간 (YYYY-MM-DD HH:mm)
function kstDateTime(ts: string) {
  if (!ts) return ''
  try {
    return new Date(new Date(ts).getTime() + 9 * 3600 * 1000)
      .toISOString().slice(0, 16).replace('T', ' ')
  } catch { return ts.slice(0, 16) }
}
// KST 날짜 (YYYYMMDD) — 파일명용
function kstDateCompact(ts: string) {
  if (!ts) return ''
  try {
    return new Date(new Date(ts).getTime() + 9 * 3600 * 1000)
      .toISOString().slice(0, 10).replace(/-/g, '')
  } catch { return ts.slice(0, 10).replace(/-/g, '') }
}

export async function downloadPurchaseRequest(req: PurchaseRequestData) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('구매요청서')

  ;[14, 28.875, 8, 50].forEach((w, i) => { ws.getColumn(i + 1).width = w })

  // ── 제목 ────────────────────────────────────────────────────────────────
  ws.mergeCells(1, 1, 1, 4)
  put(ws, 1, 1, '구매 요청서', { font: bold16, align: ca })
  ws.getRow(1).height = 32.1

  // ── 요청 정보 ───────────────────────────────────────────────────────────
  put(ws, 3, 1, '요청자', { font: bold11, align: la })
  put(ws, 3, 2, req.requester_name, { font: norm11, align: la })
  put(ws, 3, 3, '소속', { font: bold11, align: la })
  put(ws, 3, 4, req.requester_center, { font: norm11, align: la })

  put(ws, 4, 1, '요청일', { font: bold11, align: la })
  put(ws, 4, 2, kstDateTime(req.requested_at), { font: norm11, align: la })

  put(ws, 5, 1, '구매사유', { font: bold11, align: la })
  ws.mergeCells(5, 2, 5, 4)
  put(ws, 5, 2, req.reason || '', { font: norm11, align: la })

  put(ws, 6, 1, '원가반영', { font: bold11, align: la })
  ws.mergeCells(6, 2, 6, 4)
  put(ws, 6, 2, req.cost_note || '', { font: norm11, align: la })

  let r = 7
  if (req.notes) {
    put(ws, r, 1, '비고', { font: bold11, align: la })
    ws.mergeCells(r, 2, r, 4)
    put(ws, r, 2, req.notes, { font: norm11, align: la })
    r++
  }

  // ── 품목 표 ─────────────────────────────────────────────────────────────
  r++ // 한 줄 비움
  ;['No', '품명', '수량', '링크'].forEach((h, i) =>
    put(ws, r, i + 1, h, { font: bold11, align: ca, fill: fillHdr }))
  r++
  req.items.forEach((it, idx) => {
    put(ws, r, 1, idx + 1, { font: norm11 })
    put(ws, r, 2, it.품명, { font: norm11 })
    put(ws, r, 3, it.수량, { font: norm11 })
    put(ws, r, 4, it.링크 || '', { font: norm11 })
    r++
  })

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `구매요청서_${req.requester_name}_${kstDateCompact(req.requested_at)}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
