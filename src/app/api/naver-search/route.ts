import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

// 네이버 쇼핑 검색 (공식 API 프록시 — Client ID/Secret은 서버에만)
export async function GET(req: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const query = (searchParams.get('query') ?? '').trim()
  if (!query) return NextResponse.json({ items: [] })

  const id = process.env.NAVER_CLIENT_ID
  const secret = process.env.NAVER_CLIENT_SECRET
  if (!id || !secret) {
    return NextResponse.json(
      { error: '네이버 검색이 아직 설정되지 않았습니다. (관리자: NAVER_CLIENT_ID/SECRET 등록 필요)' },
      { status: 503 },
    )
  }

  try {
    const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(query)}&display=20&sort=sim`
    const res = await fetch(url, {
      headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret },
    })
    if (!res.ok) {
      return NextResponse.json({ error: `네이버 검색 오류 (${res.status})` }, { status: 502 })
    }
    const data = await res.json()
    const strip = (s: unknown) =>
      String(s ?? '')
        .replace(/<[^>]+>/g, '')
        .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .trim()
    const items = (data.items ?? []).map((it: Record<string, unknown>) => ({
      title: strip(it.title),
      link: String(it.link ?? ''),
      image: String(it.image ?? ''),
      lprice: String(it.lprice ?? ''),
      mallName: String(it.mallName ?? ''),
    }))
    return NextResponse.json({ items })
  } catch {
    return NextResponse.json({ error: '네이버 검색 실패' }, { status: 500 })
  }
}
