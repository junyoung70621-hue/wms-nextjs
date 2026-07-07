import { redirect } from 'next/navigation'

export default function Home() {
  // 비로그인도 대시보드(게스트 미리보기)로 진입
  redirect('/dashboard')
}
