import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// 서버 컴포넌트에서 현재 경로를 알 수 있도록 요청 헤더에 주입
// (로그아웃 리다이렉트 시 ?next= 목적지 보존용)
export function proxy(req: NextRequest) {
  const headers = new Headers(req.headers)
  headers.set('x-pathname', req.nextUrl.pathname + req.nextUrl.search)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  // api / _next / 정적파일(점 포함) 제외한 페이지 경로에만 적용
  matcher: ['/((?!api|_next/static|_next/image|.*\\..*).*)'],
}
