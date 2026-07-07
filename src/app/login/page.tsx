import { redirect } from 'next/navigation'

// 로그인 페이지 제거 — 로그인/회원가입은 대시보드의 팝업으로 이동
// 북마크·기존 메일 링크 대비 리다이렉트만 유지
export default function LoginPage() {
  redirect('/dashboard')
}
