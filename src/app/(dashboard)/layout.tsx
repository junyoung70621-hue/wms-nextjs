import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import DashboardLayout from '@/components/layout/DashboardLayout'

export default async function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session.user) redirect('/login')

  return <DashboardLayout user={session.user}>{children}</DashboardLayout>
}
