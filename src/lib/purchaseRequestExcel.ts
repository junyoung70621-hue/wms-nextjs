// 구매 요청서(품의서) Excel 생성 — exceljs. handoverExcel.ts 스타일 패턴 준수.
import ExcelJS from 'exceljs'

const FONT = '맑은 고딕'
const bold16 = { name: FONT, bold: true, size: 16 }
const bold11 = { name: FONT, bold: true, size: 11 }
const bold10 = { name: FONT, bold: true, size: 10 }
const norm10 = { name: FONT, size: 10 }
const ca = { horizontal: 'center', vertical: 'middle' } as const
const la = { horizontal: 'left', vertical: 'middle' } as const
const lt = { horizontal: 'left', vertical: 'top', wrapText: true } as const
const thin = { style: 'thin' as const }
const bdr = { top: thin, left: thin, bottom: thin, right: thin }
const fillGray = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } } as const
const fillLblue = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDD7EE' } } as const

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

// 영역(병합 셀)에 테두리를 채워주는 헬퍼
function borderRange(ws: WS, r1: number, c1: number, r2: number, c2: number) {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      put(ws, r, c, ws.getCell(r, c).value, {
        border: {
          top: r === r1 ? thin : undefined,
          bottom: r === r2 ? thin : undefined,
          left: c === c1 ? thin : undefined,
          right: c === c2 ? thin : undefined,
        },
      })
    }
  }
}

// public/atec_logo.png → base64 (브라우저). 실패 시 null.
async function loadLogoBase64(): Promise<string | null> {
  try {
    const res = await fetch('/atec_logo.png')
    if (!res.ok) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    return btoa(binary)
  } catch { return null }
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

function tsKst(ts: string) {
  if (!ts) return ''
  try {
    return new Date(new Date(ts).getTime() + 9 * 3600 * 1000)
      .toISOString().slice(0, 10)
  } catch { return ts.slice(0, 10) }
}

export async function downloadPurchaseRequest(req: PurchaseRequestData) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('구매요청서')

  // 5열 레이아웃: No / 품명(넓게) / 수량 / 링크
  ;[6, 34, 10, 30, 4].forEach((w, i) => { ws.getColumn(i + 1).width = w })
  const LAST = 4

  // ── 제목 + 로고 ─────────────────────────────────────────────────────────
  const logoB64 = await loadLogoBase64()
  if (logoB64 !== null) {
    const logoId = wb.addImage({ base64: logoB64, extension: 'png' })
    ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 120, height: 40 } })
  }
  ws.mergeCells(1, 1, 2, LAST)
  put(ws, 1, 1, '구 매 요 청 서', { font: bold16, align: ca })
  ws.getRow(1).height = 26
  ws.getRow(2).height = 18

  let r = 4

  // ── 요청 정보 ───────────────────────────────────────────────────────────
  const infoRow = (label1: string, val1: ExcelJS.CellValue, label2: string, val2: ExcelJS.CellValue) => {
    put(ws, r, 1, label1, { font: bold11, align: ca, fill: fillGray, border: bdr })
    put(ws, r, 2, val1, { font: norm10, align: la, border: bdr })
    put(ws, r, 3, label2, { font: bold11, align: ca, fill: fillGray, border: bdr })
    put(ws, r, 4, val2, { font: norm10, align: la, border: bdr })
    ws.getRow(r).height = 20
    r++
  }
  infoRow('요청자', req.requester_name, '소속', req.requester_center)
  infoRow('요청일', tsKst(req.requested_at), '품목 수', `${req.items.length}건`)

  r++

  // ── 구매 품목 ───────────────────────────────────────────────────────────
  ws.mergeCells(r, 1, r, LAST)
  put(ws, r, 1, '구매 품목', { font: bold11, align: ca, fill: fillLblue, border: bdr })
  r++
  ;['No', '품명', '수량', '링크'].forEach((h, i) =>
    put(ws, r, i + 1, h, { font: bold11, align: ca, fill: fillGray, border: bdr }))
  ws.getRow(r).height = 20
  r++
  req.items.forEach((it, idx) => {
    put(ws, r, 1, idx + 1, { font: norm10, align: ca, border: bdr })
    put(ws, r, 2, it.품명, { font: norm10, align: la, border: bdr })
    put(ws, r, 3, it.수량, { font: norm10, align: ca, border: bdr })
    put(ws, r, 4, it.링크 || '', { font: norm10, align: la, border: bdr })
    ws.getRow(r).height = 20
    r++
  })
  // 합계
  ws.mergeCells(r, 1, r, 2)
  put(ws, r, 1, '합계', { font: bold10, align: ca, fill: fillGray, border: bdr })
  put(ws, r, 2, '', { fill: fillGray, border: bdr })
  put(ws, r, 3, req.items.reduce((s, it) => s + (Number(it.수량) || 0), 0), { font: bold10, align: ca, fill: fillGray, border: bdr })
  put(ws, r, 4, '', { fill: fillGray, border: bdr })
  ws.getRow(r).height = 20
  r++

  r++

  // ── 구매사유 ────────────────────────────────────────────────────────────
  const textBlock = (label: string, text: string, lines: number) => {
    ws.mergeCells(r, 1, r, LAST)
    put(ws, r, 1, label, { font: bold11, align: ca, fill: fillGray, border: bdr })
    r++
    const start = r
    ws.mergeCells(start, 1, start + lines - 1, LAST)
    put(ws, start, 1, text || '', { font: norm10, align: lt })
    for (let ri = start; ri < start + lines; ri++) ws.getRow(ri).height = 18
    borderRange(ws, start, 1, start + lines - 1, LAST)
    r = start + lines
  }
  textBlock('구매사유', req.reason, 3)
  r++
  textBlock('원가반영', req.cost_note || '', 3)
  if (req.notes) { r++; textBlock('비고', req.notes, 2) }

  r += 2

  // ── 결재란 ──────────────────────────────────────────────────────────────
  const cols = ['요청', '검토', '승인']
  // 라벨 행
  put(ws, r, 1, '결재', { font: bold11, align: ca, fill: fillGray, border: bdr })
  cols.forEach((c, i) => put(ws, r, i + 2, c, { font: bold11, align: ca, fill: fillGray, border: bdr }))
  ws.getRow(r).height = 20
  r++
  // 서명 행
  put(ws, r, 1, '(서명)', { font: norm10, align: ca, border: bdr })
  cols.forEach((_, i) => put(ws, r, i + 2, '', { border: bdr }))
  ws.getRow(r).height = 46
  r++

  ws.pageSetup = {
    fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true,
    printArea: `A1:D${r}`,
    margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
  }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `구매요청서_${tsKst(req.requested_at)}_${req.requester_name}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
