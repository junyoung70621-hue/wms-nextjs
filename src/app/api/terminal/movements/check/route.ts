import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { normalizeTrcnId, TERMINAL_TABLE } from '@/lib/terminal'

// 중복 확인: 같은 날짜·방향에 이미 등록된 trcn_id 목록 반환
export async function POST(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const body = await request.json()
  const direction: string = body.direction
  const uploadDate: string = body.upload_date
  const ids: string[] = (body.trcn_ids ?? []).map(normalizeTrcnId).filter(Boolean)
  if (!uploadDate || (direction !== 'in' && direction !== 'out'))
    return NextResponse.json({ error: '필수값 누락' }, { status: 400 })

  const dups = new Set<string>()
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const { data } = await supabase
      .from(TERMINAL_TABLE)
      .select('trcn_id')
      .eq('upload_date', uploadDate)
      .eq('direction', direction)
      .in('trcn_id', chunk)
    for (const r of data ?? []) dups.add(r.trcn_id)
  }
  return NextResponse.json({ dups: [...dups] })
}
