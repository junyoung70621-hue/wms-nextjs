'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  LayoutGrid, Bus, CarTaxiFront, Boxes, Share2, History, BarChart3,
  ClipboardList, ShoppingCart, Map, Settings, Users, Megaphone,
  MessageSquare, CircleUser, type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SessionUser } from '@/lib/session'

type Counts = { mat_pending: number; pur_pending: number; unread_notices: number }

type Item = { href: string; label: string; icon: LucideIcon }
type Section = { title: string; items: Item[] }

// ── 메뉴 구성 ────────────────────────────────────────────────────────────────
function getMenuSections(user: SessionUser): Section[] {
  const role = user.role
  const center = user.assigned_center ?? user.center
  const isAdmin = role === 'admin'
  const isMaterials = role === 'materials'
  const isGuest = role === 'guest'

  const showBusTracking =
    isAdmin || ['강남센터', '강서센터', '강북센터', '강동센터', '자재센터'].includes(center)

  const sections: Section[] = []

  sections.push({
    title: 'Dashboard',
    items: [{ href: '/dashboard', label: '자재현황(전체)', icon: LayoutGrid }],
  })

  const assetItems: Item[] = [
    { href: '/terminal/bus', label: '버스단말기 현황', icon: Bus },
    { href: '/terminal/taxi', label: '택시단말기 현황', icon: CarTaxiFront },
    { href: '/warehouse', label: '재고 현황', icon: Boxes },
  ]
  if (showBusTracking)
    assetItems.push({ href: '/bus-tracking', label: '센터 단말현황(버스)', icon: Share2 })
  assetItems.push({ href: '/history', label: '입출고 이력', icon: History })
  if (!isGuest) assetItems.push({ href: '/usage', label: '사용내역 이력', icon: BarChart3 })
  sections.push({ title: 'Asset Management', items: assetItems })

  if (!isGuest) {
    sections.push({
      title: 'Requests',
      items: [
        { href: '/material-requests', label: '자재요청현황', icon: ClipboardList },
        { href: '/purchase-requests', label: '구매 요청', icon: ShoppingCart },
      ],
    })
  }

  const utilItems: Item[] = []
  if (isAdmin || isMaterials) utilItems.push({ href: '/rack-map', label: '자재창고 지도', icon: Map })
  if (isAdmin) {
    utilItems.push({ href: '/admin', label: '관리자', icon: Settings })
    utilItems.push({ href: '/online-users', label: '접속 현황', icon: Users })
  }
  utilItems.push({ href: '/notices', label: '공지사항', icon: Megaphone })
  utilItems.push({ href: '/inquiry', label: '문의하기', icon: MessageSquare })
  utilItems.push({ href: '/mypage', label: '마이페이지', icon: CircleUser })
  sections.push({ title: 'Utilities', items: utilItems })

  return sections
}

const ROLE_LABEL: Record<string, string> = {
  admin: 'ADMIN', materials: 'MATERIALS',
  manager: 'MANAGER', user: 'USER', guest: 'GUEST',
}

export default function Sidebar({ user, collapsed }: { user: SessionUser; collapsed: boolean }) {
  const pathname = usePathname()
  const sections = getMenuSections(user)
  const [counts, setCounts] = useState<Counts>({ mat_pending: 0, pur_pending: 0, unread_notices: 0 })

  useEffect(() => {
    fetch('/api/notifications/counts')
      .then(r => r.json())
      .then(d => { if (!d.error) setCounts(d) })
      .catch(() => {})
  }, [pathname])

  const BADGE_MAP: Record<string, number> = {
    '/material-requests': counts.mat_pending,
    '/purchase-requests': counts.pur_pending,
    '/notices': counts.unread_notices,
  }

  function NavLink({ href, label, icon: Icon }: Item) {
    const isActive = pathname === href || pathname.startsWith(href + '/')
    const badge = BADGE_MAP[href] ?? 0
    return (
      <Link
        href={href}
        className={cn(
          'flex items-center gap-2.5 w-full pl-3 pr-2.5 py-[7px] rounded-md text-[13px] border-l-[3px] transition-colors',
          isActive
            ? 'font-semibold text-[#b32646] bg-[#fbe9ee] border-l-[#b32646]'
            : 'font-normal text-[#475569] border-l-transparent hover:bg-[#e5eeff] hover:text-[#1e293b]'
        )}
      >
        <Icon size={16} strokeWidth={1.9} className="flex-shrink-0" />
        <span className="flex-1 truncate">{label}</span>
        {badge > 0 && (
          <span className="bg-[#b32646] text-white text-[9px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1 leading-none">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </Link>
    )
  }

  return (
    <aside
      className={`fixed top-[58px] left-0 h-[calc(100vh-58px)] w-[240px] bg-white border-r border-[#e2e8f0] flex flex-col overflow-y-auto overflow-x-hidden z-40 transition-transform duration-200 ${
        collapsed ? '-translate-x-full' : 'translate-x-0'
      }`}
    >
      {/* 섹션별 메뉴 */}
      <div className="flex-1 px-2 pt-3 pb-2 space-y-[2px]">
        {sections.map(section => (
          <div key={section.title} className="mb-1">
            <div className="px-2 pt-3 pb-1.5">
              <span className="text-[10px] font-bold tracking-[0.12em] text-[#94A3B8] uppercase">
                {section.title}
              </span>
            </div>
            {section.items.map(item => (
              <NavLink key={item.href} {...item} />
            ))}
          </div>
        ))}
      </div>

      {/* 유저 카드 */}
      <div className="mx-2 mb-2 p-2 bg-[#f8f9ff] rounded-lg border border-[#e2e8f0] flex items-center gap-2 min-w-0">
        <div className="w-[28px] h-[28px] flex-shrink-0 rounded-full bg-[#fbe9ee] border border-[rgba(179,38,70,0.25)] flex items-center justify-center text-[12px] font-bold text-[#b32646]">
          {user.name.charAt(0)}
        </div>
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-[#1E293B] truncate">{user.name}</div>
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-[9px] font-bold text-[#b32646] tracking-wide flex-shrink-0">
              {ROLE_LABEL[user.role] ?? user.role.toUpperCase()}
            </span>
            <span className="text-[9px] text-[#CBD5E1] flex-shrink-0">·</span>
            <span className="text-[9px] text-[#64748B] truncate">{user.assigned_center ?? user.center}</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
