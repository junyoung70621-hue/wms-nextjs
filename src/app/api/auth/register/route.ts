import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'

export async function POST(request: Request) {
  try {
    const { username, password, name, email, phone, center } =
      await request.json()

    if (!username || !password || !name || !email || !center) {
      return NextResponse.json(
        { error: '* 표시 항목은 필수입니다.' },
        { status: 400 }
      )
    }

    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .limit(1)

    if (existingUser && existingUser.length > 0) {
      return NextResponse.json(
        { error: '이미 사용 중인 아이디입니다.' },
        { status: 409 }
      )
    }

    const { data: existingEmail } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .limit(1)

    if (existingEmail && existingEmail.length > 0) {
      return NextResponse.json(
        { error: '이미 등록된 이메일입니다.' },
        { status: 409 }
      )
    }

    const password_hash = await bcrypt.hash(password, 10)

    const { error } = await supabase.from('users').insert({
      username,
      password_hash,
      name,
      email,
      phone: phone || null,
      center,
      role: 'guest',
      is_approved: false,
    })

    if (error) {
      return NextResponse.json(
        { error: '회원가입 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
