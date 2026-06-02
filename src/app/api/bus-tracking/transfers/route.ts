import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'

const TABLE = 'bus_terminal_transfer_requests'

export async function GET(req: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const center = searchParams.get('center')
  if (!center) return NextResponse.json({ error: 'center 필요' }, { status: 400 })

  const { data, error } = await supabase.from(TABLE)
    .select('*')
    .or(`from_center.eq.${center},to_center.eq.${center}`)
    .order('requested_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })
  const u = session.user
  const { from_center, to_center, ih_codes, notes } = await req.json()
  if (!from_center || !to_center || !ih_codes?.length) {
    return NextResponse.json({ error: '필수 파라미터 누락' }, { status: 400 })
  }

  const { error } = await supabase.from(TABLE).insert({
    from_center, to_center, ih_codes, status: 'pending',
    notes: notes || null,
    requested_by: u.id, requested_by_name: u.name,
    requested_at: new Date(Date.now() + 9 * 3600000).toISOString(),
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
