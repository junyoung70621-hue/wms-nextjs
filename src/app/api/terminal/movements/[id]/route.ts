import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { normalizeTrcnId, TERMINAL_TABLE } from '@/lib/terminal'

// 레코드 1건 수정 (trcn_id / device_type / sub_type)
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

  const { data: rec } = await supabase.from(TERMINAL_TABLE)
    .select('uploaded_by, direction, from_center, to_center').eq('id', id).limit(1).single()
  if (!rec) return NextResponse.json({ error: '대상 없음' }, { status: 404 })
  // 관리자·자재센터는 전체 / 그 외에는 본인 센터 업로드(in=출발센터, out=도착센터)만
  const ownerCenter = rec.direction === 'in' ? rec.from_center : rec.to_center
  const owns = ownerCenter === center || rec.uploaded_by === u.id
  if (!isAdmin && !isJjae && !owns)
    return NextResponse.json({ error: '수정 권한 없음' }, { status: 403 })

  const patch: Record<string, string> = {}
  if (body.trcn_id !== undefined) patch.trcn_id = normalizeTrcnId(body.trcn_id)
  if (body.device_type !== undefined) patch.device_type = body.device_type
  if (body.sub_type !== undefined) patch.sub_type = body.sub_type
  if (!Object.keys(patch).length)
    return NextResponse.json({ error: '변경 내용 없음' }, { status: 400 })

  const { error } = await supabase.from(TERMINAL_TABLE).update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
