import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import GuestRequestsPreview from '@/components/auth/GuestRequestsPreview'
import MaterialRequestsContent from './MaterialRequestsContent'

export default async function MaterialRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const session = await getSession()
  // 게스트: 실제 요청 목록을 보여주되 숫자·품명만 블러 (클릭은 로그인 팝업)
  if (!session.user) return <GuestRequestsPreview kind="material" />
  if (session.user.role === 'guest') redirect('/dashboard')

  const { tab } = await searchParams
  return <MaterialRequestsContent user={session.user} initialTab={tab} />
}
