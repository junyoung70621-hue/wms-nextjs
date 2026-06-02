'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { SessionUser } from '@/lib/session'

const ROLE_LABEL: Record<string, string> = {
  admin: '관리자', materials: '자재파트',
  manager: '센터장', user: '일반', guest: '게스트',
}

const SESSION_MS = 8 * 60 * 60 * 1000

// 경로 → 화면 제목
const TITLE_MAP: Record<string, string> = {
  '/dashboard': '자재현황(전체)',
  '/warehouse': '재고 현황',
  '/material-requests': '자재 요청',
  '/purchase-requests': '구매 요청',
  '/usage': '사용내역',
  '/history': '입출고 이력',
  '/rack-map': '위치 지도',
  '/bus-tracking': '센터 단말현황(버스)',
  '/terminal/bus': '버스단말기 현황',
  '/terminal/taxi': '택시단말기 현황',
  '/notices': '공지사항',
  '/inquiry': '문의하기',
  '/online-users': '접속 현황',
  '/admin': '관리자',
  '/mypage': '마이페이지',
}

type Counts = {
  mat_pending: number
  pur_pending: number
  tr_pending: number
  unread_notices: number
}

interface TopBarProps {
  user: SessionUser
  collapsed: boolean
  onToggle: () => void
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return '00:00'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export default function TopBar({ user, collapsed, onToggle }: TopBarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const title = TITLE_MAP[pathname] ?? ''
  const [counts, setCounts] = useState<Counts>({ mat_pending: 0, pur_pending: 0, tr_pending: 0, unread_notices: 0 })
  const [remaining, setRemaining] = useState<number | null>(null)

  // 카운트 갱신
  useEffect(() => {
    fetch('/api/notifications/counts')
      .then(r => r.json())
      .then(d => { if (!d.error) setCounts(d) })
      .catch(() => {})
  }, [pathname])

  // 세션 잔여시간 초기화
  const initRemaining = useCallback(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => {
        if (d.loginAt) setRemaining(d.loginAt + SESSION_MS - Date.now())
      })
      .catch(() => {})
  }, [])

  useEffect(() => { initRemaining() }, [initRemaining])

  // 1분마다 카운트다운
  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(prev => (prev !== null ? prev - 60_000 : null))
    }, 60_000)
    return () => clearInterval(timer)
  }, [])

  const center = user.assigned_center ?? user.center

  return (
    <header className="fixed top-0 left-0 right-0 h-[58px] bg-white/95 backdrop-blur-sm border-b border-[rgba(0,0,0,0.08)] shadow-sm z-50 flex items-stretch">
      {/* 로고 + 토글 */}
      <div
        className={`flex-shrink-0 flex items-center gap-2 px-3 border-r border-[rgba(0,0,0,0.08)] transition-all duration-200 ${
          collapsed ? 'w-[48px]' : 'w-[220px]'
        }`}
      >
        <button
          onClick={onToggle}
          className="p-[6px] rounded hover:bg-[rgba(0,0,0,0.06)] flex-shrink-0 text-[#64748B] hover:text-[#1E293B] transition-colors"
          aria-label="사이드바 열고 닫기"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect y="2"    width="16" height="1.5" rx="0.75" fill="currentColor" />
            <rect y="7.25" width="16" height="1.5" rx="0.75" fill="currentColor" />
            <rect y="12.5" width="16" height="1.5" rx="0.75" fill="currentColor" />
          </svg>
        </button>
        <span
          className={`text-[14px] font-bold text-[#1E293B] tracking-tight whitespace-nowrap overflow-hidden transition-all duration-200 ${
            collapsed ? 'w-0 opacity-0' : 'opacity-100'
          }`}
        >
          ATEC 자재관리
        </span>
      </div>

      {/* 제목 */}
      <div className="flex items-center px-5 min-w-[140px]">
        <span className="text-[15px] font-bold text-[#1E293B] tracking-tight whitespace-nowrap">
          {title}
        </span>
      </div>

      {/* 우측 정보 영역 */}
      <div className="flex-1 flex items-center justify-end gap-0 pr-5 overflow-hidden">

        {/* 공지사항 */}
        <button
          onClick={() => router.push('/notices')}
          className="flex items-center gap-1 px-3 border-r border-[rgba(0,0,0,0.08)] h-full hover:bg-[rgba(0,0,0,0.03)] transition-colors"
        >
          <span className="text-[11px] text-[#64748B] whitespace-nowrap">공지</span>
          <span
            className={`text-[11px] font-bold whitespace-nowrap ${
              counts.unread_notices > 0 ? 'text-[#D3004F]' : 'text-[#94A3B8]'
            }`}
          >
            {counts.unread_notices}건
          </span>
        </button>

        {/* 처리대기 */}
        <div className="flex items-center gap-3 px-3 border-r border-[rgba(0,0,0,0.08)] h-full">
          <span className="text-[11px] text-[#64748B] whitespace-nowrap flex-shrink-0">처리대기</span>
          <div className="flex items-center gap-2">
            <button onClick={() => router.push('/warehouse?tab=transfers')} className="text-[11px] whitespace-nowrap hover:opacity-70 transition-opacity">
              <span className="text-[#64748B]">이동</span>{' '}
              <span className={`font-bold ${counts.tr_pending > 0 ? 'text-[#D3004F]' : 'text-[#94A3B8]'}`}>
                {counts.tr_pending}건
              </span>
            </button>
            <span className="text-[#CBD5E1]">·</span>
            <button onClick={() => router.push('/material-requests')} className="text-[11px] whitespace-nowrap hover:opacity-70 transition-opacity">
              <span className="text-[#64748B]">자재</span>{' '}
              <span className={`font-bold ${counts.mat_pending > 0 ? 'text-[#D3004F]' : 'text-[#94A3B8]'}`}>
                {counts.mat_pending}건
              </span>
            </button>
            <span className="text-[#CBD5E1]">·</span>
            <button onClick={() => router.push('/purchase-requests')} className="text-[11px] whitespace-nowrap hover:opacity-70 transition-opacity">
              <span className="text-[#64748B]">구매</span>{' '}
              <span className={`font-bold ${counts.pur_pending > 0 ? 'text-[#D3004F]' : 'text-[#94A3B8]'}`}>
                {counts.pur_pending}건
              </span>
            </button>
          </div>
        </div>

        {/* 세션 잔여시간 */}
        <div className="flex items-center gap-1 px-3 border-r border-[rgba(0,0,0,0.08)] h-full">
          <span className="text-[11px] text-[#64748B] whitespace-nowrap">세션</span>
          <span
            className={`text-[11px] font-mono font-bold whitespace-nowrap ${
              remaining !== null && remaining < 30 * 60 * 1000
                ? 'text-[#D3004F]'
                : 'text-[#1E293B]'
            }`}
          >
            {remaining !== null ? formatRemaining(remaining) : '--:--'}
          </span>
        </div>

        {/* 유저 정보 */}
        <div className="flex items-center gap-[6px] pl-3 text-[12px]">
          <span className="font-semibold text-[#1E293B] whitespace-nowrap">{center}</span>
          <span className="text-[#CBD5E1]">·</span>
          <span className="font-semibold text-[#1E293B] whitespace-nowrap">{user.name}</span>
          <span className="text-[#CBD5E1]">·</span>
          <span className="text-[#64748B] whitespace-nowrap">{ROLE_LABEL[user.role] ?? user.role}</span>
          <span className="text-[#CBD5E1]">·</span>
          <span className="text-[#94A3B8] whitespace-nowrap font-mono text-[11px]">{today()}</span>
        </div>
      </div>
    </header>
  )
}
