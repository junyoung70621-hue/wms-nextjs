import { classifyTerminal as classifyTerminalCore } from './terminal'

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

// 버스단말 배정 데이터 수정 권한:
// admin/materials 및 자재센터 소속(guest 제외)은 전체 센터, 그 외(guest 제외)는 본인 센터만
// (terminal/movements 의 perms(isJjae) 기준과 동일)
export function canManageBusCenter(
  u: { role: string; center: string; assigned_center: string | null },
  center?: string | null,
): boolean {
  if (u.role === 'guest') return false
  const own = u.assigned_center ?? u.center
  if (u.role === 'admin' || u.role === 'materials' || own === '자재센터') return true
  return !!center && center === own
}

export const ACTION_LABEL: Record<string, string> = {
  inbound:  '센터 입고',
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

// 분류 규칙은 lib/terminal.ts 의 정식 구현에 위임(중복 제거). 단, 기존 정규화
// (Math.floor(parseFloat)) 를 먼저 적용해 동작을 그대로 보존하고 튜플로 변환한다.
export function classifyTerminal(raw: string | number): [string, string] {
  let s = String(raw).trim()
  try { s = String(Math.floor(parseFloat(s))) } catch { /* noop */ }
  const { device, sub } = classifyTerminalCore(s)
  return [device, sub]
}

export function tsKst(ts: string | null | undefined): string {
  if (!ts) return ''
  try {
    const dt = new Date(ts)
    return new Date(dt.getTime() + 9 * 3600000)
      .toISOString().slice(0, 16).replace('T', ' ')
  } catch { return String(ts).slice(0, 16).replace('T', ' ') }
}
