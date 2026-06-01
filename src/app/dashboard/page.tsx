import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import DashboardLayout from '@/components/layout/DashboardLayout'

export default async function DashboardPage() {
  const session = await getSession()
  if (!session.user) redirect('/login')
  const user = session.user!

  return (
    <DashboardLayout user={user} title="자재현황(전체)">
      <div className="space-y-2">
        <h2 className="text-xl font-bold text-[#1E293B]">
          환영합니다, {user.name}님 👋
        </h2>
        <p className="text-sm text-gray-500">
          {user.assigned_center ?? user.center} · {user.role}
        </p>
        <p className="text-gray-400 pt-4">페이지 이사 작업 중...</p>
      </div>
    </DashboardLayout>
  )
}
