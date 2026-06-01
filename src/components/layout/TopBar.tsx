import type { SessionUser } from '@/lib/session'

const ROLE_LABEL: Record<string, string> = {
  admin: '관리자', materials: '자재파트',
  manager: '센터장', user: '일반', guest: '게스트',
}

interface TopBarProps {
  user: SessionUser
  title: string
}

export default function TopBar({ user, title }: TopBarProps) {
  const center = user.assigned_center ?? user.center

  return (
    <header className="fixed top-0 left-0 right-0 h-[58px] bg-white/95 backdrop-blur-sm border-b border-[rgba(0,0,0,0.08)] shadow-sm z-50 flex items-stretch">
      {/* 로고 */}
      <div className="w-[220px] flex-shrink-0 flex items-center justify-center px-4 border-r border-[rgba(0,0,0,0.08)]">
        <span className="text-[14px] font-bold text-[#1E293B] tracking-tight">
          ATEC 자재관리
        </span>
      </div>

      {/* 제목 + 유저 정보 */}
      <div className="flex-1 flex items-center justify-between px-5">
        <span className="text-[15px] font-bold text-[#1E293B] tracking-tight">
          {title}
        </span>

        <div className="flex items-center gap-2 text-[13px]">
          <span className="font-semibold text-[#1E293B]">{center}</span>
          <span className="text-[#CBD5E1]">·</span>
          <span className="font-semibold text-[#1E293B]">{user.name}</span>
          <span className="text-[#CBD5E1]">·</span>
          <span className="text-[#64748B]">{ROLE_LABEL[user.role] ?? user.role}</span>
        </div>
      </div>
    </header>
  )
}
