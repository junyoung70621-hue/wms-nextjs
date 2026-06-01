import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'

async function requireAdmin() {
  const session = await getSession()
  if (!session.user || session.user.role !== 'admin') return null
  return session.user
}

// ── 전체 유저 조회 ────────────────────────────────────────────────────────────
export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { data, error } = await supabase
    .from('users')
    .select('id, username, name, email, phone, center, assigned_center, role, is_approved, created_at')
    .order('is_approved')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// ── 유저 정보 수정 ─────────────────────────────────────────────────────────────
export async function PATCH(request: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { id, role, center, assigned_center, is_approved, reset_password } =
    await request.json()

  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (role          !== undefined) update.role           = role
  if (center        !== undefined) update.center         = center
  if (assigned_center !== undefined) update.assigned_center = assigned_center || null
  if (is_approved   !== undefined) update.is_approved    = is_approved
  if (reset_password) {
    update.password_hash = await bcrypt.hash(reset_password, 10)
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: '변경할 항목 없음' }, { status: 400 })
  }

  const { error } = await supabase.from('users').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// ── 유저 삭제 ─────────────────────────────────────────────────────────────────
export async function DELETE(request: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })
  if (id === admin.id) return NextResponse.json({ error: '자기 자신은 삭제 불가' }, { status: 400 })

  const { error } = await supabase.from('users').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
