import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'
import nodemailer from 'nodemailer'

function generateTempPassword(length = 10): string {
  const chars =
    'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from(
    { length },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join('')
}

export async function POST(request: Request) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json(
        { error: '이메일을 입력하세요.' },
        { status: 400 }
      )
    }

    const { data: users } = await supabase
      .from('users')
      .select('id, name')
      .eq('email', email)
      .limit(1)

    if (!users || users.length === 0) {
      return NextResponse.json(
        { error: '등록된 이메일이 아닙니다.' },
        { status: 404 }
      )
    }

    const user = users[0]
    const tempPw = generateTempPassword()
    const hashed = await bcrypt.hash(tempPw, 10)

    await supabase
      .from('users')
      .update({ password_hash: hashed })
      .eq('id', user.id)

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_ADDRESS,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    })

    await transporter.sendMail({
      from: `에이텍모빌리티 자재관리 <${process.env.GMAIL_ADDRESS}>`,
      to: email,
      subject: '[에이텍모빌리티] 임시 비밀번호 발급',
      html: `
        <p>${user.name}님, 임시 비밀번호가 발급되었습니다.</p>
        <p><b>임시 비밀번호: ${tempPw}</b></p>
        <p>로그인 후 반드시 비밀번호를 변경해 주세요.</p>
      `,
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { error: '처리 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
