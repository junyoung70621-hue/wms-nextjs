import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { classifyTerminal, ACTIVE_STATUSES } from '@/lib/busTracking'

const TABLE = 'bus_terminal_assignments'
const HIST  = 'bus_terminal_history'

function nowKst() { return new Date(Date.now() + 9 * 3600000).toISOString() }

export async function GET(req: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const center      = searchParams.get('center')
  const status      = searchParams.get('status')
  const employee_id = searchParams.get('employee_id')

  let q = supabase.from(TABLE)
    .select('id,ih_code,device_type,sub_type,center,employee_id,employee_name,assigned_at,status,returned_at,notes')
    .order('assigned_at', { ascending: false })
    .limit(3000)
  if (center)      q = q.eq('center',      center)
  if (status)      q = q.eq('status',      status)
  if (employee_id) q = q.eq('employee_id', employee_id)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })
  const u = session.user
  const { ih_list, center, target_id, target_name } = await req.json()
  if (!ih_list?.length || !center || !target_name) {
    return NextResponse.json({ error: '필수 파라미터 누락' }, { status: 400 })
  }

  const now = nowKst()

  // unassigned 레코드 재활용
  const { data: unassigned } = await supabase.from(TABLE)
    .select('id,ih_code').eq('center', center).eq('status', 'unassigned')
  const unassignedMap: Record<string, string> = {}
  for (const r of unassigned ?? []) unassignedMap[r.ih_code] = r.id

  const toUpdate = ih_list.filter((i: { ih_code: string }) => unassignedMap[i.ih_code])
  const toInsert = ih_list.filter((i: { ih_code: string }) => !unassignedMap[i.ih_code])

  for (const item of toUpdate) {
    await supabase.from(TABLE).update({
      employee_id: target_id, employee_name: target_name,
      assigned_at: now, assigned_by: u.id, status: 'holding',
    }).eq('id', unassignedMap[item.ih_code])
  }

  if (toInsert.length) {
    const records = toInsert.map((item: { ih_code: string; device_type?: string; sub_type?: string }) => ({
      ih_code: item.ih_code, device_type: item.device_type ?? null, sub_type: item.sub_type ?? null,
      center, employee_id: target_id, employee_name: target_name,
      assigned_at: now, assigned_by: u.id, status: 'holding',
    }))
    await supabase.from(TABLE).insert(records)
  }

  const histRows = ih_list.map((item: { ih_code: string; device_type?: string; sub_type?: string }) => ({
    center, action: 'assign', ih_code: item.ih_code,
    device_type: item.device_type ?? null, sub_type: item.sub_type ?? null,
    to_employee: target_name, from_status: unassignedMap[item.ih_code] ? 'unassigned' : null,
    to_status: 'holding', acted_by: u.id, acted_by_name: u.name, acted_at: now,
  }))
  await supabase.from(HIST).insert(histRows)

  return NextResponse.json({ ok: true, count: ih_list.length })
}

export async function DELETE(req: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })
  const u = session.user
  const { ids, records_meta } = await req.json()
  if (!ids?.length) return NextResponse.json({ error: 'ids 필요' }, { status: 400 })

  await supabase.from(TABLE).delete().in('id', ids)

  if (records_meta?.length) {
    const now = nowKst()
    await supabase.from(HIST).insert(records_meta.map((r: { ih_code: string; device_type?: string; sub_type?: string; employee_name?: string; status?: string; center?: string }) => ({
      center: r.center, action: 'cancel', ih_code: r.ih_code,
      device_type: r.device_type ?? null, sub_type: r.sub_type ?? null,
      from_employee: r.employee_name, from_status: r.status,
      acted_by: u.id, acted_by_name: u.name, acted_at: now,
    })))
  }

  return NextResponse.json({ ok: true })
}
