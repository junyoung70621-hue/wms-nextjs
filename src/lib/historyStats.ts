// 입출고 이력 통계 — 기간 버킷(주/월/분기/연) 집계 + Excel 내보내기
import ExcelJS from 'exceljs'

export type HistoryRow = {
  id: string
  action_type: string
  quantity: number
  reason: string | null
  from_center: string | null
  to_center: string | null
  snapshot_qty_before: number | null
  snapshot_qty_after: number | null
  acted_at: string
  warehouse: { item_name: string; location: string } | null
  users: { name: string } | null
}

export type Period = 'week' | 'month' | 'quarter' | 'year'
export const PERIOD_LABEL: Record<Period, string> = { week: '주', month: '월', quarter: '분기', year: '연' }

// 집계 대상 유형 (edit 제외). 사용내역 입력은 action_type 'out' 으로 기록되므로 출고에 포함.
export const TYPES = ['in', 'out', 'transfer'] as const
export type Type = typeof TYPES[number]
export const TYPE_LABEL: Record<Type, string> = { in: '입고', out: '출고·사용', transfer: '이동' }
export const TYPE_COLOR: Record<Type, string> = { in: '#2e7d32', out: '#c62828', transfer: '#1565c0' }

function kst(ts: string): Date {
  return new Date(new Date(ts).getTime() + 9 * 3600 * 1000)
}
// 기간 키 (정렬 가능한 문자열)
export function bucketKey(ts: string, p: Period): string {
  const d = kst(ts)
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1
  if (p === 'year') return String(y)
  if (p === 'quarter') return `${y} Q${Math.ceil(m / 3)}`
  if (p === 'month') return `${y}-${String(m).padStart(2, '0')}`
  // 주: 해당 주 월요일 날짜
  const day = (d.getUTCDay() + 6) % 7 // 월=0
  const mon = new Date(d.getTime() - day * 86400000)
  return mon.toISOString().slice(0, 10)
}
export function bucketLabel(key: string, p: Period): string {
  if (p === 'week') return `${key.slice(5).replace('-', '/')}주`
  if (p === 'month') return `${key.slice(2, 4)}.${key.slice(5)}` // 26.10
  return key
}

export type PeriodAgg = { key: string; qty: Record<Type, number>; cnt: Record<Type, number> }
export type ItemAgg = { item: string; total: number; qty: Record<Type, number>; byPeriod: Record<string, number> }
export type FlowAgg = { from: string; to: string; qty: number; cnt: number }
export type Stats = { periods: PeriodAgg[]; items: ItemAgg[]; flows: FlowAgg[]; rows: HistoryRow[] }

const zero = (): Record<Type, number> => ({ in: 0, out: 0, transfer: 0 })

export function computeStats(rows: HistoryRow[], p: Period): Stats {
  const pm = new Map<string, PeriodAgg>()
  const im = new Map<string, ItemAgg>()
  const fm = new Map<string, FlowAgg>()
  for (const r of rows) {
    if (!(TYPES as readonly string[]).includes(r.action_type)) continue
    const t = r.action_type as Type
    const k = bucketKey(r.acted_at, p)
    const q = r.quantity ?? 0

    let pa = pm.get(k)
    if (!pa) { pa = { key: k, qty: zero(), cnt: zero() }; pm.set(k, pa) }
    pa.qty[t] += q; pa.cnt[t] += 1

    const name = r.warehouse?.item_name ?? '(삭제된 자재)'
    let ia = im.get(name)
    if (!ia) { ia = { item: name, total: 0, qty: zero(), byPeriod: {} }; im.set(name, ia) }
    ia.qty[t] += q
    // 자재별 "움직인 양" = 출고·사용 + 이동 (입고는 유입이라 별도 열)
    if (t !== 'in') { ia.total += q; ia.byPeriod[k] = (ia.byPeriod[k] ?? 0) + q }

    if (t === 'transfer' && r.from_center && r.to_center) {
      const fk = `${r.from_center}→${r.to_center}`
      let fa = fm.get(fk)
      if (!fa) { fa = { from: r.from_center, to: r.to_center, qty: 0, cnt: 0 }; fm.set(fk, fa) }
      fa.qty += q; fa.cnt += 1
    }
  }
  return {
    periods: [...pm.values()].sort((a, b) => a.key.localeCompare(b.key)),
    items: [...im.values()].sort((a, b) => b.total - a.total),
    flows: [...fm.values()].sort((a, b) => b.qty - a.qty),
    rows,
  }
}

// ── Excel ────────────────────────────────────────────────────────────────────
const FONT = '맑은 고딕'
const hdrFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EDF5' } }
function header(ws: ExcelJS.Worksheet, cols: { h: string; w: number }[]) {
  ws.columns = cols.map(c => ({ width: c.w }))
  const row = ws.addRow(cols.map(c => c.h))
  row.font = { name: FONT, bold: true, size: 11 }
  row.alignment = { horizontal: 'center', vertical: 'middle' }
  row.eachCell(c => { c.fill = hdrFill })
  ws.views = [{ state: 'frozen', ySplit: 1 }]
}
function kstDateTime(ts: string) {
  try { return kst(ts).toISOString().slice(0, 16).replace('T', ' ') } catch { return ts }
}

export async function exportStatsExcel(st: Stats, p: Period, rangeLabel: string) {
  const wb = new ExcelJS.Workbook()
  const pl = PERIOD_LABEL[p]

  // 1. 기간별 요약
  const ws1 = wb.addWorksheet(`${pl}별 요약`)
  header(ws1, [
    { h: '기간', w: 14 }, { h: '입고 수량', w: 12 }, { h: '입고 건수', w: 10 },
    { h: '출고·사용 수량', w: 14 }, { h: '출고·사용 건수', w: 14 },
    { h: '이동 수량', w: 12 }, { h: '이동 건수', w: 10 },
  ])
  for (const r of st.periods) {
    ws1.addRow([r.key, r.qty.in, r.cnt.in, r.qty.out, r.cnt.out, r.qty.transfer, r.cnt.transfer])
  }
  const tot = ws1.addRow(['합계',
    st.periods.reduce((s, r) => s + r.qty.in, 0), st.periods.reduce((s, r) => s + r.cnt.in, 0),
    st.periods.reduce((s, r) => s + r.qty.out, 0), st.periods.reduce((s, r) => s + r.cnt.out, 0),
    st.periods.reduce((s, r) => s + r.qty.transfer, 0), st.periods.reduce((s, r) => s + r.cnt.transfer, 0)])
  tot.font = { name: FONT, bold: true }

  // 2. 자재별 × 기간 (출고·사용 + 이동 수량)
  const ws2 = wb.addWorksheet(`자재별 ${pl}별`)
  const keys = st.periods.map(r => r.key)
  header(ws2, [
    { h: '자재명', w: 32 }, { h: '입고', w: 9 }, { h: '출고·사용', w: 10 }, { h: '이동', w: 9 }, { h: '움직인 합계', w: 12 },
    ...keys.map(k => ({ h: k, w: 11 })),
  ])
  for (const it of st.items) {
    ws2.addRow([it.item, it.qty.in, it.qty.out, it.qty.transfer, it.total, ...keys.map(k => it.byPeriod[k] ?? 0)])
  }

  // 3. 센터 간 이동
  const ws3 = wb.addWorksheet('센터 간 이동')
  header(ws3, [{ h: '출발', w: 16 }, { h: '도착', w: 16 }, { h: '수량', w: 10 }, { h: '건수', w: 8 }])
  for (const f of st.flows) ws3.addRow([f.from, f.to, f.qty, f.cnt])

  // 4. 원본 이력
  const ws4 = wb.addWorksheet('원본 이력')
  header(ws4, [
    { h: '일시', w: 17 }, { h: '작업자', w: 10 }, { h: '자재명', w: 30 }, { h: '센터', w: 12 }, { h: '유형', w: 9 },
    { h: '수량', w: 8 }, { h: '변경전', w: 8 }, { h: '변경후', w: 8 }, { h: '출발', w: 12 }, { h: '도착', w: 12 }, { h: '사유', w: 30 },
  ])
  const TL: Record<string, string> = { in: '입고', out: '출고·사용', transfer: '이동', edit: '수정' }
  for (const r of st.rows) {
    ws4.addRow([kstDateTime(r.acted_at), r.users?.name ?? '', r.warehouse?.item_name ?? '', r.warehouse?.location ?? '',
      TL[r.action_type] ?? r.action_type, r.quantity, r.snapshot_qty_before ?? '', r.snapshot_qty_after ?? '',
      r.from_center ?? '', r.to_center ?? '', r.reason ?? ''])
  }

  for (const ws of [ws1, ws2, ws3, ws4]) {
    ws.eachRow((row, i) => { if (i > 1) row.eachCell(c => { if (!c.font?.bold) c.font = { name: FONT, size: 10 } }) })
  }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `입출고통계_${pl}별_${rangeLabel}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
