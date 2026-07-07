import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import RackMapContent from './RackMapContent'

export default async function RackMapPage() {
  const session = await getSession()
  // 게스트: 지도(빈 데이터)는 보여주고, 클릭은 셸 오버레이가 로그인 팝업으로 가로챈다
  if (!session.user) return <RackMapContent user={null} />

  const { role } = session.user
  if (role !== 'admin' && role !== 'materials' && role !== 'manager') {
    redirect('/dashboard')
  }

  return <RackMapContent user={session.user} />
}
