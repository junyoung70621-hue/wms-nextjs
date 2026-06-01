'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { SessionUser } from '@/lib/session'

type ReqItem = { item_name: string; current_qty: number; requested_qty: number }
type Request = {
  id: number
  status: string
  items: ReqItem[]
  requester_name: string
  requester_email: string
  from_center: string
  requested_at: string
  processed_at: string | null
  reply_message: string | null
  notes: string | null
  processor: { name: string; center: string; assigned_center: string | null } | null
}

const STATUS_KO: Record<string, { label: string; color: string }> = {
  pending:   { label: '⏳ 대기중',  color: '#f57c00' },
  approved:  { label: '✅ 승인',    color: '#2e7d32' },
  rejected:  { label: '❌ 거절',    color: '#c62828' },
  on_hold:   { label: '⏸️ 보류',   color: '#1565c0' },
  cancelled: { label: '🚫 취소됨', color: '#757575' },
}

function tsKst(ts: string) {
  if (!ts) return ''
  try {
    return new Date(new Date(ts).getTime() + 9 * 60 * 60 * 1000)
      .toISOString().slice(0, 16).replace('T', ' ')
  } catch { return ts.slice(0, 10) }
}

function RequestCard({
  req, isManager, isAdmin, userId, onAction, onDelete,
}: {
  req: Request
  isManager: boolean
  isAdmin: boolean
  userId: string
  onAction: (id: number, action: string, reply?: string) => Promise<void>
  onDelete: (id: number, name: string) => Promise<void>
}) {
  const [open,       setOpen]       = useState(false)
  const [actionLoad, setActionLoad] = useState(false)
  const [replyText,  setReplyText]  = useState('')
  const [showReply,  setShowReply]  = useState(false)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)

  const st = STATUS_KO[req.status] ?? { label: req.status, color: '#555' }

  const handleAction = async (action: string) => {
    setActionLoad(true)
    try { await onAction(req.id, action, replyText) }
    finally { setActionLoad(false); setPendingAction(null); setShowReply(false) }
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors text-left">
        <div className="min-w-0">
          <span className="text-[13px] font-medium text-[#1E293B]">
            {req.requester_name}
          </span>
          <span className="text-[12px] text-[#64748B] ml-2">
            {req.from_center} · {tsKst(req.requested_at)}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-2">
          <span className="text-[13px] font-bold" style={{ color: st.color }}>{st.label}</span>
          <span className="text-[#94A3B8]">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-[rgba(0,0,0,0.06)] space-y-3 bg-white">
          {/* 자재 목록 */}
          {req.items?.length > 0 && (
            <div className="mt-3 border rounded overflow-hidden">
              <table className="w-full text-[12px]">
                <thead className="bg-[#F8F9FA]">
                  <tr>
                    {['자재명','현재재고','요청수량','재고상태'].map(h => (
                      <th key={h} className="px-3 py-1.5 text-left text-[#64748B] font-semibold border-b border-[rgba(0,0,0,0.08)]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {req.items.map((it, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-1.5 text-[#1E293B]">{it.item_name}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{it.current_qty}</td>
                      <td className="px-3 py-1.5 text-right font-mono font-bold">{it.requested_qty}</td>
                      <td className="px-3 py-1.5">
                        {it.current_qty < it.requested_qty
                          ? <span className="text-amber-500">⚠️ 재고부족</span>
                          : <span className="text-green-600">✅ 충분</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {req.notes      && <p className="text-[12px] text-[#64748B]">📝 비고: {req.notes}</p>}
          {req.reply_message && <p className="text-[12px] text-[#0284C7]">💬 회신: {req.reply_message}</p>}
          {req.processor?.name && (
            <p className="text-[11px] text-[#94A3B8]">
              처리자: {req.processor.name}
              {req.processed_at && ` · ${tsKst(req.processed_at)}`}
            </p>
          )}

          {/* 관리자 액션 */}
          {isManager && req.status === 'pending' && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Button size="sm" onClick={() => { setPendingAction('approved'); setShowReply(true) }}
                  className="bg-[#2e7d32] hover:bg-[#1b5e20] text-white" disabled={actionLoad}>
                  ✅ 승인
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setPendingAction('rejected'); setShowReply(true) }}
                  disabled={actionLoad}>
                  ❌ 거절
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setPendingAction('on_hold'); setShowReply(true) }}
                  disabled={actionLoad}>
                  ⏸️ 보류
                </Button>
              </div>
              {showReply && (
                <div className="space-y-2">
                  <textarea
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    rows={2}
                    placeholder="신청자에게 보낼 메시지 (선택)"
                    className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:border-[#D3004F] resize-none"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" className="bg-[#D3004F] hover:bg-[#B0003D] text-white"
                      disabled={actionLoad} onClick={() => pendingAction && handleAction(pendingAction)}>
                      {actionLoad ? '처리 중...' : '확인 처리'}
                    </Button>
                    <Button size="sm" variant="outline"
                      onClick={() => { setShowReply(false); setPendingAction(null) }}>
                      취소
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {isManager && req.status === 'on_hold' && (
            <Button size="sm" variant="outline" onClick={() => handleAction('pending')} disabled={actionLoad}>
              🔄 대기중으로 되돌리기
            </Button>
          )}

          {/* 사용자 취소 */}
          {!isManager && req.status === 'pending' && (
            <Button size="sm" variant="outline" className="text-red-500"
              onClick={() => handleAction('cancelled')} disabled={actionLoad}>
              🚫 요청 취소
            </Button>
          )}

          {/* admin 삭제 */}
          {isAdmin && (
            confirmDel ? (
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-red-500">정말 삭제합니까?</span>
                <Button size="sm" className="bg-red-500 hover:bg-red-600 text-white"
                  onClick={() => onDelete(req.id, req.requester_name)}>확인</Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmDel(false)}>취소</Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="text-red-400"
                onClick={() => setConfirmDel(true)}>
                🗑️ 삭제
              </Button>
            )
          )}
        </div>
      )}
    </div>
  )
}

export default function MaterialRequestsContent({ user }: { user: SessionUser }) {
  const [data,    setData]    = useState<Request[]>([])
  const [loading, setLoading] = useState(true)
  const isManager = user.role === 'admin' || user.role === 'materials'
  const isAdmin   = user.role === 'admin'

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/material-requests')
      const json = await res.json()
      setData(json.data ?? [])
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [])

  const handleAction = async (id: number, action: string, reply?: string) => {
    if (action === 'cancelled') {
      await fetch('/api/material-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: action }),
      })
    } else {
      await fetch('/api/material-requests/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, replyMessage: reply }),
      })
    }
    fetchData()
  }

  const handleDelete = async (id: number) => {
    await fetch('/api/material-requests', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    fetchData()
  }

  const filterByStatus = (status: string | null) =>
    status ? data.filter(r => r.status === status) : data

  const cardProps = (req: Request) => ({
    req, isManager, isAdmin, userId: user.id,
    onAction: handleAction,
    onDelete: (id: number, name: string) => handleDelete(id),
  })

  if (!isManager && user.role === 'guest') {
    return <p className="text-gray-500">게스트는 자재 요청 현황을 조회할 수 없습니다.</p>
  }

  const tabs = isManager
    ? [
        { key: 'pending',  label: `⏳ 대기중 (${filterByStatus('pending').length})` },
        { key: 'approved', label: '✅ 승인' },
        { key: 'rejected', label: '❌ 거절' },
        { key: 'on_hold',  label: '⏸️ 보류' },
        { key: 'all',      label: '📋 전체' },
      ]
    : [
        { key: 'all',      label: '📋 전체' },
        { key: 'pending',  label: '⏳ 대기중' },
        { key: 'approved', label: '✅ 승인' },
        { key: 'rejected', label: '❌ 거절' },
        { key: 'on_hold',  label: '⏸️ 보류' },
        { key: 'cancelled',label: '🚫 취소' },
      ]

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-[#1E293B]">📦 자재 요청 {isManager ? '관리' : '현황'}</h2>
        <Button variant="outline" onClick={fetchData} disabled={loading}>
          {loading ? '로딩 중...' : '🔄 새로고침'}
        </Button>
      </div>

      <Tabs defaultValue={isManager ? 'pending' : 'all'}>
        <TabsList className="flex-wrap h-auto">
          {tabs.map(t => (
            <TabsTrigger key={t.key} value={t.key} className="text-[12px]">{t.label}</TabsTrigger>
          ))}
        </TabsList>

        {tabs.map(t => (
          <TabsContent key={t.key} value={t.key} className="space-y-2 mt-3">
            {loading ? (
              <p className="text-gray-400 text-sm text-center py-8">로딩 중...</p>
            ) : filterByStatus(t.key === 'all' ? null : t.key).length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">해당 요청 내역이 없습니다.</p>
            ) : (
              filterByStatus(t.key === 'all' ? null : t.key).map(req => (
                <RequestCard key={req.id} {...cardProps(req)} />
              ))
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
