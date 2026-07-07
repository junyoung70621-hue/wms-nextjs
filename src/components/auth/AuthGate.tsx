'use client'

import { createContext, useContext, useState, useCallback } from 'react'
import LoginModal, { type AuthTab } from './LoginModal'

type AuthGateValue = { openLogin: (tab?: AuthTab) => void }

const AuthGateContext = createContext<AuthGateValue>({ openLogin: () => {} })

export function useAuthGate() {
  return useContext(AuthGateContext)
}

export function AuthGateProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<AuthTab>('login')

  const openLogin = useCallback((t: AuthTab = 'login') => {
    setTab(t)
    setOpen(true)
  }, [])

  return (
    <AuthGateContext.Provider value={{ openLogin }}>
      {children}
      {open && <LoginModal key={tab} defaultTab={tab} onClose={() => setOpen(false)} />}
    </AuthGateContext.Provider>
  )
}

// 게스트 미리보기에서 본문 클릭을 가로채 로그인 팝업을 여는 투명 오버레이
export function GuestClickOverlay({ className }: { className?: string }) {
  const { openLogin } = useAuthGate()
  return (
    <div
      className={className}
      onClick={() => openLogin('login')}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') openLogin('login') }}
      aria-label="로그인이 필요합니다"
    />
  )
}

// 화면 하단 고정 "둘러보기 모드" 안내 pill + 로그인 버튼
export function GuestModePill() {
  const { openLogin } = useAuthGate()
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2.5 rounded-full bg-[#1E293B] pl-4 pr-1.5 py-1.5 shadow-xl max-w-[calc(100vw-24px)]">
      <span className="text-[12.5px] font-semibold text-white whitespace-nowrap overflow-hidden text-ellipsis">
        👁 둘러보기 모드 · 실제 데이터는 로그인 후 확인할 수 있습니다
      </span>
      <button
        onClick={() => openLogin('login')}
        className="flex-shrink-0 inline-flex items-center gap-1 rounded-full bg-[#b32646] hover:bg-[#9a1f3c] text-white text-[12px] font-bold px-3.5 py-1.5 transition-colors"
      >
        로그인
      </button>
    </div>
  )
}
