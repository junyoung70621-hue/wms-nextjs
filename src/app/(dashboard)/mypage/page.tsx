import { getSession } from '@/lib/session'
import GuestPreview from '@/components/auth/GuestPreview'
import MypageContent from './MypageContent'

export default async function MypagePage() {
  const session = await getSession()
  if (!session.user) return <GuestPreview />

  return <MypageContent user={session.user} />
}
