'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { SessionUser } from '@/lib/session'

type Counts = { mat_pending: number; pur_pending: number; unread_notices: number }

// ── 메뉴 구성 ────────────────────────────────────────────────────────────────
function getMenuSections(user: SessionUser) {
  const role = user.role
  const center = user.assigned_center ?? user.center
  const isAdmin    = role === 'admin'
  const isMaterials = role === 'materials'
  const isGuest    = role === 'guest'

  const showBusTracking =
    isAdmin || ['강남센터', '강서센터', '강북센터', '강동센터', '자재센터'].includes(center)

  type Item = { href: string; label: string }
  type Section = { title: string; items: Item[] }
  const sections: Section[] = []

  // 재고 관리
  const stockItems: Item[] = [{ href: '/warehouse', label: '📦 재고 현황' }]
  if (showBusTracking)
    stockItems.push({ href: '/bus-tracking', label: '📟 센터 단말현황(버스)' })
  stockItems.push({ href: '/history', label: '📋 입출고 이력' })
  if (!isGuest) stockItems.push({ href: '/usage', label: '📊 사용내역' })
  sections.push({ title: '재고 관리', items: stockItems })

  // 요청
  if (!isGuest) {
    sections.push({
      title: '요청',
      items: [
        { href: '/material-requests', label: '📦 자재요청현황' },
        { href: '/purchase-requests', label: '🛒 구매 요청' },
      ],
    })
  }

  // 관리
  if (isAdmin || isMaterials) {
    const mgmtItems: Item[] = [{ href: '/rack-map', label: '📍 위치 지도' }]
    if (isAdmin) {
      mgmtItems.push({ href: '/admin', label: '⚙️ 관리자' })
      mgmtItems.push({ href: '/online-users', label: '🟢 접속 현황' })
    }
    sections.push({ title: '관리', items: mgmtItems })
  }

  // 개인
  sections.push({
    title: '개인',
    items: [
      { href: '/notices',  label: '📢 공지사항' },
      { href: '/inquiry',  label: '💬 문의하기' },
      { href: '/mypage',   label: '👤 마이페이지' },
    ],
  })

  return sections
}

// ── 컴포넌트 ──────────────────────────────────────────────────────────────────
const ROLE_LABEL: Record<string, string> = {
  admin: 'ADMIN', materials: 'MATERIALS',
  manager: 'MANAGER', user: 'USER', guest: 'GUEST',
}

export default function Sidebar({ user, collapsed }: { user: SessionUser; collapsed: boolean }) {
  const pathname = usePathname()
  const router   = useRouter()
  const sections = getMenuSections(user)
  const [counts, setCounts] = useState<Counts>({ mat_pending: 0, pur_pending: 0, unread_notices: 0 })

  useEffect(() => {
    fetch('/api/notifications/counts')
      .then(r => r.json())
      .then(d => { if (!d.error) setCounts(d) })
      .catch(() => {})
  }, [pathname])

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const BADGE_MAP: Record<string, number> = {
    '/material-requests': counts.mat_pending,
    '/purchase-requests': counts.pur_pending,
    '/notices':           counts.unread_notices,
  }

  function NavLink({ href, label }: { href: string; label: string }) {
    const isActive = pathname === href || pathname.startsWith(href + '/')
    const badge = BADGE_MAP[href] ?? 0
    return (
      <Link
        href={href}
        className={cn(
          'flex items-center w-full px-3 py-[7px] rounded text-[14px] transition-colors',
          'border-l-[3px]',
          isActive
            ? 'font-bold text-[#1E293B] bg-[rgba(179, 38, 70,0.08)] border-l-[#B32646]'
            : 'font-normal text-[#1E293B] border-l-transparent hover:bg-[rgba(0,0,0,0.04)] hover:border-l-[rgba(179, 38, 70,0.4)]'
        )}
      >
        <span className="flex-1">{label}</span>
        {badge > 0 && (
          <span className="ml-1 bg-[#B32646] text-white text-[9px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1 leading-none">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </Link>
    )
  }

  function SectionLabel({ title }: { title: string }) {
    return (
      <div className="flex items-center gap-2 px-[14px] py-[12px] mt-1">
        <div className="w-[14px] h-px bg-[rgba(179, 38, 70,0.5)] flex-shrink-0" />
        <span className="text-[10px] font-bold text-[#64748B] tracking-[0.15em] uppercase whitespace-nowrap">
          {title}
        </span>
        <div className="flex-1 h-px bg-[rgba(0,0,0,0.08)]" />
      </div>
    )
  }

  return (
    <aside
      className={`fixed top-[58px] left-0 h-[calc(100vh-58px)] bg-[#eff4ff] flex flex-col overflow-y-auto overflow-x-hidden z-40 transition-all duration-200 ${
        collapsed
          ? 'w-0 border-transparent'
          : 'w-[220px] border-r border-[rgba(0,0,0,0.08)]'
      }`}
    >

      {/* 상단 퀵 버튼 */}
      <div className="px-1 pt-3 pb-1 space-y-[2px]">
        <NavLink href="/dashboard"    label="자재현황(전체)" />
        <NavLink href="/terminal/bus" label="버스단말기 현황" />
        <NavLink href="/terminal/taxi" label="택시단말기 현황" />
        <hr className="my-2 border-[rgba(0,0,0,0.08)]" />
      </div>

      {/* 섹션별 메뉴 */}
      <div className="flex-1 px-1 pb-2 space-y-[2px]">
        {sections.map(section => (
          <div key={section.title}>
            <SectionLabel title={section.title} />
            {section.items.map(item => (
              <NavLink key={item.href} href={item.href} label={item.label} />
            ))}
          </div>
        ))}

        {/* 로그아웃 */}
        <hr className="my-2 border-[rgba(0,0,0,0.08)]" />
        <button
          onClick={handleLogout}
          className="flex items-center w-full px-3 py-[7px] rounded text-[14px] border-l-[3px] border-l-transparent text-[#1E293B] hover:bg-[rgba(0,0,0,0.04)] hover:border-l-[rgba(179, 38, 70,0.4)] transition-colors"
        >
          🚪 로그아웃
        </button>
      </div>

      {/* 유저 카드 */}
      <div className="mx-[6px] mb-[10px] p-[8px_10px] bg-white rounded border border-[rgba(0,0,0,0.1)] border-l-[3px] border-l-[#B32646]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-[26px] h-[26px] flex-shrink-0 rounded bg-[rgba(179, 38, 70,0.08)] border border-[rgba(179, 38, 70,0.25)] flex items-center justify-center text-[12px] font-bold text-[#B32646]">
            {user.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-[#1E293B] truncate">
              {user.name}
            </div>
            <div className="flex items-center gap-1 mt-[2px] min-w-0">
              <span className="text-[9px] font-bold text-[#B32646] tracking-wide font-mono flex-shrink-0">
                {ROLE_LABEL[user.role] ?? user.role.toUpperCase()}
              </span>
              <span className="text-[9px] text-[#CBD5E1] flex-shrink-0">·</span>
              <span className="text-[9px] text-[#64748B] truncate">
                {user.assigned_center ?? user.center}
              </span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
