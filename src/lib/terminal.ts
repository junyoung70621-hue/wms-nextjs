// 버스단말기 현황 — 분류 로직 / 피벗 / 상수
// wms_v2 pages/14_terminal_dashboard.py 포팅

export const TERMINAL_TABLE = 'terminal_movements'

export interface TerminalMovement {
  id: string
  upload_id: string
  trcn_id: string
  device_type: string
  sub_type: string
  from_center: string
  to_center: string
  direction: 'in' | 'out'
  uploaded_by: string | null
  uploaded_at: string
  upload_date: string
  file_name: string | null
  notes: string | null
}

// TRCN_ID 정규화: 공백 제거 + 숫자 셀 float('560002215.0') → 정수 문자열
export function normalizeTrcnId(raw: unknown): string {
  let s = String(raw ?? '').trim()
  if (s !== '' && Number.isFinite(Number(s))) {
    s = String(Math.trunc(Number(s)))
  }
  return s
}

// ── 단말기 분류 ───────────────────────────────────────────────────────────────
// TRCN_ID → (단말기종류, 유형). 숫자만 추출 후 길이·prefix 기준 분류.
export function classifyTerminal(raw: unknown): { device: string; sub: string } {
  const s = normalizeTrcnId(raw)
  const digits = s.replace(/\D/g, '')
  if (!digits) return { device: '미분류', sub: '알 수 없음' }

  const n = digits.length

  // 승하차·운전자 계열 (8~9자리)
  if (n === 8 || n === 9) {
    if (digits.startsWith('157'))  return { device: '한강버스', sub: '승하차' }
    if (digits.startsWith('1560')) return { device: 'B800', sub: '승하차' }
    if (digits.startsWith('1553')) return { device: 'B710', sub: '승하차' }
    if (digits.startsWith('1551')) return { device: 'B620', sub: '승하차' }
    if (digits.startsWith('1451')) return { device: 'B620', sub: '운전자' }
  }

  // 표출기·통합단말기 계열 (9자리)
  if (n === 9) {
    if (digits.startsWith('5600')) return { device: 'B800', sub: '표출기' }
    if (digits.startsWith('5500')) return { device: 'B800', sub: '통합단말기' }
    if (digits.startsWith('457'))  return { device: '한강버스', sub: '표출기' }
    if (digits.startsWith('447'))  return { device: '한강버스', sub: '통합단말기' }
    if (digits.startsWith('4550')) return { device: 'B710', sub: '표출기' }
    if (digits.startsWith('4450')) return { device: 'B710', sub: '통합단말기' }
    if (digits.startsWith('4500')) return { device: 'B700', sub: '표출기' }
    if (digits.startsWith('4400')) return { device: 'B700', sub: '통합단말기' }
  }

  // 6자리 모뎀 (더 구체적인 prefix 먼저)
  if (n === 6) {
    if (digits.startsWith('10')) {
      const v = parseInt(digits, 10)
      if (v >= 100001 && v <= 100500) return { device: 'B620', sub: '모뎀' }
      return { device: 'B800', sub: '모뎀' }
    }
    if (digits.startsWith('6')) return { device: 'B710', sub: '모뎀' }
    if (digits.startsWith('4') || digits.startsWith('5')) return { device: 'B700', sub: '모뎀' }
    if (digits.startsWith('1')) return { device: 'B620', sub: '모뎀' }
  }

  return { device: '미분류', sub: '알 수 없음' }
}

// ── 정렬 상수 ─────────────────────────────────────────────────────────────────
export const DEVICE_ORDER = ['B800', 'B700', 'B710', 'B620', '한강버스', '미분류']
export const SUB_ORDER = ['표출기', '통합단말기', '승하차', '운전자', '모뎀', '알 수 없음']

const DEVICE_SHORT: Record<string, string> = {
  B800: 'B800', B700: 'B700', B710: 'B710', B620: 'B620', 한강버스: '한강버스', 미분류: '기타',
}
const SUB_SHORT: Record<string, string> = {
  통합단말기: '통합', 표출기: '표출', 승하차: '승하차', 운전자: '운전자', 모뎀: '모뎀', '알 수 없음': '기타',
}
export const ROW_ORDER = [
  'B800통합', 'B800표출', 'B800승하차', 'B800모뎀',
  'B700통합', 'B700표출', 'B700승하차', 'B700모뎀',
  'B710통합', 'B710표출', 'B710승하차', 'B710모뎀',
  'B620승하차', 'B620운전자', 'B620모뎀',
  '한강버스통합', '한강버스표출', '한강버스승하차',
]
export const CTR_SHORT: Record<string, string> = {
  강남센터: '강남', 강동센터: '강동', 강북센터: '강북', 강서센터: '강서',
  택시지원파트: '택시', 리페어팀: '리페어',
}
export const COL_ORDER = ['강남', '강동', '강북', '강서', '택시', '리페어']

// 인수인계증 Excel 행 순서
export const XLSX_ROW_ORDER: [string, string][] = [
  ['B800', '표출기'], ['B800', '통합단말기'], ['B800', '승하차'], ['B800', '모뎀'],
  ['B700', '표출기'], ['B700', '통합단말기'], ['B700', '모뎀'],
  ['B710', '표출기'], ['B710', '통합단말기'], ['B710', '승하차'], ['B710', '모뎀'],
  ['B620', '승하차'], ['B620', '운전자'], ['B620', '모뎀'],
  ['한강버스', '통합단말기'], ['한강버스', '표출기'], ['한강버스', '승하차'],
]

// 출고 시 Teams 알림 대상 4개 센터
export const TEAMS_NOTIFY_CENTERS = ['강남센터', '강동센터', '강북센터', '강서센터']

// ── 피벗: 단말기종류 × 유형 ────────────────────────────────────────────────────
export interface DevicePivot {
  subTypes: string[] // 존재하는 유형 (SUB_ORDER 순)
  rows: { device: string; cells: number[]; total: number }[]
  grandTotal: number
}

export function buildPivot(rows: Pick<TerminalMovement, 'device_type' | 'sub_type'>[]): DevicePivot {
  // device -> sub -> count
  const counts = new Map<string, Map<string, number>>()
  for (const r of rows) {
    const d = r.device_type || '미분류'
    const s = r.sub_type || '알 수 없음'
    if (!counts.has(d)) counts.set(d, new Map())
    const m = counts.get(d)!
    m.set(s, (m.get(s) ?? 0) + 1)
  }
  const presentSubs = SUB_ORDER.filter(s =>
    [...counts.values()].some(m => (m.get(s) ?? 0) > 0)
  )
  const orderedDevices = [
    ...DEVICE_ORDER.filter(d => counts.has(d)),
    ...[...counts.keys()].filter(d => !DEVICE_ORDER.includes(d)),
  ]
  const result: DevicePivot['rows'] = []
  let grandTotal = 0
  for (const d of orderedDevices) {
    const m = counts.get(d)!
    const cells = presentSubs.map(s => m.get(s) ?? 0)
    const total = cells.reduce((a, b) => a + b, 0)
    if (total > 0) {
      result.push({ device: d, cells, total })
      grandTotal += total
    }
  }
  return { subTypes: presentSubs, rows: result, grandTotal }
}

// ── 피벗: 단말기종류 × 센터 (크로스표) ─────────────────────────────────────────
export interface CenterPivot {
  centers: string[] // 짧은 이름, COL_ORDER 순
  rows: { rowKey: string; cells: number[]; total: number }[]
}

export function buildCenterPivot(
  rows: Pick<TerminalMovement, 'device_type' | 'sub_type' | 'from_center' | 'to_center'>[],
  direction: 'in' | 'out' = 'out',
): CenterPivot | null {
  if (!rows.length) return null
  const counts = new Map<string, Map<string, number>>()
  const colSet = new Set<string>()
  for (const r of rows) {
    const rowKey =
      (DEVICE_SHORT[r.device_type] ?? r.device_type) +
      (SUB_SHORT[r.sub_type] ?? r.sub_type)
    const rawCtr = direction === 'out' ? r.to_center : r.from_center
    const ctr = CTR_SHORT[rawCtr] ?? rawCtr
    colSet.add(ctr)
    if (!counts.has(rowKey)) counts.set(rowKey, new Map())
    const m = counts.get(rowKey)!
    m.set(ctr, (m.get(ctr) ?? 0) + 1)
  }
  const cols = [
    ...COL_ORDER.filter(c => colSet.has(c)),
    ...[...colSet].filter(c => !COL_ORDER.includes(c)).sort(),
  ]
  const rowKeys = [
    ...ROW_ORDER.filter(r => counts.has(r)),
    ...[...counts.keys()].filter(r => !ROW_ORDER.includes(r)),
  ]
  const result: CenterPivot['rows'] = []
  for (const rk of rowKeys) {
    const m = counts.get(rk)!
    const cells = cols.map(c => m.get(c) ?? 0)
    const total = cells.reduce((a, b) => a + b, 0)
    if (total > 0) result.push({ rowKey: rk, cells, total })
  }
  return { centers: cols, rows: result }
}

// ── 센터별 합계 (단순 groupby count) ───────────────────────────────────────────
export function countByCenter(
  rows: TerminalMovement[],
  field: 'from_center' | 'to_center',
): { center: string; count: number }[] {
  const m = new Map<string, number>()
  for (const r of rows) m.set(r[field], (m.get(r[field]) ?? 0) + 1)
  return [...m.entries()]
    .map(([center, count]) => ({ center, count }))
    .sort((a, b) => b.count - a.count)
}

// ── Excel 단말기ID 컬럼 자동 감지 ──────────────────────────────────────────────
const TRCN_KEYWORDS = [
  'trcn_id', 'trcnid', '단말기id', '단말기번호', '단말기 id',
  '단말기 번호', 'ih번호', 'ih', '단말기', '번호',
]

function matchesTrcnKeyword(cell: unknown): boolean {
  const nm = String(cell ?? '').trim().toLowerCase().replace(/[\s_]/g, '')
  if (!nm) return false
  return TRCN_KEYWORDS.some(kw => nm.includes(kw.replace(/[\s_]/g, '')))
}

export function findTrcnColumn(headers: string[]): string | null {
  return headers.find(matchesTrcnKeyword) ?? null
}

// AOA 행에서 단말기ID 컬럼 인덱스 (-1 = 없음)
export function findTrcnIndex(row: unknown[]): number {
  return row.findIndex(matchesTrcnKeyword)
}
