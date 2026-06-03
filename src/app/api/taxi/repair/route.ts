import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { TAXI_TABLE } from '@/lib/taxiTracking'

function canWrite(user: { role: string; center: string; assigned_center: string | null }) {
  const center = user.assigned_center ?? user.center
  return user.role === 'admin' || (center === '자재센터' && user.role !== 'guest')
}

// 수리완료 처리: 선택한 in 레코드들의 is_repair_done = true (수리중 → 자재센터 보관)
export async function POST(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })
  if (!canWrite(session.user)) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await request.json()
  const ids: string[] = (body.ids ?? []).filter(Boolean)
  const done: boolean = body.done === undefined ? true : !!body.done
  if (!ids.length) return NextResponse.json({ error: '대상 없음' }, { status: 400 })

  const { error } = await supabase.from(TAXI_TABLE).update({ is_repair_done: done }).in('id', ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, updated: ids.length })
}
