import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { noticeId } = await request.json()

  await supabase
    .from('notice_reads')
    .upsert({ notice_id: noticeId, user_id: session.user.id }, { onConflict: 'notice_id,user_id' })

  return NextResponse.json({ ok: true })
}
