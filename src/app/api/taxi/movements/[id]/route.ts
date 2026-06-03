import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { normalizeTrcnId, classifyTaxi, TAXI_TABLE } from '@/lib/taxiTracking'

// 레코드 1건 수정 (trcn_id / device_type / driver_name / is_terminated / is_repair_done)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })
  const u = session.user
  const center = u.assigned_center ?? u.center
  const isAdmin = u.role === 'admin'
  const isJjae = center === '자재센터'

  const { id } = await params
  const body = await request.json()

  const { data: rec } = await supabase.from(TAXI_TABLE)
    .select('uploaded_by').eq('id', id).limit(1).single()
  if (!rec) return NextResponse.json({ error: '대상 없음' }, { status: 404 })
  if (!isAdmin && !isJjae && rec.uploaded_by !== u.id)
    return NextResponse.json({ error: '수정 권한 없음' }, { status: 403 })

  const patch: Record<string, unknown> = {}
  if (body.trcn_id !== undefined) {
    const t = normalizeTrcnId(body.trcn_id)
    patch.trcn_id = t
    // 기종 명시 안 하면 자동 재분류
    if (body.device_type === undefined) patch.device_type = classifyTaxi(t)
  }
  if (body.device_type !== undefined) patch.device_type = body.device_type
  if (body.driver_name !== undefined) patch.driver_name = body.driver_name || null
  if (body.is_terminated !== undefined) patch.is_terminated = !!body.is_terminated
  if (body.is_repair_done !== undefined) patch.is_repair_done = !!body.is_repair_done
  if (!Object.keys(patch).length)
    return NextResponse.json({ error: '변경 내용 없음' }, { status: 400 })
  if (patch.device_type === '미분류')
    return NextResponse.json({ error: '미분류는 저장할 수 없습니다. 올바른 단말기번호/기종으로 수정하세요.' }, { status: 400 })

  const { error } = await supabase.from(TAXI_TABLE).update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
