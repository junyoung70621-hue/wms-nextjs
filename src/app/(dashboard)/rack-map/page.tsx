import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { NO_WAREHOUSE } from '@/constants/centers'
import RackMapContent from './RackMapContent'

export default async function RackMapPage() {
  const session = await getSession()
  // 게스트: 지도(빈 데이터)는 보여주고, 클릭은 셸 오버레이가 로그인 팝업으로 가로챈다
  if (!session.user) return <RackMapContent user={null} />

  const { role } = session.user
  const center = session.user.assigned_center ?? session.user.center
  // 자체 창고가 없는 센터(고객지원사업부)는 자재센터 지도 열람 허용
  const noWarehouseViewer = role !== 'guest' && NO_WAREHOUSE.has(center)
  if (role !== 'admin' && role !== 'materials' && role !== 'manager' && !noWarehouseViewer) {
    redirect('/dashboard')
  }

  return <RackMapContent user={session.user} />
}
