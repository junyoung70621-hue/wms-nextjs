'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import type { SessionUser } from '@/lib/session'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import PageTransition from './PageTransition'
import IdleLogout from './IdleLogout'
import PushPrompt from '../PushPrompt'
import { AuthGateProvider, GuestClickOverlay, GuestModePill } from '../auth/AuthGate'

export default function SidebarShell({
  user,
  children,
}: {
  user: SessionUser | null
  children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()

  const guest = !user

  useEffect(() => {
    // 모바일은 기본 닫힘(드로어), 데스크톱은 저장값 따름
    if (window.innerWidth < 768) setCollapsed(true)
    else if (localStorage.getItem('sidebar-collapsed') === 'true') setCollapsed(true)
  }, [])

  // 페이지 이동마다: 모바일에선 드로어 닫기
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) setCollapsed(true)
  }, [pathname])

  const toggle = () =>
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem('sidebar-collapsed', String(next))
      return next
    })

  return (
    <AuthGateProvider>
      {user && <IdleLogout />}
      <TopBar user={user} collapsed={collapsed} onToggle={toggle} />
      <Sidebar user={user} collapsed={collapsed} />
      {/* 모바일 드로어 backdrop — 사이드바 열렸을 때 뒤 어둡게(탭하면 닫힘) */}
      {!collapsed && (
        <div className="fixed left-0 right-0 bottom-0 top-[58px] z-30 bg-black/40 md:hidden"
          onClick={toggle} aria-hidden="true" />
      )}
      <main
        className={`relative min-h-[calc(100vh-58px)] p-3 md:p-6 transition-all duration-200 mt-[58px] ${
          collapsed ? 'ml-0' : 'ml-0 md:ml-[240px]'
        }`}
      >
        {user && <PushPrompt />}
        {/* 게스트: guest-veil 이 데이터 글자(td, data-guest-blur)만 블러 처리 */}
        <div className={guest ? 'guest-veil' : undefined}>
          <PageTransition>{children}</PageTransition>
        </div>
        {/* 게스트: 본문 클릭 시 로그인/회원가입 팝업 */}
        {guest && <GuestClickOverlay className="absolute inset-0 z-20 cursor-pointer" />}
      </main>
      {/* 게스트: 하단 둘러보기 모드 안내 */}
      {guest && <GuestModePill />}
    </AuthGateProvider>
  )
}
