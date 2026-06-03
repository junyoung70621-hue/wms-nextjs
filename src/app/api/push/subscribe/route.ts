import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'

// 구독 등록/갱신 (기기별 endpoint 기준 upsert)
export async function POST(req: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const body = await req.json()
  const sub = body.subscription
  const endpoint: string | undefined = sub?.endpoint
  const p256dh: string | undefined = sub?.keys?.p256dh
  const auth: string | undefined = sub?.keys?.auth
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: '구독 정보 누락' }, { status: 400 })
  }

  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: session.user.id,
    endpoint,
    p256dh,
    auth,
    user_agent: body.userAgent ?? null,
  }, { onConflict: 'endpoint' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// 구독 해지
export async function DELETE(req: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })
  const { endpoint } = await req.json()
  if (!endpoint) return NextResponse.json({ error: 'endpoint 필요' }, { status: 400 })
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', session.user.id)
  return NextResponse.json({ ok: true })
}
