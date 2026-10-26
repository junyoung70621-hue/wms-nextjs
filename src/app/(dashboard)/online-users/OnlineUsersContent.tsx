'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'

type OnlineUser = {
  id: string
  name: string
  username: string
  center: string
  assigned_center: string | null
  role: string
  last_active: string | null
  online: boolean
}

const ROLE_COLOR: Record<string, string> = {
  admin: '#D60051', materials: '#7c3aed', manager: '#2F3941', user: '#0C7A57', guest: '#5A666F',
}
const ROLE_LABEL: Record<string, string> = {
  admin: 'ADMIN', materials: 'MATERIALS', manager: 'MANAGER', user: 'USER', guest: 'GUEST',
}

function relativeTime(ts: string | null) {
  if (!ts) return '활동 없음'
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return '방금 전'
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}

export default function OnlineUsersContent() {
  const [list,    setList]    = useState<OnlineUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/online-users')
      const d = await res.json()
      if (d.error) { setError(d.error); return }
      setList(d.data)
    } catch { setError('로드 실패') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const onlineCount = list.filter(u => u.online).length

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-[#E3E1DE] p-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
            <span className="text-[13px] font-semibold text-[#111111]">
              최근 8시간 내 활동: {onlineCount}명
            </span>
          </div>
          <span className="text-[11px] text-[#8A949C]">전체 {list.length}명</span>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="text-[11px] h-7">
          새로고침
        </Button>
      </div>

      {loading ? (
        <div className="text-[12px] text-[#8A949C] py-8 text-center">불러오는 중...</div>
      ) : error ? (
        <div className="text-red-500 text-[12px]">{error}</div>
      ) : (
        <div className="bg-white rounded-lg border border-[#E3E1DE] overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-[#F6F6F7] text-[#5A666F]">
                <th className="px-4 py-2.5 text-left font-medium w-8">상태</th>
                <th className="px-4 py-2.5 text-left font-medium">이름</th>
                <th className="px-4 py-2.5 text-left font-medium">아이디</th>
                <th className="px-4 py-2.5 text-left font-medium">센터</th>
                <th className="px-4 py-2.5 text-left font-medium">역할</th>
                <th className="px-4 py-2.5 text-left font-medium">마지막 활동</th>
              </tr>
            </thead>
            <tbody>
              {list.map((u, i) => (
                <tr
                  key={u.id}
                  className={
                    u.online
                      ? 'bg-green-50'
                      : i % 2 === 0 ? 'bg-white' : 'bg-[#F6F6F7]'
                  }
                >
                  <td className="px-4 py-2.5 text-center">
                    <span
                      className={`w-2 h-2 rounded-full inline-block ${
                        u.online ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    />
                  </td>
                  <td className="px-4 py-2.5 font-medium text-[#111111]">{u.name}</td>
                  <td className="px-4 py-2.5 text-[#5A666F]">@{u.username}</td>
                  <td className="px-4 py-2.5 text-[#2F3941]">
                    {u.assigned_center ?? u.center}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{
                        color: ROLE_COLOR[u.role] ?? '#555',
                        background: (ROLE_COLOR[u.role] ?? '#555') + '18',
                      }}
                    >
                      {ROLE_LABEL[u.role] ?? u.role}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[#8A949C]">
                    {relativeTime(u.last_active)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
