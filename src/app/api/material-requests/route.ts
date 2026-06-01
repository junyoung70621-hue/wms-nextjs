import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'

const STATUS_KO: Record<string, string> = {
  pending: '대기중', approved: '승인', rejected: '거절',
  on_hold: '보류', cancelled: '취소됨',
}

// ── 목록 조회 ─────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const isManager = session.user.role === 'admin' || session.user.role === 'materials'
  const userCenter = session.user.assigned_center ?? session.user.center

  let query = supabase
    .from('material_requests')
    .select('*, processor:users!processed_by(name, center, assigned_center)')
    .order('requested_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (!isManager) query = query.eq('from_center', userCenter)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// ── 취소 (센터 사용자) ────────────────────────────────────────────────────
export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { id, status } = await request.json()
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

  const { error } = await supabase
    .from('material_requests')
    .update({ status, processed_at: new Date().toISOString(), processed_by: session.user.id })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// ── 삭제 (admin) ──────────────────────────────────────────────────────────
export async function DELETE(request: Request) {
  const session = await getSession()
  if (!session.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }
  const { id } = await request.json()
  const { error } = await supabase.from('material_requests').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
