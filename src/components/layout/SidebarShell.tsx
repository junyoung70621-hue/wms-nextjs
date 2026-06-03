'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { X } from 'lucide-react'
import type { SessionUser } from '@/lib/session'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import PageTransition from './PageTransition'
import IdleLogout from './IdleLogout'
import PushPrompt from '../PushPrompt'

export default function SidebarShell({
  user,
  children,
}: {
  user: SessionUser
  children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [trialOpen, setTrialOpen] = useState(true)
  const pathname = usePathname()

  useEffect(() => {
    // 모바일은 기본 닫힘(드로어), 데스크톱은 저장값 따름
    if (window.innerWidth < 768) setCollapsed(true)
    else if (localStorage.getItem('sidebar-collapsed') === 'true') setCollapsed(true)
  }, [])

  // 페이지 이동마다: 시범운영 안내 재표시 + 모바일에선 드로어 닫기
  useEffect(() => {
    setTrialOpen(true)
    if (typeof window !== 'undefined' && window.innerWidth < 768) setCollapsed(true)
  }, [pathname])

  const dismissTrial = () => setTrialOpen(false)

  const toggle = () =>
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem('sidebar-collapsed', String(next))
      return next
    })

  return (
    <>
      <IdleLogout />
      <TopBar user={user} collapsed={collapsed} onToggle={toggle} />
      <Sidebar user={user} collapsed={collapsed} />
      {/* 모바일 드로어 backdrop — 사이드바 열렸을 때 뒤 어둡게(탭하면 닫힘) */}
      {!collapsed && (
        <div className="fixed left-0 right-0 bottom-0 top-[58px] z-30 bg-black/40 md:hidden"
          onClick={toggle} aria-hidden="true" />
      )}
      {/* 시범운영 안내 띠 — 탑바 바로 아래, 콘텐츠 영역에 맞춤 (닫기 시 사라짐) */}
      {trialOpen && (
        <div
          className={`fixed top-[58px] right-0 z-30 h-[24px] flex items-center justify-center gap-1.5 bg-[#FEF3F6] border-b border-[#f3c6d1] transition-all duration-200 ${
            collapsed ? 'left-0' : 'left-0 md:left-[240px]'
          }`}
        >
          <span className="text-[11px] font-bold tracking-wide text-[#b32646]">시범운영 중</span>
          <span className="text-[11px] text-[#9a6470]">— 오류·개선 의견은 관리자에게 알려주세요</span>
          <button
            onClick={dismissTrial}
            aria-label="시범운영 안내 닫기"
            className="ml-1 p-0.5 rounded text-[#b32646] hover:bg-[#f3c6d1]/50 transition-colors"
          >
            <X size={13} strokeWidth={2.2} />
          </button>
        </div>
      )}
      <main
        className={`min-h-[calc(100vh-58px)] p-3 md:p-6 transition-all duration-200 ${
          trialOpen ? 'mt-[82px]' : 'mt-[58px]'
        } ${collapsed ? 'ml-0' : 'ml-0 md:ml-[240px]'}`}
      >
        <PushPrompt />
        <PageTransition>{children}</PageTransition>
      </main>
    </>
  )
}
