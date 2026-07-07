import { getSession } from '@/lib/session'
import InquiryContent from './InquiryContent'

export default async function InquiryPage() {
  const session = await getSession()
  // 둘러보기 모드: 실제 화면 렌더 (익명에겐 API가 빈 목록 반환)
  if (!session.user) return <InquiryContent isAdmin={false} />

  return <InquiryContent isAdmin={session.user.role === 'admin'} />
}
