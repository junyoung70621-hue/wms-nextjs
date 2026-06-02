import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { classifyTerminal, TERMINAL_TABLE } from '@/lib/terminal'

// 모뎀 재분류 도구 (admin 전용)
// GET: 현재 '모뎀' 레코드를 재분류하여 달라지는 항목 미리보기
// POST: { changes: [{id, device_type, sub_type}] } 일괄 적용

export async function GET() {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: '관리자 전용' }, { status: 403 })

  const { data, error } = await supabase
    .from(TERMINAL_TABLE)
    .select('id, trcn_id, device_type, sub_type')
    .eq('sub_type', '모뎀')
    .limit(10000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const changes = (data ?? [])
    .map(r => {
      const c = classifyTerminal(r.trcn_id)
      return {
        id: r.id,
        trcn_id: r.trcn_id,
        old_device: r.device_type,
        old_sub: r.sub_type,
        new_device: c.device,
        new_sub: c.sub,
      }
    })
    .filter(r => r.new_device !== r.old_device || r.new_sub !== r.old_sub)

  return NextResponse.json({ changes })
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: '관리자 전용' }, { status: 403 })

  const body = await request.json()
  const changes: { id: string; device_type: string; sub_type: string }[] = body.changes ?? []
  if (!changes.length) return NextResponse.json({ error: '변경 내용 없음' }, { status: 400 })

  let updated = 0
  let failed = 0
  for (const c of changes) {
    const { error } = await supabase
      .from(TERMINAL_TABLE)
      .update({ device_type: c.device_type, sub_type: c.sub_type })
      .eq('id', c.id)
    if (error) failed++
    else updated++
  }
  return NextResponse.json({ updated, failed })
}
