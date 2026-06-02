'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

// ── 새 자재요청 폼 ────────────────────────────────────────────────────────────
type WarehouseItem = { id: number; item_name: string; quantity: number; category_large: string | null }

function NewRequestForm({
  user, onSubmitted,
}: { user: SessionUser; onSubmitted: () => void }) {
  const [warehouseItems, setWarehouseItems] = useState<WarehouseItem[]>([])
  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState<Record<number, number>>({}) // item_id -> requested_qty
  const [notes,    setNotes]    = useState('')
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [msg,      setMsg]      = useState('')
  const [success,  setSuccess]  = useState(false)

  useEffect(() => {
    fetch('/api/warehouse?center=%EC%9E%90%EC%9E%AC%EC%84%BC%ED%84%B0')
      .then(r => r.json())
      .then(d => setWarehouseItems(d.data ?? []))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return warehouseItems
    const q = search.toLowerCase()
    return warehouseItems.filter(i => i.item_name.toLowerCase().includes(q))
  }, [warehouseItems, search])

  const selectedCount = Object.values(selected).filter(q => q > 0).length

  const handleQtyChange = (id: number, qty: number) => {
    setSelected(prev => {
      if (qty <= 0) { const next = { ...prev }; delete next[id]; return next }
      return { ...prev, [id]: qty }
    })
  }

  const handleSubmit = async () => {
    if (selectedCount === 0) { setMsg('자재를 1개 이상 선택하세요.'); return }
    setSaving(true); setMsg('')
    try {
      const items = Object.entries(selected)
        .filter(([, q]) => q > 0)
        .map(([idStr, qty]) => {
          const item = warehouseItems.find(i => i.id === Number(idStr))!
          return { item_name: item.item_name, current_qty: item.quantity, requested_qty: qty }
        })
      const res = await fetch('/api/material-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, notes }),
      })
      const d = await res.json()
      if (d.error) { setMsg(d.error); return }
      setSuccess(true); setSelected({}); setNotes('')
      onSubmitted()
    } catch { setMsg('오류 발생') }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-[13px] text-green-700 flex items-center justify-between">
          ✅ 자재요청이 접수되었습니다.
          <button className="text-green-500 underline text-[11px]" onClick={() => setSuccess(false)}>닫기</button>
        </div>
      )}

      {/* 요청자 정보 */}
      <div className="grid grid-cols-2 gap-3 text-[12px]">
        <div>
          <label className="text-[11px] text-[#64748B] block mb-1">요청자</label>
          <div className="border rounded px-3 py-1.5 bg-[#F8F9FA] text-[#94A3B8]">{user.name}</div>
        </div>
        <div>
          <label className="text-[11px] text-[#64748B] block mb-1">소속</label>
          <div className="border rounded px-3 py-1.5 bg-[#F8F9FA] text-[#94A3B8]">
            {user.assigned_center ?? user.center}
          </div>
        </div>
      </div>

      {/* 자재 검색 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[11px] text-[#64748B] font-medium">자재센터 재고에서 선택 *</label>
          {selectedCount > 0 && (
            <span className="text-[11px] text-[#D3004F] font-bold">{selectedCount}종 선택됨</span>
          )}
        </div>
        <Input
          placeholder="품명 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-8 text-[12px] mb-2"
        />
        {loading ? (
          <div className="text-[12px] text-[#94A3B8] py-4 text-center">로딩 중...</div>
        ) : (
          <div className="border rounded overflow-hidden max-h-64 overflow-y-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-[#F8F9FA] sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-[#64748B] font-medium">품명</th>
                  <th className="px-3 py-2 text-right text-[#64748B] font-medium w-20">재고</th>
                  <th className="px-3 py-2 text-center text-[#64748B] font-medium w-28">요청 수량</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={3} className="px-3 py-4 text-center text-[#94A3B8]">검색 결과 없음</td></tr>
                ) : filtered.map((item, i) => {
                  const qty = selected[item.id] ?? 0
                  return (
                    <tr key={item.id} className={qty > 0 ? 'bg-[rgba(211,0,79,0.04)]' : i % 2 === 0 ? 'bg-white' : 'bg-[#FAFAFA]'}>
                      <td className="px-3 py-1.5 text-[#1E293B]">{item.item_name}</td>
                      <td className={`px-3 py-1.5 text-right font-mono ${item.quantity === 0 ? 'text-red-400' : 'text-[#475569]'}`}>
                        {item.quantity.toLocaleString()}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <input
                          type="number"
                          min="0"
                          max={item.quantity}
                          value={qty || ''}
                          placeholder="0"
                          onChange={e => handleQtyChange(item.id, parseInt(e.target.value) || 0)}
                          className="w-20 border rounded px-2 py-0.5 text-[11px] text-center focus:outline-none focus:border-[#D3004F]"
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 선택된 자재 요약 */}
      {selectedCount > 0 && (
        <div className="bg-[rgba(211,0,79,0.04)] border border-[rgba(211,0,79,0.15)] rounded-lg p-3">
          <div className="text-[11px] font-bold text-[#D3004F] mb-2">선택된 자재 ({selectedCount}종)</div>
          <div className="space-y-1">
            {Object.entries(selected).map(([idStr, qty]) => {
              const item = warehouseItems.find(i => i.id === Number(idStr))
              if (!item) return null
              return (
                <div key={idStr} className="flex items-center justify-between text-[12px]">
                  <span className="text-[#1E293B]">{item.item_name}</span>
                  <span className="text-[#D3004F] font-bold">{qty}개 요청</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 비고 */}
      <div>
        <label className="text-[11px] text-[#64748B] mb-1 block">비고 (선택)</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          placeholder="추가 사항을 입력하세요..."
          className="w-full border rounded px-3 py-2 text-[12px] focus:outline-none focus:border-[#D3004F] resize-none"
        />
      </div>

      {msg && <p className="text-[12px] text-red-500">{msg}</p>}

      <Button
        onClick={handleSubmit}
        disabled={saving || selectedCount === 0}
        className="bg-[#D3004F] hover:bg-[#a8003c] text-white"
      >
        {saving ? '제출 중...' : '📦 자재요청 제출'}
      </Button>
    </div>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export default function MaterialRequestsContent({ user }: { user: SessionUser }) {
  const [data,    setData]    = useState<Request[]>([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
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

  const searchedData = useMemo(() => {
    if (!search.trim()) return data
    const q = search.toLowerCase()
    return data.filter(r =>
      r.requester_name.toLowerCase().includes(q) ||
      r.from_center.toLowerCase().includes(q) ||
      (r.notes ?? '').toLowerCase().includes(q) ||
      (r.items ?? []).some((it: { item_name: string }) => it.item_name?.toLowerCase().includes(q))
    )
  }, [data, search])

  const filterByStatus = (status: string | null) =>
    status ? searchedData.filter(r => r.status === status) : searchedData

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

  const canRequest = !isManager && user.role !== 'guest'
  const pendingCount = filterByStatus('pending').length

  return (
    <div className="space-y-4 max-w-3xl">
      <Tabs defaultValue={isManager ? 'pending' : canRequest ? 'new' : 'all'}>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <TabsList className="flex-wrap h-auto">
            {canRequest && (
              <TabsTrigger value="new" className="text-[12px]">➕ 새 요청</TabsTrigger>
            )}
            {isManager && (
              <TabsTrigger value="pending" className="text-[12px]">
                ⏳ 대기중
                {pendingCount > 0 && (
                  <span className="ml-1 bg-[#f57c00] text-white text-[9px] font-bold rounded px-1 py-0.5">
                    {pendingCount}
                  </span>
                )}
              </TabsTrigger>
            )}
            {tabs.map(t => (
              <TabsTrigger key={t.key} value={t.key} className="text-[12px]">{t.label}</TabsTrigger>
            ))}
          </TabsList>
          <div className="flex items-center gap-2 ml-auto">
            {isManager && (
              <Input
                placeholder="이름 / 센터 / 자재명 검색"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-8 text-[12px] w-44"
              />
            )}
            <Button variant="outline" onClick={fetchData} disabled={loading} className="text-[12px] h-8">
              {loading ? '...' : '🔄'}
            </Button>
          </div>
        </div>

        {/* 새 요청 탭 */}
        {canRequest && (
          <TabsContent value="new">
            <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] p-4">
              <h3 className="text-[13px] font-semibold text-[#1E293B] mb-4">자재센터에 자재 요청</h3>
              <NewRequestForm user={user} onSubmitted={fetchData} />
            </div>
          </TabsContent>
        )}

        {/* 대기중 탭 (관리자) */}
        {isManager && (
          <TabsContent value="pending" className="space-y-2 mt-2">
            {loading ? (
              <p className="text-gray-400 text-sm text-center py-8">로딩 중...</p>
            ) : filterByStatus('pending').length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">대기 중인 요청이 없습니다.</p>
            ) : (
              filterByStatus('pending').map(req => (
                <RequestCard key={req.id} {...cardProps(req)} />
              ))
            )}
          </TabsContent>
        )}

        {/* 상태별 탭 */}
        {tabs.map(t => (
          <TabsContent key={t.key} value={t.key} className="space-y-2 mt-2">
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
