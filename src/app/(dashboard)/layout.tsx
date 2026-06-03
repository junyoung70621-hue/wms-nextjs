import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getSession } from '@/lib/session'
import DashboardLayout from '@/components/layout/DashboardLayout'

export default async function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session.user) {
    const path = (await headers()).get('x-pathname') ?? ''
    // 안전한 내부 경로만 next로 보존 (오픈 리다이렉트 방지)
    const safe = path.startsWith('/') && !path.startsWith('//') ? path : ''
    redirect(safe && safe !== '/dashboard' ? `/login?next=${encodeURIComponent(safe)}` : '/login')
  }

  return <DashboardLayout user={session.user}>{children}</DashboardLayout>
}
