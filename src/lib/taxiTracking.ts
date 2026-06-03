// 택시단말기 현황 — 분류 / 상태계산 / 상수
// wms_v2 pages/17_taxi_dashboard.py 포팅 (로직 그대로, UI만 신규)

export const TAXI_TABLE = 'taxi_movements'
export const TAXI_DELIVERY_TABLE = 'taxi_deliveries'

// ── 타입 ──────────────────────────────────────────────────────────────────────
export interface TaxiMovement {
  id: string
  upload_id: string
  trcn_id: string
  device_type: string
  direction: 'in' | 'out'
  is_terminated: boolean
  is_repair_done: boolean
  driver_name: string | null
  uploaded_by: string | null
  uploaded_at: string
  upload_date: string
  file_name: string | null
  notes: string | null
}

export interface TaxiDelivery {
  id: string
  delivery_id: string
  trcn_id: string
  device_type: string
  driver_name: string
  dealer_name: string | null
  delivery_date: string
  delivered_by: string | null
  delivered_at: string
  notes: string | null
}

// ── TRCN_ID 정규화: 공백 제거 + 숫자 셀 float('182100001.0') → 정수 문자열 ──────
// 원본: str(int(float(x)))
export function normalizeTrcnId(raw: unknown): string {
  let s = String(raw ?? '').trim()
  if (s !== '' && Number.isFinite(Number(s))) {
    s = String(Math.trunc(Number(s)))
  }
  return s
}

// ── 기종 분류 classify_taxi(trcn_id) ────────────────────────────────────────────
// 숫자만 남긴 뒤(9자리):
//   1821로 시작: 182100001~182120260 또는 182136261~182140260 → T600(지방), 그 외 → T600
//   1807로 시작 → T300
//   나머지 → 미분류
export function classifyTaxi(raw: unknown): string {
  const s = normalizeTrcnId(raw)
  const digits = s.replace(/\D/g, '')
  if (!digits) return '미분류'

  if (digits.startsWith('1821')) {
    const v = parseInt(digits, 10)
    if ((v >= 182100001 && v <= 182120260) || (v >= 182136261 && v <= 182140260)) {
      return 'T600(지방)'
    }
    return 'T600'
  }
  if (digits.startsWith('1807')) return 'T300'
  return '미분류'
}

// ── 정렬 상수 ─────────────────────────────────────────────────────────────────
export const TAXI_DEVICE_ORDER = ['T600', 'T600(지방)', 'T300', '미분류']
// 기사 표시 순서: 우선순위 → 그 외 가나다순 → 미배정 마지막
export const DRIVER_PRIORITY = ['조기사', '김기사', '추가출고']
export const UNASSIGNED = '미배정'

function driverRank(name: string): number {
  const i = DRIVER_PRIORITY.indexOf(name)
  if (i >= 0) return i
  if (name === UNASSIGNED) return 9999
  return 1000
}

// ── 상태 계산 (핸드오버 3장 — 한 글자도 바꾸지 말 것) ─────────────────────────────
export interface TaxiStatusItem {
  id: string
  trcn_id: string
  device_type: string
  upload_date: string
  is_terminated: boolean
}
export interface DriverGroup {
  driver: string
  count: number
  items: { trcn_id: string; device_type: string; out_id: string }[]
}
export interface TaxiStatus {
  metrics: {
    repairing: number   // 🔧 수리중
    stored: number      // 📦 자재센터 보관 (출고 대기)
    outTotal: number    // 📤 양품출고 합계
    inTotal: number     // 📥 불량입고 합계
    terminated: number  // 해지 수
  }
  repairing: TaxiStatusItem[]
  stored: TaxiStatusItem[]
  drivers: DriverGroup[]
}

// insDesc / outsDesc : uploaded_at DESC 정렬된 전체 in / out 레코드
// deliveredSet       : taxi_deliveries 에 존재하는 trcn_id 집합
export function computeTaxiStatus(
  insDesc: TaxiMovement[],
  outsDesc: TaxiMovement[],
  deliveredSet: Set<string>,
): TaxiStatus {
  // trcn_id별 "가장 최신 in/out" 1건만 (DESC + 첫 등장 = setdefault)
  const latestIn = new Map<string, TaxiMovement>()
  for (const r of insDesc) if (!latestIn.has(r.trcn_id)) latestIn.set(r.trcn_id, r)
  const latestOut = new Map<string, TaxiMovement>()
  for (const r of outsDesc) if (!latestOut.has(r.trcn_id)) latestOut.set(r.trcn_id, r)

  const ts = (s: string) => Date.parse(s)

  // 자재센터 측 재고 (in이 out보다 최신)
  const repairing: TaxiStatusItem[] = []
  const stored: TaxiStatusItem[] = []
  for (const [trcn, inRec] of latestIn) {
    const outRec = latestOut.get(trcn)
    if (!outRec || ts(inRec.uploaded_at) >= ts(outRec.uploaded_at)) {
      const item: TaxiStatusItem = {
        id: inRec.id, trcn_id: inRec.trcn_id, device_type: inRec.device_type,
        upload_date: inRec.upload_date, is_terminated: inRec.is_terminated,
      }
      if (inRec.is_repair_done) stored.push(item)
      else repairing.push(item)
    }
  }

  // 기사 보유 재고 (out이 in보다 최신, 아직 배송 안 됨)
  const driverMap = new Map<string, DriverGroup['items']>()
  for (const [trcn, outRec] of latestOut) {
    const inRec = latestIn.get(trcn)
    if (!inRec || ts(outRec.uploaded_at) >= ts(inRec.uploaded_at)) {
      if (!deliveredSet.has(trcn)) {
        const d = outRec.driver_name || UNASSIGNED
        if (!driverMap.has(d)) driverMap.set(d, [])
        driverMap.get(d)!.push({ trcn_id: outRec.trcn_id, device_type: outRec.device_type, out_id: outRec.id })
      }
    }
  }
  const drivers: DriverGroup[] = [...driverMap.entries()]
    .map(([driver, items]) => ({ driver, count: items.length, items }))
    .sort((a, b) => driverRank(a.driver) - driverRank(b.driver) || a.driver.localeCompare(b.driver, 'ko'))

  const terminated = insDesc.filter(r => r.is_terminated).length

  return {
    metrics: {
      repairing: repairing.length,
      stored: stored.length,
      outTotal: outsDesc.length,
      inTotal: insDesc.length,
      terminated,
    },
    repairing,
    stored,
    drivers,
  }
}

// ── 기종별 카운트 (TAXI_DEVICE_ORDER 순) ────────────────────────────────────────
export function countByDevice(items: { device_type: string }[]): { device: string; count: number }[] {
  const m = new Map<string, number>()
  for (const r of items) m.set(r.device_type || '미분류', (m.get(r.device_type || '미분류') ?? 0) + 1)
  const ordered = [
    ...TAXI_DEVICE_ORDER.filter(d => m.has(d)),
    ...[...m.keys()].filter(d => !TAXI_DEVICE_ORDER.includes(d)),
  ]
  return ordered.map(d => ({ device: d, count: m.get(d) ?? 0 })).filter(r => r.count > 0)
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
// AOA 행에서 단말기ID 컬럼 인덱스 (-1 = 없음)
export function findTrcnIndex(row: unknown[]): number {
  return row.findIndex(matchesTrcnKeyword)
}
