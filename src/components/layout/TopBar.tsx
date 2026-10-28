'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { LogOut, LogIn, UserPlus, Search } from 'lucide-react'
import type { SessionUser } from '@/lib/session'
import { useAuthGate } from '../auth/AuthGate'

const ROLE_LABEL: Record<string, string> = {
  admin: '관리자', materials: '자재파트',
  manager: '센터장', user: '일반', guest: '게스트',
}

const IDLE_LOGOUT_MS = 30 * 60 * 1000 // 자동 로그아웃 (IdleLogout과 동일)
const AWAY_MS = 5 * 60 * 1000 // 5분 무활동 → 자리비움
const DANGER_MS = 5 * 60 * 1000 // 자동 로그아웃 5분 전 → 위험
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const

type ActivityState = 'active' | 'away' | 'danger'

const ACTIVITY_TEXT: Record<ActivityState, string> = {
  active: 'text-[#5A666F]',
  away: 'text-[#96620A]',
  danger: 'text-[#D60051]',
}

const ACTIVITY_LABEL: Record<ActivityState, string> = {
  active: '활동중',
  away: '자리비움',
  danger: '곧 종료',
}

// 경로 → 화면 제목
const TITLE_MAP: Record<string, string> = {
  '/dashboard': '자재현황(전체)',
  '/warehouse': '재고 현황',
  '/material-requests': '자재 요청',
  '/purchase-requests': '구매 요청',
  '/usage': '사용내역',
  '/history': '입출고 이력',
  '/rack-map': '자재창고 지도',
  '/bus-tracking': '센터 단말현황(버스)',
  '/terminal/bus': '버스단말기 현황',
  '/terminal/taxi': '택시단말기 현황',
  '/notices': '공지사항',
  '/inquiry': '문의하기',
  '/online-users': '접속 현황',
  '/admin': '관리자',
  '/mypage': '마이페이지',
}

// 경로 → 화면 제목 (하위 경로는 가장 긴 접두 매칭)
export function pageTitle(pathname: string): string {
  if (TITLE_MAP[pathname]) return TITLE_MAP[pathname]
  const key = Object.keys(TITLE_MAP)
    .filter(k => pathname.startsWith(k + '/'))
    .sort((a, b) => b.length - a.length)[0]
  return key ? TITLE_MAP[key] : ''
}

// 전역 검색 결과: 자재명 기준으로 묶어 센터별 수량 + 총수량
type SearchHit = { name: string; total: number; centers: { center: string; qty: number }[] }

function groupHits(rows: { item_name: string; location: string | null; quantity: number | null }[]): SearchHit[] {
  const map = new Map<string, Map<string, number>>()
  for (const r of rows) {
    if (!r.item_name) continue
    const byCenter = map.get(r.item_name) ?? new Map<string, number>()
    const c = r.location ?? '미지정'
    byCenter.set(c, (byCenter.get(c) ?? 0) + (r.quantity ?? 0))
    map.set(r.item_name, byCenter)
  }
  return [...map].map(([name, byCenter]) => {
    const centers = [...byCenter].map(([center, qty]) => ({ center, qty })).sort((a, b) => b.qty - a.qty)
    return { name, total: centers.reduce((s, c) => s + c.qty, 0), centers }
  }).slice(0, 10)
}

type Counts = {
  mat_pending: number
  pur_pending: number
  tr_pending: number
  unread_notices: number
}

interface TopBarProps {
  user: SessionUser | null
  collapsed: boolean
  onToggle: () => void
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return '00:00:00'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

// 상단 우측 텍스트 링크 (레퍼런스 포털: 얇은 세로선으로 구분된 텍스트 메뉴)
function BarItem({ children, onClick, className = '' }: {
  children: React.ReactNode; onClick?: () => void; className?: string
}) {
  const base = `items-center gap-1 px-3 h-full border-l border-[#E3E1DE] text-[12.5px] whitespace-nowrap ${className}`
  return onClick
    ? <button onClick={onClick} className={`flex ${base} hover:bg-[#F6F6F7] transition-colors`}>{children}</button>
    : <div className={`flex ${base}`}>{children}</div>
}

function Count({ n }: { n: number }) {
  return <b className={n > 0 ? 'text-[#D60051]' : 'text-[#8A949C]'}>{n}</b>
}

export default function TopBar({ user, collapsed, onToggle }: TopBarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { openLogin } = useAuthGate()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [open, setOpen] = useState(false)
  const [counts, setCounts] = useState<Counts>({ mat_pending: 0, pur_pending: 0, tr_pending: 0, unread_notices: 0 })
  const [remaining, setRemaining] = useState<number | null>(null)
  const [activity, setActivity] = useState<ActivityState>('active')
  const lastActivityRef = useRef<number>(Date.now())

  // 검색어 입력 → 250ms 디바운스 후 조회, 자재명 기준 센터별 수량 드롭다운
  useEffect(() => {
    const v = q.trim()
    if (!v) return
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      fetch(`/api/warehouse?q=${encodeURIComponent(v)}`, { signal: ctrl.signal })
        .then(r => r.json())
        .then(d => { if (!d.error) { setHits(groupHits(d.data ?? [])); setOpen(true) } })
        .catch(() => {})
    }, 250)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [q])

  const goSearch = (v: string) => {
    setOpen(false); setQ('')
    router.push(`/warehouse?q=${encodeURIComponent(v)}`)
  }

  // 카운트 갱신 (게스트는 인증 API 호출 생략)
  useEffect(() => {
    if (!user) return
    fetch('/api/notifications/counts')
      .then(r => r.json())
      .then(d => { if (!d.error) setCounts(d) })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // 활동 추적 → 자동 로그아웃까지 남은 시간 + 상태 색상 (활동중/자리비움/위험)
  useEffect(() => {
    if (!user) return
    const onActivity = () => { lastActivityRef.current = Date.now() }
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, onActivity, { passive: true }))

    const tick = () => {
      const idle = Date.now() - lastActivityRef.current
      const left = IDLE_LOGOUT_MS - idle
      setRemaining(left)
      if (left <= DANGER_MS) setActivity('danger')
      else if (idle >= AWAY_MS) setActivity('away')
      else setActivity('active')
    }
    tick()
    const timer = setInterval(tick, 1000)

    return () => {
      clearInterval(timer)
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, onActivity))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const center = user ? (user.assigned_center ?? user.center) : ''
  const pending = [
    { label: '이동', n: counts.tr_pending,  href: '/warehouse?tab=transfers' },
    { label: '자재', n: counts.mat_pending, href: '/material-requests?tab=pending' },
    { label: '구매', n: counts.pur_pending, href: '/purchase-requests?tab=pending' },
  ].filter(p => p.n > 0)

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    // 풀 리로드 → 게스트 미리보기 모드로 전환
    window.location.href = '/dashboard'
  }

  return (
    <header className="fixed top-0 left-0 right-0 h-[58px] bg-white border-b border-[#D9D9D9] z-50 flex items-stretch">
      {/* 토글 + 브랜드 */}
      <div className="flex-shrink-0 flex items-center gap-2 pl-3 pr-4">
        <button
          onClick={onToggle}
          className="p-[6px] rounded hover:bg-[#F6F6F7] flex-shrink-0 text-[#5A666F] hover:text-[#111111] transition-colors"
          aria-label="사이드바 열고 닫기"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect y="2"    width="16" height="1.5" rx="0.75" fill="currentColor" />
            <rect y="7.25" width="16" height="1.5" rx="0.75" fill="currentColor" />
            <rect y="12.5" width="16" height="1.5" rx="0.75" fill="currentColor" />
          </svg>
        </button>
        <span className="flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="text-[22px] font-black tracking-tight text-[#D60051] leading-none">ATEC</span>
          <span className="hidden sm:inline text-[16px] font-bold tracking-tight text-[#111111] leading-none">에이텍모빌리티</span>
        </span>
        <span className="hidden md:inline-block h-4 w-px bg-[#D9D9D9] mx-2" />
        <span className="hidden md:inline text-[13px] font-medium text-[#2F3941] whitespace-nowrap">자재관리 시스템</span>
      </div>

      {/* 전역 검색 → 재고 현황으로 검색어 전달 */}
      <form
        onSubmit={e => { e.preventDefault(); const v = q.trim(); if (v) goSearch(v) }}
        className={`hidden md:flex items-center pl-4 border-l border-[#E3E1DE] `}
      >
        <div className="relative w-[260px] lg:w-[320px]">
          <div className="flex items-center gap-2 h-9 px-3 rounded-[3px] border border-[#D9D9D9] bg-white focus-within:border-[#111111] transition-colors">
            <Search size={15} strokeWidth={2} className="text-[#8A949C] flex-shrink-0" />
            <input
              value={q}
              onChange={e => { setQ(e.target.value); if (!e.target.value.trim()) setHits([]) }}
              onFocus={() => { if (hits.length) setOpen(true) }}
              onBlur={() => setOpen(false)}
              onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}
              placeholder="자재명 · ERP코드 · 분류 검색"
              aria-label="자재 검색"
              className="flex-1 min-w-0 text-[13px] bg-transparent outline-none placeholder:text-[#8A949C]"
            />
          </div>

          {/* 검색 결과 드롭다운: 자재명 / 총수량 / 센터별 수량. onMouseDown 방지 → blur 전에 클릭 처리 */}
          {open && q.trim() && (
            <div
              onMouseDown={e => e.preventDefault()}
              className="absolute left-0 right-0 top-[calc(100%+4px)] max-h-[420px] overflow-y-auto bg-white border border-[#D9D9D9] rounded-[3px] shadow-[0_6px_20px_rgba(0,0,0,0.12)] z-50"
            >
              {hits.length === 0 ? (
                <div className="px-3 py-3 text-[12.5px] text-[#8A949C]">검색 결과 없음</div>
              ) : hits.map(h => (
                <button
                  key={h.name}
                  type="button"
                  onClick={() => goSearch(h.name)}
                  className="w-full text-left px-3 py-2 border-b border-[#F0EEEB] last:border-b-0 hover:bg-[#F6F6F7] transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-[#111111] truncate">{h.name}</span>
                    <span className="text-[12px] whitespace-nowrap text-[#5A666F]">
                      총 <b className={h.total > 0 ? 'text-[#D60051]' : 'text-[#8A949C]'}>{h.total.toLocaleString()}</b>개
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11.5px] text-[#5A666F]">
                    {h.centers.map(c => (
                      <span key={c.center}>{c.center} <b className="text-[#2F3941]">{c.qty.toLocaleString()}</b></span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </form>

      {/* 우측 — 게스트는 로그인/회원가입 버튼만 */}
      {!user ? (
        <div className="flex-1 flex items-center justify-end gap-2 pr-3 md:pr-5">
          <button
            onClick={() => openLogin('register')}
            className="inline-flex items-center gap-1.5 px-3 h-9 text-[13px] font-semibold text-[#111111] hover:text-[#D60051] transition-colors"
            aria-label="회원가입"
          >
            <UserPlus size={15} strokeWidth={1.9} />
            <span className="whitespace-nowrap">회원가입</span>
          </button>
          <button
            onClick={() => openLogin('login')}
            className="inline-flex items-center gap-1.5 px-4 h-9 rounded-[3px] bg-[#D60051] text-white text-[13px] font-bold hover:bg-[#A3003D] transition-colors"
            aria-label="로그인"
          >
            <LogIn size={15} strokeWidth={1.9} />
            <span className="whitespace-nowrap">로그인</span>
          </button>
        </div>
      ) : (
      <div className="flex-1 flex items-stretch justify-end overflow-hidden">
        {/* 공지 — 미확인 건이 있을 때만 */}
        {counts.unread_notices > 0 && (
          <BarItem onClick={() => router.push('/notices')}>
            <span className="text-[#5A666F]">공지</span> <Count n={counts.unread_notices} />
          </BarItem>
        )}

        {/* 처리대기 — 0건 항목은 숨김 */}
        {pending.length > 0 && (
          <div className="hidden lg:flex items-center gap-2.5 px-3 border-l border-[#E3E1DE] text-[12.5px] whitespace-nowrap">
            <span className="text-[#5A666F]">처리대기</span>
            {pending.map((p, i) => (
              <span key={p.href} className="flex items-center gap-2.5">
                {i > 0 && <span className="text-[#D9D9D9]">·</span>}
                <button onClick={() => router.push(p.href)} className="hover:text-[#D60051] transition-colors">
                  {p.label} <Count n={p.n} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* 세션 잔여시간 — 자리비움/종료 임박일 때만 */}
        {activity !== 'active' && (
          <BarItem className={`hidden sm:flex ${ACTIVITY_TEXT[activity]}`}>
            <span className="text-[11px] font-semibold">{ACTIVITY_LABEL[activity]}</span>
            <span className="font-mono text-[12px] font-semibold">
              {remaining !== null ? formatRemaining(remaining) : '--:--:--'}
            </span>
          </BarItem>
        )}

        {/* 유저 */}
        <BarItem className="hidden md:flex">
          <span className="font-bold text-[#111111]">{user.name}</span>
          <span className="text-[#5A666F]">{ROLE_LABEL[user.role] ?? user.role}</span>
          <span className="text-[#D9D9D9] mx-0.5">·</span>
          <span className="text-[#5A666F]">{center}</span>
          <span className="text-[#D9D9D9] mx-0.5">·</span>
          <span className="font-mono text-[11.5px] text-[#5A666F]">{today()}</span>
        </BarItem>

        <BarItem onClick={() => router.push('/mypage')} className="hidden sm:flex text-[#2F3941] font-medium">
          마이페이지
        </BarItem>

        <BarItem onClick={handleLogout} className="text-[#2F3941] font-medium pr-4">
          <LogOut size={14} strokeWidth={2} />
          <span className="hidden sm:inline">로그아웃</span>
        </BarItem>
      </div>
      )}
    </header>
  )
}
