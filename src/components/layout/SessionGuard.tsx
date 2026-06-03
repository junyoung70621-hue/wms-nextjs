'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SessionGuard() {
  const router = useRouter()

  useEffect(() => {
    const check = async () => {
      const res = await fetch('/api/auth/me').catch(() => null)
      if (!res || res.status === 401) {
        const cur = window.location.pathname + window.location.search
        const next = cur.startsWith('/login') ? '' : cur
        router.push(next ? `/login?next=${encodeURIComponent(next)}` : '/login')
      }
    }

    // 탭이 다시 활성화될 때마다 세션 확인
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') check()
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [router])

  return null
}
