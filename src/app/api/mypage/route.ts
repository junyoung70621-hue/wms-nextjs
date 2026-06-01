import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'

// ── 내 정보 수정 ─────────────────────────────────────────────────────────────
export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { name, email, phone } = await request.json()

  if (!name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: '이름과 이메일은 필수입니다.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('users')
    .update({ name: name.trim(), email: email.trim(), phone: phone || null })
    .eq('id', session.user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 세션 정보도 업데이트
  session.user.name  = name.trim()
  session.user.email = email.trim()
  session.user.phone = phone || null
  await session.save()

  return NextResponse.json({ ok: true })
}

// ── 비밀번호 변경 ─────────────────────────────────────────────────────────────
export async function PUT(request: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { currentPw, newPw } = await request.json()

  if (!currentPw || !newPw) {
    return NextResponse.json({ error: '모든 항목을 입력하세요.' }, { status: 400 })
  }
  if (newPw.length < 6) {
    return NextResponse.json({ error: '비밀번호는 6자 이상이어야 합니다.' }, { status: 400 })
  }

  // 현재 비밀번호 확인
  const { data: rows } = await supabase
    .from('users')
    .select('password_hash')
    .eq('id', session.user.id)
    .limit(1)

  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 })
  }

  const valid = await bcrypt.compare(currentPw, rows[0].password_hash)
  if (!valid) {
    return NextResponse.json({ error: '현재 비밀번호가 올바르지 않습니다.' }, { status: 401 })
  }

  const hashed = await bcrypt.hash(newPw, 10)
  const { error } = await supabase
    .from('users')
    .update({ password_hash: hashed })
    .eq('id', session.user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
