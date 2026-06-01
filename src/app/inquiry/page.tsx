import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import DashboardLayout from '@/components/layout/DashboardLayout'
import InquiryContent from './InquiryContent'

export default async function InquiryPage() {
  const session = await getSession()
  if (!session.user) redirect('/login')

  return (
    <DashboardLayout user={session.user!} title="문의하기">
      <InquiryContent isAdmin={session.user!.role === 'admin'} />
    </DashboardLayout>
  )
}
