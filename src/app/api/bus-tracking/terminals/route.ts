import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { ACTIVE_STATUSES } from '@/lib/busTracking'

export async function GET(req: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const center = searchParams.get('center')
  if (!center) return NextResponse.json({ error: 'center 필요' }, { status: 400 })

  // 완전초기화 기준시각: 이 시각 이전 출고는 출고풀에서 제외(초기화 이전 단말 숨김).
  // 테이블이 아직 없거나(미생성) 레코드가 없으면 null → 종전대로 전체 출고 표시.
  let resetAt: string | null = null
  const { data: resetRow } = await supabase.from('bus_terminal_resets')
    .select('reset_at').eq('center', center).maybeSingle()
  if (resetRow?.reset_at) resetAt = resetRow.reset_at

  // terminal_movements 출고 → 이 센터로 간 단말기
  const { data: outRows } = await supabase.from('terminal_movements')
    .select('trcn_id,device_type,sub_type,upload_date,uploaded_at')
    .eq('direction', 'out').eq('to_center', center).limit(5000)

  // terminal_movements 입고 → 이 센터에서 반납된 IH (IH별 최신 입고)
  const { data: inRows } = await supabase.from('terminal_movements')
    .select('trcn_id,upload_date,uploaded_at').eq('direction', 'in').eq('from_center', center).limit(5000)

  // IH별 최신 출고/입고. 반납 판정은 '최신 입고 > 최신 출고'일 때만 한다.
  // (과거에 반납된 적 있어도 그 뒤 다시 출고됐으면 — 수리 후 재출고 등 — 보유 중으로 본다.)
  // ※ 최신 판단은 실제 이동 날짜(upload_date) 우선, 같은 날짜면 등록 시각(uploaded_at).
  //   등록 시각만 비교하면 과거 이력 소급 입력 시 시간 역전으로 보유 단말이 반납 처리됨
  //   (taxiTracking.computeTaxiStatus 와 동일 기준).
  const keyOf = (r: { upload_date?: string | null; uploaded_at?: string | null }) =>
    `${r.upload_date ?? ''}|${r.uploaded_at ?? ''}`
  const lastOutKey: Record<string, string> = {}
  for (const r of outRows ?? []) {
    const k = keyOf(r)
    if (!lastOutKey[r.trcn_id] || k > lastOutKey[r.trcn_id]) lastOutKey[r.trcn_id] = k
  }
  const lastInKey: Record<string, string> = {}
  for (const r of (inRows ?? []) as { trcn_id: string; upload_date?: string | null; uploaded_at: string }[]) {
    const k = keyOf(r)
    if (!lastInKey[r.trcn_id] || k > lastInKey[r.trcn_id]) lastInKey[r.trcn_id] = k
  }
  const returnedIhs = new Set(
    Object.keys(lastInKey).filter(ih => !lastOutKey[ih] || lastInKey[ih] > lastOutKey[ih])
  )

  // 이미 배정된 IH (활성 상태)
  const { data: assigned } = await supabase.from('bus_terminal_assignments')
    .select('ih_code,status').eq('center', center)
  const assignedIhs = new Set(
    (assigned ?? []).filter((r: { status: string }) => ACTIVE_STATUSES.includes(r.status)).map((r: { ih_code: string }) => r.ih_code)
  )

  // 가용풀: 출고됐지만 반납/배정 안 된 단말기
  const outMap: Record<string, { device_type: string; sub_type: string; upload_date: string }> = {}
  for (const r of outRows ?? []) {
    // 초기화 기준시각 이전(이하) 출고는 건너뜀.
    if (resetAt && r.uploaded_at && r.uploaded_at <= resetAt) continue
    if (!outMap[r.trcn_id]) {
      outMap[r.trcn_id] = { device_type: r.device_type, sub_type: r.sub_type, upload_date: r.upload_date }
    }
  }

  const result: { ih_code: string; device_type: string; sub_type: string; upload_date: string }[] = []
  for (const [ih, info] of Object.entries(outMap)) {
    if (!returnedIhs.has(ih) && !assignedIhs.has(ih)) {
      result.push({ ih_code: ih, ...info })
    }
  }

  // unassigned 레코드에서 terminal_movements 없이 직접 등록된 것도 포함
  const { data: unassignedRows } = await supabase.from('bus_terminal_assignments')
    .select('ih_code,device_type,sub_type,assigned_at').eq('center', center).eq('status', 'unassigned')
  const resultIhs = new Set(result.map(r => r.ih_code))
  for (const r of unassignedRows ?? []) {
    if (!returnedIhs.has(r.ih_code) && !assignedIhs.has(r.ih_code) && !resultIhs.has(r.ih_code)) {
      result.push({
        ih_code: r.ih_code,
        device_type: r.device_type ?? '',
        sub_type: r.sub_type ?? '',
        upload_date: String(r.assigned_at ?? '').slice(0, 10),
      })
    }
  }

  result.sort((a, b) => a.ih_code.localeCompare(b.ih_code))
  return NextResponse.json({ data: result })
}
