import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { classifyTerminal } from '@/lib/busTracking'

const TABLE     = 'bus_terminal_transfer_requests'
const ASSIGN    = 'bus_terminal_assignments'
const HIST      = 'bus_terminal_history'
const ACTIVE    = ['holding', 'defective', 'center_defective', 'exchanged', 'unassigned']

function nowKst() { return new Date(Date.now() + 9 * 3600000).toISOString() }

export async function PATCH(req: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })
  const u = session.user
  const { id, action } = await req.json()
  if (!id || !action) return NextResponse.json({ error: '필수값 누락' }, { status: 400 })

  const now = nowKst()

  // 원본 요청 조회
  const { data: reqData } = await supabase.from(TABLE).select('*').eq('id', id).single()
  if (!reqData) return NextResponse.json({ error: '이동신청 없음' }, { status: 404 })

  if (action === 'approve') {
    const ihList = (reqData.ih_codes ?? []) as { ih_code: string; device_type?: string; sub_type?: string }[]

    for (const item of ihList) {
      const { data: rows } = await supabase.from(ASSIGN)
        .select('id,ih_code,status')
        .eq('center', reqData.from_center)
      const match = (rows ?? []).find((r: { ih_code: string; status: string }) =>
        r.ih_code === item.ih_code && ACTIVE.includes(r.status)
      )

      if (match) {
        await supabase.from(ASSIGN).update({
          center: reqData.to_center, status: 'unassigned',
          employee_id: null, employee_name: '(미배정)',
          assigned_at: now, assigned_by: u.id,
        }).eq('id', match.id)
      } else {
        const [dtype, stype] = classifyTerminal(item.ih_code)
        await supabase.from(ASSIGN).insert({
          ih_code: item.ih_code,
          device_type: dtype !== '미분류' ? dtype : null,
          sub_type:    dtype !== '미분류' ? stype : null,
          center: reqData.to_center, employee_id: null, employee_name: '(미배정)',
          assigned_at: now, assigned_by: u.id, status: 'unassigned',
        })
      }
    }

    await supabase.from(HIST).insert(ihList.map(item => ({
      center: reqData.to_center, action: 'transfer',
      ih_code: item.ih_code, device_type: item.device_type ?? null, sub_type: item.sub_type ?? null,
      from_status: 'holding', to_status: 'unassigned',
      acted_by: u.id, acted_by_name: u.name, acted_at: now,
    })))

    await supabase.from(TABLE).update({
      status: 'approved', processed_by: u.id, processed_by_name: u.name, processed_at: now,
    }).eq('id', id)
    return NextResponse.json({ ok: true })
  }

  if (action === 'reject') {
    await supabase.from(TABLE).update({
      status: 'rejected', processed_by: u.id, processed_by_name: u.name, processed_at: now,
    }).eq('id', id)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: '알 수 없는 action' }, { status: 400 })
}

export async function DELETE(req: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })
  await supabase.from(TABLE).delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
