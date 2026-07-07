'use client'

import { useEffect, useRef } from 'react'

const IDLE_MS = 30 * 60 * 1000 // 30분 무활동 시 자동 로그아웃
const EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const

export default function IdleLogout() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let loggingOut = false

    const logout = async () => {
      if (loggingOut) return
      loggingOut = true
      try {
        await fetch('/api/auth/logout', { method: 'POST' })
      } catch {
        /* 네트워크 실패해도 게스트 화면으로 보낸다 */
      }
      // 풀 리로드 → 게스트 미리보기 모드로 전환
      window.location.href = '/dashboard'
    }

    const reset = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(logout, IDLE_MS)
    }

    // 활동 이벤트 발생할 때마다 타이머 리셋 (passive로 스크롤 성능 보호)
    EVENTS.forEach(e => window.addEventListener(e, reset, { passive: true }))
    reset()

    return () => {
      if (timer.current) clearTimeout(timer.current)
      EVENTS.forEach(e => window.removeEventListener(e, reset))
    }
  }, [])

  return null
}
