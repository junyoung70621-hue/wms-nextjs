export const TRACKING_CENTERS = ['강서센터', '강북센터', '강동센터', '강남센터']

export const STATUS_LABEL: Record<string, string> = {
  unassigned:       '미배정(센터보관)',
  holding:          '양품 보유중',
  defective:        '불량 보유중',
  center_defective: '불량(센터보관)',
  exchanged:        '교체 완료',
  returned:         '반납 완료',
}

export const ACTIVE_STATUSES = ['holding', 'defective', 'center_defective', 'exchanged']

export const ACTION_LABEL: Record<string, string> = {
  assign:   '배정',
  swap:     '불량 교체',
  transfer: '직원 이동',
  return:   '반납',
  cancel:   '배정 취소',
  init:     '초기 등록',
}

export type Assignment = {
  id: string
  ih_code: string
  device_type: string | null
  sub_type: string | null
  center: string
  employee_id: string | null
  employee_name: string
  assigned_at: string
  assigned_by: string | null
  status: string
  returned_at: string | null
  notes: string | null
}

export type HistoryRow = {
  id?: string
  center: string
  action: string
  ih_code: string
  device_type: string | null
  sub_type: string | null
  from_employee: string | null
  to_employee: string | null
  from_status: string | null
  to_status: string | null
  extra_ih: string | null
  acted_by: string | null
  acted_by_name: string | null
  acted_at: string
}

export type IhItem = {
  ih_code: string
  device_type?: string | null
  sub_type?: string | null
  employee_name?: string | null
}

export type TransferRequest = {
  id: string
  from_center: string
  to_center: string
  ih_codes: IhItem[]
  status: string
  notes: string | null
  requested_by: string | null
  requested_by_name: string | null
  requested_at: string
  processed_by: string | null
  processed_by_name: string | null
  processed_at: string | null
}

export type AvailableTerminal = {
  ih_code: string
  device_type: string
  sub_type: string
  upload_date: string
}

export function classifyTerminal(raw: string | number): [string, string] {
  let s = String(raw).trim()
  try { s = String(Math.floor(parseFloat(s))) } catch { /* noop */ }
  const digits = s.replace(/\D/g, '')
  if (!digits) return ['미분류', '알 수 없음']
  const n = digits.length

  if (n === 8 || n === 9) {
    if (digits.startsWith('157'))  return ['한강버스', '승하차']
    if (digits.startsWith('1560')) return ['B800', '승하차']
    if (digits.startsWith('1553')) return ['B710', '승하차']
    if (digits.startsWith('1551')) return ['B620', '승하차']
    if (digits.startsWith('1451')) return ['B620', '운전자']
  }
  if (n === 9) {
    if (digits.startsWith('5600')) return ['B800', '표출기']
    if (digits.startsWith('5500')) return ['B800', '통합단말기']
    if (digits.startsWith('457'))  return ['한강버스', '표출기']
    if (digits.startsWith('447'))  return ['한강버스', '통합단말기']
    if (digits.startsWith('4550')) return ['B710', '표출기']
    if (digits.startsWith('4450')) return ['B710', '통합단말기']
    if (digits.startsWith('4500')) return ['B700', '표출기']
    if (digits.startsWith('4400')) return ['B700', '통합단말기']
  }
  if (n === 6) {
    if (digits.startsWith('10')) {
      const num = parseInt(digits)
      if (num >= 100001 && num <= 100500) return ['B620', '모뎀']
      return ['B800', '모뎀']
    }
    if (digits.startsWith('6'))                          return ['B710', '모뎀']
    if (digits.startsWith('4') || digits.startsWith('5')) return ['B700', '모뎀']
    if (digits.startsWith('1'))                          return ['B620', '모뎀']
  }
  return ['미분류', '알 수 없음']
}

export function tsKst(ts: string | null | undefined): string {
  if (!ts) return ''
  try {
    const dt = new Date(ts)
    return new Date(dt.getTime() + 9 * 3600000)
      .toISOString().slice(0, 16).replace('T', ' ')
  } catch { return String(ts).slice(0, 16).replace('T', ' ') }
}
