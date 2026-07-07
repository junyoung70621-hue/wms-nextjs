'use client'

import { useEffect } from 'react'

// 로그인 상태에서만 마운트됨 — 세션 만료 감지 시 풀 리로드로 게스트 미리보기 전환
export default function SessionGuard() {
  useEffect(() => {
    const check = async () => {
      const res = await fetch('/api/auth/me').catch(() => null)
      if (!res || res.status === 401) {
        window.location.reload()
      }
    }

    // 탭이 다시 활성화될 때마다 세션 확인
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') check()
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  return null
}
