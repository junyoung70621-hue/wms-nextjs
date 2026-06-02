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

  // terminal_movements 출고 → 이 센터로 간 단말기
  const { data: outRows } = await supabase.from('terminal_movements')
    .select('trcn_id,device_type,sub_type,upload_date')
    .eq('direction', 'out').eq('to_center', center).limit(5000)

  // terminal_movements 입고 → 이 센터에서 반납된 IH
  const { data: inRows } = await supabase.from('terminal_movements')
    .select('trcn_id').eq('direction', 'in').eq('from_center', center).limit(5000)
  const returnedIhs = new Set((inRows ?? []).map((r: { trcn_id: string }) => r.trcn_id))

  // 이미 배정된 IH (활성 상태)
  const { data: assigned } = await supabase.from('bus_terminal_assignments')
    .select('ih_code,status').eq('center', center)
  const assignedIhs = new Set(
    (assigned ?? []).filter((r: { status: string }) => ACTIVE_STATUSES.includes(r.status)).map((r: { ih_code: string }) => r.ih_code)
  )

  // 가용풀: 출고됐지만 반납/배정 안 된 단말기
  const outMap: Record<string, { device_type: string; sub_type: string; upload_date: string }> = {}
  for (const r of outRows ?? []) {
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
