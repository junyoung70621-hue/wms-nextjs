import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import UsageContent from './UsageContent'

export default async function UsagePage() {
  const session = await getSession()
  if (!session.user) redirect('/login')
  if (session.user.role === 'guest') redirect('/dashboard')

  return <UsageContent user={session.user} />
}
