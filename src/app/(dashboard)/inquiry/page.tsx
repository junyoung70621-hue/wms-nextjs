import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import InquiryContent from './InquiryContent'

export default async function InquiryPage() {
  const session = await getSession()
  if (!session.user) redirect('/login')

  return <InquiryContent isAdmin={session.user.role === 'admin'} />
}
