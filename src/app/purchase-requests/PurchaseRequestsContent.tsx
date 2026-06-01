'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { SessionUser } from '@/lib/session'

// ── 타입 ──────────────────────────────────────────────────────────────────────
type PurchaseItem = { 품명: string; 수량: number; 링크?: string }
type PurchaseRequest = {
  id: number
  status: string
  items: PurchaseItem[]
  requester_id: string
  requester_name: string
  requester_center: string
  reason: string
  cost_note: string | null
  notes: string | null
  requested_at: string
  processed_at: string | null
  processor: { name: string; center: string; assigned_center: string | null } | null
}

// ── 상수 ──────────────────────────────────────────────────────────────────────
const STATUS_KO: Record<string, { label: string; color: string }> = {
  pending:     { label: '⏳ 대기중',  color: '#f57c00' },
  in_progress: { label: '🔄 처리중',  color: '#1565c0' },
  completed:   { label: '✅ 완료',    color: '#2e7d32' },
  rejected:    { label: '❌ 거절',    color: '#c62828' },
  cancelled:   { label: '🚫 취소됨', color: '#757575' },
}

const STATUS_OPTIONS = ['pending', 'in_progress', 'completed', 'rejected', 'cancelled']

function tsKst(ts: string) {
  if (!ts) return ''
  try {
    return new Date(new Date(ts).getTime() + 9 * 3600 * 1000)
      .toISOString().slice(0, 16).replace('T', ' ')
  } catch { return ts.slice(0, 10) }
}

// ── 요청 카드 (관리자 전체 현황) ─────────────────────────────────────────────
function ManagerCard({
  req, onStatusChange, onDelete, isAdmin,
}: {
  req: PurchaseRequest
  onStatusChange: (id: number, status: string, replyMessage?: string) => Promise<void>
  onDelete: (id: number) => Promise<void>
  isAdmin: boolean
}) {
  const [open,        setOpen]        = useState(false)
  const [selStatus,   setSelStatus]   = useState(req.status)
  const [replyMsg,    setReplyMsg]    = useState('')
  const [confirmDel,  setConfirmDel]  = useState(false)
  const [saving,      setSaving]      = useState(false)
  const st = STATUS_KO[req.status] ?? { label: req.status, color: '#555' }

  const handleSave = async () => {
    setSaving(true)
    try { await onStatusChange(req.id, selStatus, replyMsg) }
    finally { setSaving(false) }
  }

  const needsReply = ['in_progress', 'completed', 'rejected'].includes(selStatus) && selStatus !== req.status

  return (
    <div className="border rounded-lg overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors text-left">
        <div className="min-w-0">
          <span className="text-[13px] font-semibold text-[#1E293B]">{req.requester_name}</span>
          <span className="text-[12px] text-[#64748B] ml-2">
            {req.requester_center} · {tsKst(req.requested_at)}
          </span>
          <div className="text-[11px] text-[#94A3B8] mt-0.5 truncate max-w-xs">{req.reason}</div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-2">
          <span className="text-[12px] font-bold" style={{ color: st.color }}>{st.label}</span>
          <span className="text-[#94A3B8]">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-[rgba(0,0,0,0.06)] space-y-3 bg-white">
          {/* 구매 목록 */}
          {req.items?.length > 0 && (
            <div className="mt-3 border rounded overflow-hidden">
              <table className="w-full text-[12px]">
                <thead className="bg-[#F8F9FA]">
                  <tr>
                    {['No', '품명', '수량', '링크'].map(h => (
                      <th key={h} className="px-3 py-1.5 text-left text-[#64748B] font-semibold border-b">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {req.items.map((it, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-1.5 text-[#94A3B8]">{i + 1}</td>
                      <td className="px-3 py-1.5 text-[#1E293B] font-medium">{it.품명}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{it.수량}</td>
                      <td className="px-3 py-1.5">
                        {it.링크
                          ? <a href={it.링크} target="_blank" rel="noreferrer"
                               className="text-blue-500 underline text-[11px]">링크</a>
                          : <span className="text-[#CBD5E1]">-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {req.cost_note && <p className="text-[12px] text-[#64748B]">💰 원가반영: {req.cost_note}</p>}
          {req.notes     && <p className="text-[12px] text-[#64748B]">📝 비고: {req.notes}</p>}
          {req.processor?.name && (
            <p className="text-[11px] text-[#94A3B8]">
              처리자: {req.processor.name}
              {req.processed_at && ` · ${tsKst(req.processed_at)}`}
            </p>
          )}

          {/* 상태 변경 */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[#64748B] flex-shrink-0">상태 변경:</span>
              <select
                value={selStatus}
                onChange={e => setSelStatus(e.target.value)}
                className="border rounded px-2 py-1 text-[12px] focus:outline-none focus:border-[#D3004F]"
              >
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s}>{STATUS_KO[s]?.label ?? s}</option>
                ))}
              </select>
            </div>
            {needsReply && (
              <textarea
                value={replyMsg}
                onChange={e => setReplyMsg(e.target.value)}
                rows={2}
                placeholder="신청자에게 보낼 메시지 (선택)"
                className="w-full border rounded px-3 py-2 text-[12px] focus:outline-none focus:border-[#D3004F] resize-none"
              />
            )}
            {selStatus !== req.status && (
              <Button size="sm" className="bg-[#D3004F] hover:bg-[#B0003D] text-white"
                disabled={saving} onClick={handleSave}>
                {saving ? '저장 중...' : '💾 저장'}
              </Button>
            )}
          </div>

          {/* 삭제 */}
          {isAdmin && (
            <div className="pt-1">
              {confirmDel ? (
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-red-500">정말 삭제합니까?</span>
                  <Button size="sm" className="bg-red-500 hover:bg-red-600 text-white"
                    onClick={() => onDelete(req.id)}>확인</Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirmDel(false)}>취소</Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" className="text-red-400"
                  onClick={() => setConfirmDel(true)}>🗑️ 삭제</Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── 내 요청 카드 ─────────────────────────────────────────────────────────────
function MyCard({
  req, onCancel,
}: {
  req: PurchaseRequest
  onCancel: (id: number) => Promise<void>
}) {
  const [open,       setOpen]       = useState(false)
  const [confirmCan, setConfirmCan] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const st = STATUS_KO[req.status] ?? { label: req.status, color: '#555' }

  const handleCancel = async () => {
    setCancelling(true)
    try { await onCancel(req.id) }
    finally { setCancelling(false); setConfirmCan(false) }
  }

  const canCancel = ['pending', 'in_progress'].includes(req.status)

  return (
    <div className="border rounded-lg overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors text-left">
        <div className="min-w-0">
          <span className="text-[13px] font-semibold text-[#1E293B]">{tsKst(req.requested_at)}</span>
          <span className="text-[12px] text-[#64748B] ml-2">품목 {req.items?.length ?? 0}개</span>
          <div className="text-[11px] text-[#94A3B8] mt-0.5 truncate max-w-xs">{req.reason}</div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-2">
          <span className="text-[12px] font-bold" style={{ color: st.color }}>{st.label}</span>
          <span className="text-[#94A3B8]">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-[rgba(0,0,0,0.06)] space-y-3 bg-white">
          {req.items?.length > 0 && (
            <div className="mt-3 border rounded overflow-hidden">
              <table className="w-full text-[12px]">
                <thead className="bg-[#F8F9FA]">
                  <tr>
                    {['No', '품명', '수량', '링크'].map(h => (
                      <th key={h} className="px-3 py-1.5 text-left text-[#64748B] font-semibold border-b">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {req.items.map((it, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-1.5 text-[#94A3B8]">{i + 1}</td>
                      <td className="px-3 py-1.5 text-[#1E293B] font-medium">{it.품명}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{it.수량}</td>
                      <td className="px-3 py-1.5">
                        {it.링크
                          ? <a href={it.링크} target="_blank" rel="noreferrer"
                               className="text-blue-500 underline text-[11px]">링크</a>
                          : <span className="text-[#CBD5E1]">-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {req.cost_note && <p className="text-[12px] text-[#64748B]">💰 원가반영: {req.cost_note}</p>}
          {req.notes     && <p className="text-[12px] text-[#64748B]">📝 비고: {req.notes}</p>}

          {canCancel && (
            <div className="pt-1">
              {confirmCan ? (
                <div className="space-y-2">
                  <p className="text-[12px] text-red-500">이 구매 요청을 취소합니다. 되돌릴 수 없습니다.</p>
                  <div className="flex gap-2">
                    <Button size="sm" className="bg-red-500 hover:bg-red-600 text-white"
                      disabled={cancelling} onClick={handleCancel}>
                      {cancelling ? '취소 중...' : '✅ 확인 취소'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setConfirmCan(false)}>되돌리기</Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" variant="outline" className="text-red-400"
                  onClick={() => setConfirmCan(true)}>
                  🚫 요청 취소
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── 새 요청 작성 폼 ──────────────────────────────────────────────────────────
function NewRequestForm({ user, onSubmitted }: { user: SessionUser; onSubmitted: () => void }) {
  const [items, setItems]       = useState<PurchaseItem[]>([{ 품명: '', 수량: 1, 링크: '' }])
  const [reason, setReason]     = useState('')
  const [costNote, setCostNote] = useState('')
  const [notes, setNotes]       = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState(false)
  const lastSubmitRef = useRef<number>(0)

  const addRow = () => setItems(prev => [...prev, { 품명: '', 수량: 1, 링크: '' }])
  const removeRow = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i))
  const updateItem = (i: number, field: keyof PurchaseItem, val: string | number) =>
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it))

  const handleSubmit = async () => {
    const validItems = items.filter(it => it.품명.trim())
    if (!validItems.length) return setError('구매 목록을 1개 이상 입력해 주세요.')
    if (!reason.trim())    return setError('구매사유를 입력해 주세요.')
    if (!costNote.trim())  return setError('원가반영을 입력해 주세요.')

    const now = Date.now()
    if (now - lastSubmitRef.current < 60000) {
      return setError(`요청이 이미 제출되었습니다. 잠시 후 다시 시도해 주세요.`)
    }

    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/purchase-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: validItems,
          reason: reason.trim(),
          cost_note: costNote.trim(),
          notes: notes.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) return setError(json.error ?? '제출 실패')
      lastSubmitRef.current = Date.now()
      setSuccess(true)
      setItems([{ 품명: '', 수량: 1, 링크: '' }])
      setReason(''); setCostNote(''); setNotes('')
      onSubmitted()
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-[13px] text-green-700">
          ✅ 요청이 접수되었습니다. 관리자 및 자재파트에 알림 메일이 발송됐습니다.
          <button className="ml-2 text-green-500 underline" onClick={() => setSuccess(false)}>닫기</button>
        </div>
      )}

      {/* 요청자 정보 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-[#64748B] mb-1">요청자</label>
          <input value={user.name} disabled
            className="w-full border rounded px-3 py-1.5 text-[12px] bg-gray-50 text-[#94A3B8]" />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-[#64748B] mb-1">소속</label>
          <input value={user.assigned_center ?? user.center} disabled
            className="w-full border rounded px-3 py-1.5 text-[12px] bg-gray-50 text-[#94A3B8]" />
        </div>
      </div>

      {/* 구매 목록 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[11px] font-semibold text-[#64748B]">구매 목록 *</label>
          <Button size="sm" variant="outline" onClick={addRow} className="text-[11px] h-6 px-2">+ 행 추가</Button>
        </div>
        <div className="border rounded overflow-hidden">
          <table className="w-full text-[12px]">
            <thead className="bg-[#F8F9FA]">
              <tr>
                <th className="px-2 py-1.5 text-left text-[#64748B] font-semibold border-b w-8">No</th>
                <th className="px-2 py-1.5 text-left text-[#64748B] font-semibold border-b">품명 *</th>
                <th className="px-2 py-1.5 text-left text-[#64748B] font-semibold border-b w-20">수량 *</th>
                <th className="px-2 py-1.5 text-left text-[#64748B] font-semibold border-b">링크 (URL)</th>
                <th className="px-2 py-1.5 border-b w-8"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-2 py-1 text-[#94A3B8] text-center">{i + 1}</td>
                  <td className="px-2 py-1">
                    <input value={it.품명} onChange={e => updateItem(i, '품명', e.target.value)}
                      placeholder="품명 입력"
                      className="w-full border-0 bg-transparent text-[12px] focus:outline-none focus:bg-blue-50 rounded px-1 py-0.5" />
                  </td>
                  <td className="px-2 py-1">
                    <input type="number" min={1} value={it.수량}
                      onChange={e => updateItem(i, '수량', parseInt(e.target.value) || 1)}
                      className="w-full border-0 bg-transparent text-[12px] text-right focus:outline-none focus:bg-blue-50 rounded px-1 py-0.5" />
                  </td>
                  <td className="px-2 py-1">
                    <input value={it.링크 ?? ''} onChange={e => updateItem(i, '링크', e.target.value)}
                      placeholder="https://..."
                      className="w-full border-0 bg-transparent text-[12px] focus:outline-none focus:bg-blue-50 rounded px-1 py-0.5 text-blue-500" />
                  </td>
                  <td className="px-2 py-1 text-center">
                    {items.length > 1 && (
                      <button onClick={() => removeRow(i)}
                        className="text-[#CBD5E1] hover:text-red-400 text-[14px] leading-none">×</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 구매사유 */}
      <div>
        <label className="block text-[11px] font-semibold text-[#64748B] mb-1">구매사유 *</label>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
          placeholder="품의서에 들어갈 구매사유 문구를 입력해주세요."
          className="w-full border rounded px-3 py-2 text-[12px] focus:outline-none focus:border-[#D3004F] resize-none" />
      </div>

      {/* 원가반영 */}
      <div>
        <label className="block text-[11px] font-semibold text-[#64748B] mb-1">원가반영 *</label>
        <textarea value={costNote} onChange={e => setCostNote(e.target.value)} rows={3}
          placeholder="원가반영 내용을 입력해주세요."
          className="w-full border rounded px-3 py-2 text-[12px] focus:outline-none focus:border-[#D3004F] resize-none" />
      </div>

      {/* 비고 */}
      <div>
        <label className="block text-[11px] font-semibold text-[#64748B] mb-1">비고 (선택)</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
          placeholder="추가 전달사항이 있으면 입력해주세요."
          className="w-full border rounded px-3 py-2 text-[12px] focus:outline-none focus:border-[#D3004F] resize-none" />
      </div>

      {error && (
        <p className="text-red-500 text-[12px] bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
      )}

      <Button onClick={handleSubmit} disabled={submitting}
        className="bg-[#D3004F] hover:bg-[#B0003D] text-white w-full">
        {submitting ? '제출 중...' : '📨 요청 제출'}
      </Button>
    </div>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export default function PurchaseRequestsContent({ user }: { user: SessionUser }) {
  const [data,    setData]    = useState<PurchaseRequest[]>([])
  const [myData,  setMyData]  = useState<PurchaseRequest[]>([])
  const [loading, setLoading] = useState(true)

  const isManager = user.role === 'admin' || user.role === 'materials'
  const isAdmin   = user.role === 'admin'

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [allRes, mineRes] = await Promise.all([
        isManager ? fetch('/api/purchase-requests') : Promise.resolve(null),
        fetch('/api/purchase-requests?mine=1'),
      ])
      if (allRes) {
        const j = await allRes.json(); setData(j.data ?? [])
      }
      const jm = await mineRes.json(); setMyData(jm.data ?? [])
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchAll() }, [])

  const handleStatusChange = async (id: number, status: string, replyMessage?: string) => {
    await fetch('/api/purchase-requests/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, replyMessage }),
    })
    fetchAll()
  }

  const handleDelete = async (id: number) => {
    await fetch('/api/purchase-requests', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    fetchAll()
  }

  const handleCancel = async (id: number) => {
    await fetch('/api/purchase-requests/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'cancelled' }),
    })
    fetchAll()
  }

  const filterByStatus = (list: PurchaseRequest[], status: string | null) =>
    status ? list.filter(r => r.status === status) : list

  const pendingCount = data.filter(r => r.status === 'pending').length

  const tabs = isManager
    ? [
        { key: 'new',        label: '📝 새 요청 작성' },
        { key: 'pending',    label: `⏳ 대기중 (${pendingCount})` },
        { key: 'in_progress',label: '🔄 처리중' },
        { key: 'completed',  label: '✅ 완료' },
        { key: 'rejected',   label: '❌ 거절' },
        { key: 'all',        label: '📋 전체' },
        { key: 'mine',       label: '👤 내 요청' },
      ]
    : [
        { key: 'new',        label: '📝 새 요청 작성' },
        { key: 'mine',       label: '👤 내 요청 현황' },
      ]

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-[#1E293B]">🛒 구매 요청</h2>
        <Button variant="outline" onClick={fetchAll} disabled={loading} className="text-[12px]">
          {loading ? '로딩 중...' : '🔄 새로고침'}
        </Button>
      </div>

      <Tabs defaultValue="new">
        <TabsList className="flex-wrap h-auto gap-1">
          {tabs.map(t => (
            <TabsTrigger key={t.key} value={t.key} className="text-[12px]">{t.label}</TabsTrigger>
          ))}
        </TabsList>

        {/* 새 요청 작성 */}
        <TabsContent value="new" className="mt-4">
          <NewRequestForm user={user} onSubmitted={fetchAll} />
        </TabsContent>

        {/* 관리자: 상태별 탭 */}
        {isManager && ['pending', 'in_progress', 'completed', 'rejected', 'all'].map(key => (
          <TabsContent key={key} value={key} className="space-y-2 mt-3">
            {loading ? (
              <p className="text-gray-400 text-sm text-center py-8">로딩 중...</p>
            ) : filterByStatus(data, key === 'all' ? null : key).length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">해당 요청 내역이 없습니다.</p>
            ) : filterByStatus(data, key === 'all' ? null : key).map(req => (
              <ManagerCard key={req.id} req={req} isAdmin={isAdmin}
                onStatusChange={handleStatusChange} onDelete={handleDelete} />
            ))}
          </TabsContent>
        ))}

        {/* 내 요청 */}
        <TabsContent value="mine" className="space-y-2 mt-3">
          {loading ? (
            <p className="text-gray-400 text-sm text-center py-8">로딩 중...</p>
          ) : myData.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">제출한 구매 요청이 없습니다.</p>
          ) : myData.map(req => (
            <MyCard key={req.id} req={req} onCancel={handleCancel} />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  )
}
