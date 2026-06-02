import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import MypageContent from './MypageContent'

export default async function MypagePage() {
  const session = await getSession()
  if (!session.user) redirect('/login')

  return <MypageContent user={session.user} />
}
