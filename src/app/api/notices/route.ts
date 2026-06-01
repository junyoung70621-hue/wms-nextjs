import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'

// ── 목록 조회 ─────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const isAdmin = session.user.role === 'admin'
  const userId  = session.user.id

  let query = supabase
    .from('notices')
    .select('id, title, content, is_active, created_at, attachments, users!notices_author_id_fkey(name)')
    .order('created_at', { ascending: false })

  if (!isAdmin) query = query.eq('is_active', true)

  const { data: notices, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 읽음 상태
  const { data: reads } = await supabase
    .from('notice_reads')
    .select('notice_id')
    .eq('user_id', userId)

  const readIds = (reads ?? []).map(r => r.notice_id)

  return NextResponse.json({ notices: notices ?? [], readIds })
}

// ── 공지 생성 (admin) ─────────────────────────────────────────────────────
export async function POST(request: Request) {
  const session = await getSession()
  if (!session.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const { title, content } = await request.json()
  if (!title?.trim()) return NextResponse.json({ error: '제목을 입력하세요.' }, { status: 400 })

  const { data, error } = await supabase
    .from('notices')
    .insert({ title: title.trim(), content: content?.trim() ?? '', author_id: session.user.id, is_active: true, attachments: [] })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}

// ── 공지 수정 (admin) ─────────────────────────────────────────────────────
export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const { id, title, content, is_active } = await request.json()
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

  const { error } = await supabase
    .from('notices')
    .update({ title: title?.trim(), content: content?.trim(), is_active })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// ── 공지 삭제 (admin) ─────────────────────────────────────────────────────
export async function DELETE(request: Request) {
  const session = await getSession()
  if (!session.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const { id } = await request.json()
  const { error } = await supabase.from('notices').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
