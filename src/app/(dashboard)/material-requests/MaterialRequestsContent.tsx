'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { SessionUser } from '@/lib/session'
import { BUS_CENTERS } from '@/constants/centers'

type ReqItem = { item_name: string; current_qty: number; requested_qty: number; approved_qty?: number; erp_code?: string | null }
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
  pending:   { label: '⏳ 대기중',  color: '#96620A' },
  approved:  { label: '✅ 승인',    color: '#0C7A57' },
  rejected:  { label: '❌ 거절',    color: '#D60051' },
  on_hold:   { label: '⏸️ 보류',   color: '#2F3941' },
  cancelled: { label: '🚫 취소됨', color: '#757575' },
}

function tsKst(ts: string) {
  if (!ts) return ''
  try {
    return new Date(new Date(ts).getTime() + 9 * 60 * 60 * 1000)
      .toISOString().slice(0, 16).replace('T', ' ')
  } catch { return ts.slice(0, 10) }
}

// 승인 시 자재센터의 어느 박스(렉/선반/박스)에서 차감할지 항목별로 선택
type BoxOpt = { id: number; rack_no: string | null; shelf: string | null; box_no: string | null; quantity: number }
function boxLabel(o: BoxOpt) {
  const loc = (o.rack_no || o.shelf || o.box_no)
    ? `랙 ${o.rack_no ?? '-'} / 선반 ${o.shelf ?? '-'} / 박스 ${o.box_no ?? '-'}`
    : '위치 미지정'
  return `${loc} · ${o.quantity}개`
}

type Allocation = { item_name: string; warehouse_id: number; quantity: number }
// 자동 분배: 재고 많은 박스부터 수량 채움 (한 박스로 모자라면 다음 박스로)
function autoAlloc(opts: BoxOpt[], need: number) {
  const m: Record<number, number> = {}
  for (const o of opts) {
    if (need <= 0) break
    const take = Math.min(need, o.quantity)
    if (take > 0) { m[o.id] = take; need -= take }
  }
  return m
}
function ApproveModal({ req, onClose, onConfirm }: {
  req: Request
  onClose: () => void
  onConfirm: (allocations: Allocation[], reply: string) => Promise<void>
}) {
  const [boxes, setBoxes] = useState<Record<string, BoxOpt[]>>({})
  // item_name -> { warehouse_id: 차감수량 }
  const [alloc, setAlloc] = useState<Record<string, Record<number, number>>>({})
  // item_name -> 승인수량 (0 = 제외)
  const [approve, setApprove] = useState<Record<string, number>>(
    () => Object.fromEntries((req.items ?? []).map(it => [it.item_name, it.requested_qty])))
  const [reply,  setReply]  = useState('')
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    fetch('/api/warehouse?center=%EC%9E%90%EC%9E%AC%EC%84%BC%ED%84%B0')
      .then(r => r.json())
      .then(d => {
        const rows: (BoxOpt & { item_name: string })[] = d.data ?? []
        const byName: Record<string, BoxOpt[]> = {}
        const init: Record<string, Record<number, number>> = {}
        for (const it of req.items ?? []) {
          const opts = rows.filter(r => r.item_name === it.item_name)
            .map(r => ({ id: r.id, rack_no: r.rack_no, shelf: r.shelf, box_no: r.box_no, quantity: r.quantity }))
            .sort((a, b) => b.quantity - a.quantity)
          byName[it.item_name] = opts
          init[it.item_name] = autoAlloc(opts, it.requested_qty)
        }
        setBoxes(byName); setAlloc(init)
      })
      .finally(() => setLoading(false))
  }, [req])

  // 승인수량 변경 시 박스 배분 자동 재계산 (상한 = 요청수량)
  function setApproveQty(name: string, v: number) {
    const max = req.items.find(it => it.item_name === name)?.requested_qty ?? 0
    const q = Math.min(max, Math.max(0, Math.floor(v) || 0))
    setApprove(prev => ({ ...prev, [name]: q }))
    setAlloc(prev => ({ ...prev, [name]: autoAlloc(boxes[name] ?? [], q) }))
  }

  function setQty(name: string, id: number, max: number, v: number) {
    const q = Math.max(0, Math.min(max, Math.floor(v) || 0))
    setAlloc(prev => ({ ...prev, [name]: { ...(prev[name] ?? {}), [id]: q } }))
  }

  const valid = !loading && (req.items ?? []).every(it => {
    const target = approve[it.item_name] ?? 0
    const assigned = Object.values(alloc[it.item_name] ?? {}).reduce((a, b) => a + b, 0)
    return assigned === target
  }) && (req.items ?? []).some(it => (approve[it.item_name] ?? 0) > 0)

  async function submit() {
    const allocations: Allocation[] = []
    for (const [name, m] of Object.entries(alloc))
      for (const [idStr, q] of Object.entries(m))
        if (q > 0) allocations.push({ item_name: name, warehouse_id: Number(idStr), quantity: q })
    setSaving(true)
    try { await onConfirm(allocations, reply) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-[600px] max-w-full max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E3E1DE]">
          <div className="text-[13px] font-bold text-[#111111]">✅ 승인 — 박스별 차감 수량 지정</div>
          <button onClick={onClose} className="text-[#8A949C] hover:text-[#111111] text-lg leading-none">×</button>
        </div>
        <div className="p-4 overflow-y-auto space-y-3">
          {loading ? (
            <div className="text-[12px] text-[#8A949C] py-6 text-center">자재센터 재고 불러오는 중…</div>
          ) : (req.items ?? []).map((it, i) => {
            const opts = boxes[it.item_name] ?? []
            const m = alloc[it.item_name] ?? {}
            const assigned = Object.values(m).reduce((a, b) => a + b, 0)
            const avail = opts.reduce((a, o) => a + o.quantity, 0)
            const target = approve[it.item_name] ?? 0
            const excluded = target === 0
            const enough = assigned === target
            return (
              <div key={i} className={`border border-[#E3E1DE] rounded-lg p-3 space-y-2 ${excluded ? 'opacity-60 bg-[#F6F6F7]' : ''}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className={`text-[13px] font-semibold text-[#111111] ${excluded ? 'line-through' : ''}`}>{it.item_name}</span>
                  <div className="flex items-center gap-2 text-[12px]">
                    <span className="text-[#5A666F]">요청 {it.requested_qty}개</span>
                    <span className="text-[#D60051] font-bold">승인</span>
                    <input type="number" min={0} max={it.requested_qty} value={target}
                      onChange={e => setApproveQty(it.item_name, parseInt(e.target.value))}
                      className="w-16 border border-[#E3E1DE] rounded px-2 py-0.5 text-[12px] text-right bg-white focus:outline-none focus:border-[#D60051]" />
                    <button type="button"
                      onClick={() => setApproveQty(it.item_name, excluded ? it.requested_qty : 0)}
                      className={`px-2 py-0.5 rounded border text-[11px] ${excluded ? 'border-[#0C7A57] text-[#0C7A57]' : 'border-[#E3E1DE] text-[#5A666F] hover:border-[#D60051] hover:text-[#D60051]'}`}>
                      {excluded ? '포함' : '제외'}
                    </button>
                  </div>
                </div>
                {excluded ? (
                  <div className="text-[11px] text-[#5A666F]">이 품목은 승인에서 제외됩니다 (차감 없음)</div>
                ) : opts.length === 0 ? (
                  <div className="text-[11px] text-[#D60051]">⚠️ 자재센터에 재고 박스가 없습니다 (차감 불가) — 제외하거나 보류하세요</div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      {opts.map(o => (
                        <div key={o.id} className="flex items-center gap-2">
                          <span className="text-[11px] text-[#2F3941] flex-1 truncate">{boxLabel(o)}</span>
                          <input type="number" min={0} max={o.quantity} value={m[o.id] ?? 0}
                            onChange={e => setQty(it.item_name, o.id, o.quantity, parseInt(e.target.value))}
                            className="w-20 border border-[#E3E1DE] rounded px-2 py-0.5 text-[12px] text-right bg-white focus:outline-none focus:border-[#D60051]" />
                        </div>
                      ))}
                    </div>
                    <div className={`text-[11px] font-semibold ${enough ? 'text-[#0C7A57]' : 'text-[#D60051]'}`}>
                      배정 {assigned} / 승인 {target}
                      {target !== it.requested_qty && <span className="text-[#96620A]"> · 요청 {it.requested_qty}에서 수정됨</span>}
                      {!enough && (assigned < target
                        ? (avail < target ? ` · ⚠️ 자재센터 재고 부족 (최대 ${avail})` : ' · ⚠️ 배정 수량이 부족합니다')
                        : ' · ⚠️ 배정이 승인수량보다 많습니다')}
                    </div>
                  </>
                )}
              </div>
            )
          })}
          <div>
            <label className="text-[11px] text-[#5A666F] block mb-1">신청자에게 보낼 메시지 (선택)</label>
            <textarea value={reply} onChange={e => setReply(e.target.value)} rows={2}
              className="w-full border border-[#E3E1DE] rounded px-3 py-2 text-[12px] bg-white focus:outline-none focus:border-[#D60051] resize-none" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#E3E1DE]">
          <Button size="sm" variant="outline" onClick={onClose}>취소</Button>
          <Button size="sm" className="bg-[#0C7A57] hover:bg-[#0C7A57] text-white" disabled={saving || !valid} onClick={submit}>
            {saving ? '처리 중…' : '승인 확정'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function RequestCard({
  req, isManager, isAdmin, onAction, onApprove, onDelete,
}: {
  req: Request
  isManager: boolean
  isAdmin: boolean
  onAction: (id: number, action: string, reply?: string) => Promise<void>
  onApprove: (id: number, allocations: Allocation[], reply: string) => Promise<void>
  onDelete: (id: number) => Promise<void>
}) {
  const [showApprove, setShowApprove] = useState(false)
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
          <span className="text-[13px] font-medium text-[#111111]">
            {req.requester_name}
          </span>
          <span className="text-[12px] text-[#5A666F] ml-2">
            {req.from_center} · {tsKst(req.requested_at)}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-2">
          <span className="text-[13px] font-bold" style={{ color: st.color }}>{st.label}</span>
          <span className="text-[#8A949C]">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-[rgba(0,0,0,0.06)] space-y-3 bg-white">
          {/* 자재 목록 */}
          {req.items?.length > 0 && (
            <div className="mt-3 border rounded overflow-hidden">
              <table className="w-full text-[12px]">
                <thead className="bg-[#F6F6F7]">
                  <tr>
                    {['자재명','ERP','현재재고','요청수량', ...(req.status === 'approved' ? ['승인수량'] : []), '재고상태'].map(h => (
                      <th key={h} className="px-3 py-1.5 text-left text-[#5A666F] font-semibold border-b border-[rgba(0,0,0,0.08)]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {req.items.map((it, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-1.5 text-[#111111]">{it.item_name}</td>
                      <td className="px-3 py-1.5">{it.erp_code === undefined ? <span className="text-[#8A949C] text-[11px]">-</span> : <ErpBadge code={it.erp_code} />}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{it.current_qty}</td>
                      <td className="px-3 py-1.5 text-right font-mono font-bold">{it.requested_qty}</td>
                      {req.status === 'approved' && (
                        <td className="px-3 py-1.5 text-right font-mono font-bold">
                          {it.approved_qty === undefined ? it.requested_qty
                            : it.approved_qty === 0 ? <span className="text-[#D60051]">제외</span>
                            : <span className={it.approved_qty !== it.requested_qty ? 'text-[#96620A]' : 'text-[#0C7A57]'}>{it.approved_qty}</span>}
                        </td>
                      )}
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

          {req.notes      && <p className="text-[12px] text-[#5A666F]">📝 비고: {req.notes}</p>}
          {req.reply_message && <p className="text-[12px] text-[#2F3941]">💬 회신: {req.reply_message}</p>}
          {req.processor?.name && (
            <p className="text-[11px] text-[#8A949C]">
              처리자: {req.processor.name}
              {req.processed_at && ` · ${tsKst(req.processed_at)}`}
            </p>
          )}

          {/* 관리자 액션 */}
          {isManager && req.status === 'pending' && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setShowApprove(true)}
                  className="bg-[#0C7A57] hover:bg-[#0C7A57] text-white" disabled={actionLoad}>
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
                    className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:border-[#D60051] resize-none"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" className="bg-[#D60051] hover:bg-[#A3003D] text-white"
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
                  onClick={() => onDelete(req.id)}>확인</Button>
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

      {showApprove && (
        <ApproveModal
          req={req}
          onClose={() => setShowApprove(false)}
          onConfirm={async (allocations, reply) => { await onApprove(req.id, allocations, reply); setShowApprove(false) }}
        />
      )}
    </div>
  )
}

// ── 새 자재요청 폼 ────────────────────────────────────────────────────────────
type WarehouseItem = { id: number; item_name: string; quantity: number; category_large: string | null; category_mid: string | null; erp_code: string | null }

// ERP 등록 여부 뱃지 (자재센터 기준)
function ErpBadge({ code }: { code: string | null | undefined }) {
  return code
    ? <span className="inline-block px-1.5 py-0.5 rounded bg-[#ecfdf5] text-[#047857] text-[10px] font-mono whitespace-nowrap" title="ERP 등록">{code}</span>
    : <span className="inline-block px-1.5 py-0.5 rounded bg-[#FCEEF3] text-[#D60051] text-[10px] font-semibold whitespace-nowrap" title="ERP 미등록 (자재센터 기준)">ERP 미등록</span>
}

// 이 센터들은 자재요청 시 '버스 > 설치자재'만 보이고 요청 가능
const BUS_INSTALL_ONLY = new Set([...BUS_CENTERS, '대전센터', '고속/시외'])

function NewRequestForm({
  user, onSubmitted,
}: { user: SessionUser; onSubmitted: () => void }) {
  const requesterCenter = user.assigned_center ?? user.center
  const onlyBusInstall = BUS_INSTALL_ONLY.has(requesterCenter)
  const [warehouseItems, setWarehouseItems] = useState<WarehouseItem[]>([])
  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState<Record<string, number>>({}) // item_name -> requested_qty
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

  // 타센터 요청은 박스별이 아니라 자재명별 "합계 수량"만 보이게 집계
  const aggregated = useMemo(() => {
    let base = warehouseItems
    if (onlyBusInstall) {
      base = base.filter(i => i.category_large === '버스' && i.category_mid === '설치자재')
    }
    // ERP 등록 여부는 자재센터 박스 기준 (타센터는 코드 누락이 많음)
    const m = new Map<string, { total: number; erp: string | null }>()
    for (const i of base) {
      const cur = m.get(i.item_name) ?? { total: 0, erp: null }
      cur.total += i.quantity ?? 0
      if (!cur.erp && i.erp_code?.trim()) cur.erp = i.erp_code.trim()
      m.set(i.item_name, cur)
    }
    return [...m.entries()]
      .map(([item_name, v]) => ({ item_name, total: v.total, erp_code: v.erp }))
      .sort((a, b) => a.item_name.localeCompare(b.item_name, 'ko'))
  }, [warehouseItems, onlyBusInstall])

  const filtered = useMemo(() => {
    if (!search.trim()) return aggregated
    const q = search.toLowerCase()
    return aggregated.filter(i => i.item_name.toLowerCase().includes(q) || (i.erp_code ?? '').toLowerCase().includes(q))
  }, [aggregated, search])

  const selectedCount = Object.values(selected).filter(q => q > 0).length

  const handleQtyChange = (name: string, qty: number) => {
    setSelected(prev => {
      if (qty <= 0) { const next = { ...prev }; delete next[name]; return next }
      return { ...prev, [name]: qty }
    })
  }

  const handleSubmit = async () => {
    if (selectedCount === 0) { setMsg('자재를 1개 이상 선택하세요.'); return }
    setSaving(true); setMsg('')
    try {
      const items = Object.entries(selected)
        .filter(([, q]) => q > 0)
        .map(([item_name, qty]) => {
          const agg = aggregated.find(a => a.item_name === item_name)
          return { item_name, current_qty: agg?.total ?? 0, requested_qty: qty, erp_code: agg?.erp_code ?? null }
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
          <label className="text-[11px] text-[#5A666F] block mb-1">요청자</label>
          <div className="border rounded px-3 py-1.5 bg-[#F6F6F7] text-[#8A949C]">{user.name}</div>
        </div>
        <div>
          <label className="text-[11px] text-[#5A666F] block mb-1">소속</label>
          <div className="border rounded px-3 py-1.5 bg-[#F6F6F7] text-[#8A949C]">
            {user.assigned_center ?? user.center}
          </div>
        </div>
      </div>

      {/* 자재 검색 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[11px] text-[#5A666F] font-medium">
            자재센터 재고에서 선택 *
            {onlyBusInstall && <span className="ml-1.5 text-[#2F3941] font-semibold">· 버스 설치자재만</span>}
          </label>
          {selectedCount > 0 && (
            <span className="text-[11px] text-[#D60051] font-bold">{selectedCount}종 선택됨</span>
          )}
        </div>
        <Input
          placeholder="품명 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-8 text-[12px] mb-2"
        />
        {loading ? (
          <div className="text-[12px] text-[#8A949C] py-4 text-center">로딩 중...</div>
        ) : (
          <div className="border rounded overflow-hidden max-h-64 overflow-y-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-[#F6F6F7] sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-[#5A666F] font-medium">품명</th>
                  <th className="px-3 py-2 text-left text-[#5A666F] font-medium w-40">ERP</th>
                  <th className="px-3 py-2 text-right text-[#5A666F] font-medium w-20">재고</th>
                  <th className="px-3 py-2 text-center text-[#5A666F] font-medium w-28">요청 수량</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-4 text-center text-[#8A949C]">검색 결과 없음</td></tr>
                ) : filtered.map((item, i) => {
                  const qty = selected[item.item_name] ?? 0
                  return (
                    <tr key={item.item_name} className={qty > 0 ? 'bg-[rgba(214,0,81,0.04)]' : i % 2 === 0 ? 'bg-white' : 'bg-[#F6F6F7]'}>
                      <td className="px-3 py-1.5 text-[#111111]">{item.item_name}</td>
                      <td className="px-3 py-1.5"><ErpBadge code={item.erp_code} /></td>
                      <td className={`px-3 py-1.5 text-right font-mono ${item.total === 0 ? 'text-red-400' : 'text-[#2F3941]'}`}>
                        {item.total.toLocaleString()}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <input
                          type="number"
                          min="0"
                          max={item.total}
                          value={qty || ''}
                          placeholder="0"
                          onChange={e => handleQtyChange(item.item_name, parseInt(e.target.value) || 0)}
                          className="w-20 border rounded px-2 py-0.5 text-[11px] text-center focus:outline-none focus:border-[#D60051]"
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
        <div className="bg-[rgba(214,0,81,0.04)] border border-[rgba(214,0,81,0.15)] rounded-lg p-3">
          <div className="text-[11px] font-bold text-[#D60051] mb-2">선택된 자재 ({selectedCount}종)</div>
          <div className="space-y-1">
            {Object.entries(selected).filter(([, q]) => q > 0).map(([name, qty]) => (
              <div key={name} className="flex items-center justify-between gap-2 text-[12px]">
                <span className="text-[#111111] truncate">{name}</span>
                <span className="flex items-center gap-2 flex-shrink-0">
                  <ErpBadge code={aggregated.find(a => a.item_name === name)?.erp_code ?? null} />
                  <span className="text-[#D60051] font-bold">{qty}개 요청</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 비고 */}
      <div>
        <label className="text-[11px] text-[#5A666F] mb-1 block">비고 (선택)</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          placeholder="추가 사항을 입력하세요..."
          className="w-full border rounded px-3 py-2 text-[12px] focus:outline-none focus:border-[#D60051] resize-none"
        />
      </div>

      {msg && <p className="text-[12px] text-red-500">{msg}</p>}

      <Button
        onClick={handleSubmit}
        disabled={saving || selectedCount === 0}
        className="bg-[#D60051] hover:bg-[#A3003D] text-white"
      >
        {saving ? '제출 중...' : '📦 자재요청 제출'}
      </Button>
    </div>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export default function MaterialRequestsContent({ user, initialTab }: { user: SessionUser; initialTab?: string }) {
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

  const handleApprove = async (
    id: number,
    allocations: Allocation[],
    reply: string,
  ) => {
    const r = await fetch('/api/material-requests/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'approved', replyMessage: reply, allocations }),
    })
    const d = await r.json().catch(() => ({}))
    if (d.error) alert(`❌ ${d.error}`)
    else if (d.warnings?.length) alert(`⚠️ 일부 차감 실패:\n${d.warnings.join('\n')}`)
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
    req, isManager, isAdmin,
    onAction: handleAction,
    onApprove: handleApprove,
    onDelete: (id: number) => handleDelete(id),
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

  const canRequest = user.role !== 'guest'
  const pendingCount = filterByStatus('pending').length

  // 탑바 처리대기 등에서 ?tab=pending 으로 들어오면 해당 탭으로 시작 (유효한 탭만)
  const validTabs = new Set<string>([
    ...(canRequest ? ['new'] : []),
    ...(isManager ? ['pending'] : []),
    ...tabs.map(t => t.key),
  ])
  const baseTab = isManager ? 'pending' : canRequest ? 'new' : 'all'
  const activeTab = initialTab && validTabs.has(initialTab) ? initialTab : baseTab

  return (
    <div className="space-y-4 max-w-3xl">
      <Tabs key={activeTab} defaultValue={activeTab}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
          <div className="overflow-x-auto -mx-1 px-1 sm:mx-0 sm:px-0">
          <TabsList className="h-auto w-max flex-nowrap">
            {canRequest && (
              <TabsTrigger value="new" className="text-[12px]">새 요청</TabsTrigger>
            )}
            {isManager && (
              <TabsTrigger value="pending" className="text-[12px]">
                대기중
                {pendingCount > 0 && (
                  <span className="ml-1 bg-[#96620A] text-white text-[9px] font-bold rounded px-1 py-0.5">
                    {pendingCount}
                  </span>
                )}
              </TabsTrigger>
            )}
            {tabs.map(t => (
              <TabsTrigger key={t.key} value={t.key} className="text-[12px]">{t.label}</TabsTrigger>
            ))}
          </TabsList>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
            {isManager && (
              <Input
                placeholder="이름 / 센터 / 자재명 검색"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-8 text-[12px] w-full sm:w-44"
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
              <h3 className="text-[13px] font-semibold text-[#111111] mb-4">자재센터에 자재 요청</h3>
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
