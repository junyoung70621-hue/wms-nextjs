'use client'

import { useSearchParams } from 'next/navigation'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ClipboardCheck, TriangleAlert, PackageX, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SessionUser } from '@/lib/session'
import { GUEST_VIEWER } from '@/lib/guestViewer'
import GuestCallout from '@/components/auth/GuestCallout'
import { getViewableCenters, CENTERS, NO_WAREHOUSE, BUS_CENTERS } from '@/constants/centers'
import TerminalBoxSection from '@/components/TerminalBoxSection'
import MaterialRequestsContent from '../material-requests/MaterialRequestsContent'
import UsageContent from '../usage/UsageContent'

// ── 타입 ─────────────────────────────────────────────────────────────────────
type Item = {
  id: number
  item_name: string
  quantity: number
  rack_no: string | null
  shelf: string | null
  box_no: string | null
  category_large: string | null
  category_mid: string | null
  category_small: string | null
  location: string
  erp_name: string | null
  erp_code: string | null
  notes: string | null
}

type HistoryRow = {
  id: number
  action_type: string
  quantity: number
  reason: string | null
  from_center: string | null
  to_center: string | null
  snapshot_qty_before: number
  snapshot_qty_after: number
  acted_at: string
  actor: { name: string } | null
}

type Transfer = {
  id: number
  from_center: string
  to_center: string
  quantity: number
  status: string
  requested_at: string
  processed_at: string | null
  requester: { id: string; name: string; center: string; assigned_center: string | null } | null
  approver: { name: string; center: string; assigned_center: string | null } | null
  warehouse: { id: number; item_name: string; quantity: number; location: string } | null
}

type SortField = 'item_name' | 'quantity' | 'category_large' | 'category_mid' | 'category_small'

// 자재명 단위 묶음 (같은 자재가 여러 박스에 나뉘어 있어도 한 줄로 표시)
type Group = {
  key: string; item_name: string; quantity: number
  category_large: string | null; category_mid: string | null; category_small: string | null
  boxes: Item[]; erpCodes: string[]
}
function groupItems(rows: Item[]): Group[] {
  const m = new Map<string, Group>()
  for (const r of rows) {
    let g = m.get(r.item_name)
    if (!g) {
      g = { key: r.item_name, item_name: r.item_name, quantity: 0,
        category_large: r.category_large, category_mid: r.category_mid, category_small: r.category_small,
        boxes: [], erpCodes: [] }
      m.set(r.item_name, g)
    }
    g.quantity += r.quantity ?? 0
    g.boxes.push(r)
    g.category_large ??= r.category_large; g.category_mid ??= r.category_mid; g.category_small ??= r.category_small
    if (r.erp_code && !g.erpCodes.includes(r.erp_code)) g.erpCodes.push(r.erp_code)
  }
  return [...m.values()]
}
function boxLoc(r: Item): string {
  return [r.rack_no, r.shelf, r.box_no].filter(Boolean).join(' / ') || '위치 미지정'
}

// ── 유틸 ─────────────────────────────────────────────────────────────────────
function tsKst(ts: string) {
  if (!ts) return ''
  try {
    return new Date(new Date(ts).getTime() + 9 * 3600 * 1000)
      .toISOString().slice(0, 16).replace('T', ' ')
  } catch { return ts.slice(0, 10) }
}

const ACTION_KO: Record<string, string> = {
  in: '📥 입고', out: '📤 출고', transfer: '🚚 이동', edit: '✏️ 수정',
}
const TR_STATUS: Record<string, { label: string; color: string }> = {
  pending:   { label: '⏳ 대기중', color: '#96620A' },
  approved:  { label: '✅ 승인됨', color: '#0C7A57' },
  rejected:  { label: '❌ 거절됨', color: '#D60051' },
  cancelled: { label: '🚫 취소됨', color: '#757575' },
}

// ── KPI 카드 ─────────────────────────────────────────────────────────────────
function KpiCard({ koLabel, value, unit = '개', color, icon: Icon, active, onClick }: {
  koLabel: string; value: number; unit?: string; color: string
  icon: LucideIcon; active?: boolean; onClick?: () => void
}) {
  return (
    <div onClick={onClick}
      className={cn(
        'bg-white rounded-lg p-4 cursor-pointer transition-all',
        active ? 'border-2 shadow-sm' : 'border border-[#E3E1DE] hover:border-[#D9D9D9]'
      )}
      style={active ? { borderColor: color } : undefined}>
      <div className="flex items-start justify-between">
        <span className="text-[12.5px] font-semibold text-[#5A666F]">{koLabel}</span>
        <Icon size={18} strokeWidth={1.9} style={{ color }} />
      </div>
      <div className="flex items-baseline gap-1 mt-3">
        <span data-guest-blur className="text-[28px] font-bold leading-none font-heading" style={{ color }}>{value.toLocaleString()}</span>
        <span className="text-[12px] text-[#8A949C]">{unit}</span>
      </div>
    </div>
  )
}

// ── 자재 상세 모달 ────────────────────────────────────────────────────────────
function ItemDetailModal({
  item, user, center, onClose, onUpdated,
}: {
  item: Item; user: SessionUser; center: string; onClose: () => void; onUpdated: () => void
}) {
  const [history,  setHistory]  = useState<HistoryRow[]>([])
  const [histLoad, setHistLoad] = useState(true)
  const [tab,      setTab]      = useState<'history' | 'edit' | 'transfer'>('history')

  // 이동 신청 폼
  const [trDest,   setTrDest]   = useState('')
  const [trQty,    setTrQty]    = useState(1)
  const [trSaving, setTrSaving] = useState(false)
  const [trMsg,    setTrMsg]    = useState('')

  // 수정 폼 (admin)
  const [editData, setEditData] = useState<Record<string, string | number>>({
    item_name: item.item_name, quantity: item.quantity,
    rack_no: item.rack_no ?? '', shelf: item.shelf ?? '', box_no: item.box_no ?? '',
    category_large: item.category_large ?? '', category_mid: item.category_mid ?? '',
    category_small: item.category_small ?? '', erp_code: item.erp_code ?? '',
    erp_name: item.erp_name ?? '', notes: item.notes ?? '',
    repair_manager: (item as Record<string, unknown>).repair_manager as string ?? '',
    location: item.location,
  })
  const [editSaving,  setEditSaving]  = useState(false)
  const [editMsg,     setEditMsg]     = useState('')
  const [delConfirm,  setDelConfirm]  = useState(false)
  const [delSaving,   setDelSaving]   = useState(false)

  const isAdmin     = user.role === 'admin'
  // 자재 정보 수정: 관리자 / 자재센터 직원(자재파트 포함, guest 제외) — /api/warehouse/item PATCH·자재창고지도와 동일 기준
  const userCenter   = user.assigned_center ?? user.center
  const canEditItem  = isAdmin || (userCenter === '자재센터' && user.role !== 'guest')
  const canTransfer = ['admin', 'manager', 'user'].includes(user.role) ||
                      (user.role === 'materials' && center === '자재센터')

  const REGIONAL = new Set(BUS_CENTERS)
  const allCenters: string[] = CENTERS.filter(c => !NO_WAREHOUSE.has(c))
  const SPECIAL  = new Set(allCenters.filter(c => c !== '자재센터' && !REGIONAL.has(c)))

  const destinations = useMemo(() => {
    if (center === '자재센터') return allCenters.filter(c => c !== '자재센터')
    if (REGIONAL.has(center)) return allCenters.filter(c => c === '자재센터' || (REGIONAL.has(c) && c !== center))
    if (SPECIAL.has(center)) return ['자재센터']
    return []
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center])

  useEffect(() => {
    fetch(`/api/warehouse/item?item_id=${item.id}`)
      .then(r => r.json())
      .then(j => setHistory(j.data ?? []))
      .finally(() => setHistLoad(false))
  }, [item.id])

  const handleTransfer = async () => {
    if (!trDest || trQty < 1) return
    setTrSaving(true); setTrMsg('')
    try {
      const res = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: item.id, from_center: center, to_center: trDest, quantity: trQty }),
      })
      const j = await res.json()
      if (!res.ok) setTrMsg(`❌ ${j.error}`)
      else { setTrMsg('✅ 이동 신청 완료'); onUpdated() }
    } finally { setTrSaving(false) }
  }

  const handleEdit = async () => {
    setEditSaving(true); setEditMsg('')
    try {
      const res = await fetch('/api/warehouse/item', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, ...editData }),
      })
      const j = await res.json()
      if (!res.ok) setEditMsg(`❌ ${j.error}`)
      else { setEditMsg('✅ 저장 완료'); onUpdated() }
    } finally { setEditSaving(false) }
  }

  const handleDelete = async () => {
    setDelSaving(true)
    try {
      const res = await fetch('/api/admin/warehouse', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      })
      const j = await res.json()
      if (!res.ok) { setEditMsg(`❌ ${j.error}`); return }
      onUpdated(); onClose()
    } finally { setDelSaving(false) }
  }

  const modalTabs = ['history', ...(canTransfer ? ['transfer'] : []), ...(canEditItem ? ['edit'] : [])]
  const tabLabel = (t: string) => ({ history: '📋 이력', transfer: '🚚 이동 신청', edit: '✏️ 수정' }[t] ?? t)

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3 border-b bg-[#F6F6F7]">
          <div>
            <div className="text-[15px] font-bold text-[#111111]">{item.item_name}</div>
            <div className="text-[11px] text-[#5A666F]">
              {[item.category_large, item.category_mid, item.category_small].filter(Boolean).join(' > ')}
              {item.erp_code && ` · ERP: ${item.erp_code}`}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[20px] font-bold"
              style={{ color: item.quantity === 0 ? '#D60051' : item.quantity <= 9 ? '#96620A' : '#0C7A57' }}>
              {item.quantity.toLocaleString()}개
            </span>
            <button onClick={onClose} className="text-[#8A949C] hover:text-[#111111] text-xl leading-none">×</button>
          </div>
        </div>

        {/* 탭 */}
        <div className="flex border-b text-[12px]">
          {modalTabs.map(t => (
            <button key={t} onClick={() => setTab(t as typeof tab)}
              className={`px-4 py-2 font-medium border-b-2 transition-colors ${tab === t ? 'border-[#D60051] text-[#D60051]' : 'border-transparent text-[#5A666F] hover:text-[#111111]'}`}>
              {tabLabel(t)}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 p-4">
          {/* 이력 */}
          {tab === 'history' && (
            histLoad ? <p className="text-gray-400 text-sm text-center py-8">로딩 중...</p> :
            history.length === 0 ? <p className="text-gray-400 text-sm text-center py-8">이력이 없습니다.</p> :
            <table className="w-full text-[11px]">
              <thead className="bg-[#F6F6F7] sticky top-0">
                <tr>
                  {['일시','구분','수량','변동','담당자','사유'].map(h => (
                    <th key={h} className="px-2 py-1.5 text-left text-[#5A666F] font-semibold border-b">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={h.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-2 py-1 text-[#8A949C] whitespace-nowrap">{tsKst(h.acted_at)}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{ACTION_KO[h.action_type] ?? h.action_type}</td>
                    <td className="px-2 py-1 text-right font-mono font-bold">{h.quantity}</td>
                    <td className="px-2 py-1 text-[#5A666F] whitespace-nowrap">{h.snapshot_qty_before} → {h.snapshot_qty_after}</td>
                    <td className="px-2 py-1 text-[#5A666F]">{h.actor?.name ?? '-'}</td>
                    <td className="px-2 py-1 text-[#8A949C] max-w-[150px] truncate">{h.reason ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 이동 신청 */}
          {tab === 'transfer' && (
            <div className="space-y-4 max-w-sm">
              <div>
                <label className="text-[11px] font-semibold text-[#5A666F] block mb-1">출발 센터</label>
                <input value={center} disabled className="w-full border rounded px-3 py-1.5 text-[12px] bg-gray-50 text-[#8A949C]" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[#5A666F] block mb-1">도착 센터 *</label>
                <select value={trDest} onChange={e => setTrDest(e.target.value)}
                  className="w-full border rounded px-3 py-1.5 text-[12px] focus:outline-none focus:border-[#D60051]">
                  <option value="">선택하세요</option>
                  {destinations.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[#5A666F] block mb-1">수량 * (현재 {item.quantity}개)</label>
                <input type="number" min={1} max={item.quantity} value={trQty}
                  onChange={e => setTrQty(Math.min(item.quantity, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="w-full border rounded px-3 py-1.5 text-[12px] focus:outline-none focus:border-[#D60051]" />
              </div>
              {trMsg && <p className="text-[12px]">{trMsg}</p>}
              <Button onClick={handleTransfer} disabled={trSaving || !trDest}
                className="w-full bg-[#D60051] hover:bg-[#A3003D] text-white">
                {trSaving ? '신청 중...' : '🚚 이동 신청'}
              </Button>
            </div>
          )}

          {/* 수정 (관리자 / 자재센터 직원) */}
          {tab === 'edit' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {([
                  ['item_name','자재명'], ['quantity','수량'],
                  ['rack_no','랙번호'], ['shelf','단'], ['box_no','박스번호'],
                  ['category_large','대분류'], ['category_mid','중분류'], ['category_small','소분류'],
                  ['erp_code','ERP코드'], ['erp_name','ERP품명'], ['repair_manager','수리담당자'],
                ] as [string, string][]).map(([key, label]) => (
                  <div key={key}>
                    <label className="text-[11px] font-semibold text-[#5A666F] block mb-1">{label}</label>
                    <input value={String(editData[key] ?? '')} type={key === 'quantity' ? 'number' : 'text'}
                      onChange={e => setEditData(p => ({ ...p, [key]: key === 'quantity' ? parseInt(e.target.value) || 0 : e.target.value }))}
                      className="w-full border rounded px-2 py-1 text-[12px] focus:outline-none focus:border-[#D60051]" />
                  </div>
                ))}
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[#5A666F] block mb-1">센터 (위치 변경)</label>
                <select value={String(editData.location ?? item.location)}
                  onChange={e => setEditData(p => ({ ...p, location: e.target.value }))}
                  className="w-full border rounded px-2 py-1 text-[12px] focus:outline-none focus:border-[#D60051] bg-white">
                  {CENTERS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[#5A666F] block mb-1">비고</label>
                <textarea value={String(editData.notes ?? '')} rows={2}
                  onChange={e => setEditData(p => ({ ...p, notes: e.target.value }))}
                  className="w-full border rounded px-2 py-1 text-[12px] focus:outline-none focus:border-[#D60051] resize-none" />
              </div>
              {editMsg && <p className="text-[12px]">{editMsg}</p>}
              <div className="flex items-center gap-3 flex-wrap">
                <Button onClick={handleEdit} disabled={editSaving} className="bg-[#D60051] hover:bg-[#A3003D] text-white">
                  {editSaving ? '저장 중...' : '💾 저장'}
                </Button>
                <div className="ml-auto">
                  {!isAdmin ? null : !delConfirm ? (
                    <Button variant="outline" onClick={() => setDelConfirm(true)}
                      className="text-red-500 border-red-200 text-[12px]">
                      🗑️ 삭제
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-red-500">정말 삭제?</span>
                      <Button onClick={handleDelete} disabled={delSaving}
                        className="bg-red-600 hover:bg-red-700 text-white text-[11px] h-7 px-2">
                        {delSaving ? '...' : '확인'}
                      </Button>
                      <Button variant="outline" onClick={() => setDelConfirm(false)}
                        className="text-[11px] h-7 px-2">
                        취소
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 단말기 박스 — 자재창고 지도와 동일한 데이터(box_terminals) 공유 */}
          {item.category_mid === '단말기' && (
            <div className="mt-4">
              <TerminalBoxSection
                item={item}
                canEdit={canEditItem}
                location={item.location}
                onChanged={onUpdated}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 이동 신청 도착 센터 규칙 ──────────────────────────────────────────────────
const TR_REGIONAL = new Set(BUS_CENTERS)
const TR_ALL_CENTERS: string[] = CENTERS.filter(c => !NO_WAREHOUSE.has(c))
const TR_SPECIAL = new Set(TR_ALL_CENTERS.filter(c => c !== '자재센터' && !TR_REGIONAL.has(c)))

// 자재 클릭 팝업: 위치별(박스별) 수량 · ERP코드 · 박스 상세로 이동
function ItemGroupModal({ group, isHub, onClose, onOpenBox }: {
  group: Group; isHub: boolean; onClose: () => void; onOpenBox: (item: Item) => void
}) {
  const boxes = [...group.boxes].sort((a, b) => boxLoc(a).localeCompare(boxLoc(b), 'ko'))
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-[640px] max-w-full max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-4 py-3 border-b border-[#E3E1DE]">
          <div className="min-w-0">
            <div className="text-[14px] font-bold text-[#111111] truncate">{group.item_name}</div>
            <div className="text-[11px] text-[#5A666F] mt-0.5">
              {[group.category_large, group.category_mid, group.category_small].filter(Boolean).join(' > ') || '분류 없음'}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0 ml-3">
            <div className="text-right">
              <div className="text-[10px] text-[#8A949C]">전체 수량</div>
              <div className="text-[18px] font-bold font-mono text-[#D60051] leading-tight">{group.quantity.toLocaleString()}</div>
            </div>
            <button onClick={onClose} className="text-[#8A949C] hover:text-[#111111] text-lg leading-none">×</button>
          </div>
        </div>
        <div className="p-4 overflow-y-auto">
          <div className="text-[11px] text-[#5A666F] mb-2">{isHub ? '박스별 보관 현황' : '보관 현황'} · {boxes.length}건 — 행을 클릭하면 이력·수정·이동 상세가 열립니다.</div>
          <div className="rounded border border-[#E3E1DE] overflow-hidden">
            <table className="w-full text-[12px]">
              <thead className="bg-[#F6F6F7]">
                <tr>
                  {[isHub ? '렉 / 단 / 박스' : '위치', '수량', 'ERP코드', 'ERP품명', ''].map((h, i) => (
                    <th key={i} className={`px-3 py-1.5 text-[11px] font-semibold text-[#5A666F] border-b ${h === '수량' ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {boxes.map((b, i) => (
                  <tr key={b.id} onClick={() => onOpenBox(b)}
                    className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 cursor-pointer`}>
                    <td data-guest-clear className="px-3 py-1.5 font-mono text-[11px] text-[#111111] whitespace-nowrap">{isHub ? boxLoc(b) : (b.location ?? '')}</td>
                    <td className={`px-3 py-1.5 text-right font-mono ${(b.quantity ?? 0) === 0 ? 'text-red-500 font-bold' : (b.quantity ?? 0) <= 9 ? 'text-amber-500 font-semibold' : 'text-[#111111]'}`}>
                      {(b.quantity ?? 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-[#2F3941]">{b.erp_code ?? ''}</td>
                    <td className="px-3 py-1.5 text-[11px] text-[#5A666F] truncate max-w-[180px]">{b.erp_name ?? ''}</td>
                    <td className="px-3 py-1.5 text-right text-[11px] text-[#D60051] whitespace-nowrap">상세 ›</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function transferDestinations(center: string): string[] {
  if (center === '자재센터') return TR_ALL_CENTERS.filter(c => c !== '자재센터')
  if (TR_REGIONAL.has(center)) return TR_ALL_CENTERS.filter(c => c === '자재센터' || (TR_REGIONAL.has(c) && c !== center))
  if (TR_SPECIAL.has(center)) return ['자재센터']
  return []
}

// ── 자재 추가 모달 ────────────────────────────────────────────────────────────
// 권한: admin / 자재센터 인원(guest 제외). location·랙 정보를 함께 저장하면
// 자재창고지도(/rack-map)에 자동 연동된다.
function AddItemModal({ defaultCenter, onClose, onAdded }: {
  defaultCenter: string; onClose: () => void; onAdded: () => void
}) {
  const blank = {
    item_name: '', quantity: '0', location: defaultCenter || '자재센터',
    rack_no: '', shelf: '', box_no: '',
    category_large: '', category_mid: '', category_small: '',
    erp_name: '', erp_code: '', notes: '',
  }
  const [form,   setForm]   = useState(blank)
  const [saving, setSaving] = useState(false)
  const [msg,    setMsg]    = useState('')
  const set = (k: keyof typeof blank) => (v: string) => setForm(f => ({ ...f, [k]: v }))

  async function submit() {
    if (!form.item_name.trim() || !form.location) { setMsg('품명과 센터는 필수입니다.'); return }
    setSaving(true); setMsg('')
    try {
      const res = await fetch('/api/warehouse/add', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, quantity: Number(form.quantity) || 0 }),
      })
      const d = await res.json()
      if (d.error) { setMsg(d.error); setSaving(false); return }
      onAdded()
      onClose()
    } catch { setMsg('오류 발생'); setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#E3E1DE]">
          <h3 className="text-[14px] font-bold text-[#111111]">자재 추가</h3>
          <button onClick={onClose} className="text-[#8A949C] hover:text-[#111111] text-lg leading-none">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-[#5A666F] mb-1 block">품명 *</label>
              <Input value={form.item_name} onChange={e => set('item_name')(e.target.value)}
                placeholder="품명 입력" className="h-8 text-[12px]" />
            </div>
            <div>
              <label className="text-[11px] text-[#5A666F] mb-1 block">수량 *</label>
              <Input type="number" min="0" value={form.quantity}
                onChange={e => set('quantity')(e.target.value)} className="h-8 text-[12px]" />
            </div>
            <div>
              <label className="text-[11px] text-[#5A666F] mb-1 block">센터 *</label>
              <Select value={form.location} onValueChange={v => v !== null && set('location')(v)}>
                <SelectTrigger className="h-8 text-[12px]"><SelectValue placeholder="센터 선택" /></SelectTrigger>
                <SelectContent>
                  {CENTERS.map(c => <SelectItem key={c} value={c} className="text-[12px]">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] text-[#5A666F] mb-1 block">랙 번호</label>
              <Input value={form.rack_no} onChange={e => set('rack_no')(e.target.value)}
                placeholder="예: A-01" className="h-8 text-[12px]" />
            </div>
            <div>
              <label className="text-[11px] text-[#5A666F] mb-1 block">선반</label>
              <Input value={form.shelf} onChange={e => set('shelf')(e.target.value)} className="h-8 text-[12px]" />
            </div>
            <div>
              <label className="text-[11px] text-[#5A666F] mb-1 block">박스 번호</label>
              <Input value={form.box_no} onChange={e => set('box_no')(e.target.value)} className="h-8 text-[12px]" />
            </div>
            <div>
              <label className="text-[11px] text-[#5A666F] mb-1 block">대분류</label>
              <Input value={form.category_large} onChange={e => set('category_large')(e.target.value)} className="h-8 text-[12px]" />
            </div>
            <div>
              <label className="text-[11px] text-[#5A666F] mb-1 block">중분류</label>
              <Input value={form.category_mid} onChange={e => set('category_mid')(e.target.value)} className="h-8 text-[12px]" />
            </div>
            <div>
              <label className="text-[11px] text-[#5A666F] mb-1 block">소분류</label>
              <Input value={form.category_small} onChange={e => set('category_small')(e.target.value)} className="h-8 text-[12px]" />
            </div>
            <div>
              <label className="text-[11px] text-[#5A666F] mb-1 block">ERP 품명</label>
              <Input value={form.erp_name} onChange={e => set('erp_name')(e.target.value)} className="h-8 text-[12px]" />
            </div>
            <div>
              <label className="text-[11px] text-[#5A666F] mb-1 block">ERP 코드</label>
              <Input value={form.erp_code} onChange={e => set('erp_code')(e.target.value)} className="h-8 text-[12px]" />
            </div>
            <div>
              <label className="text-[11px] text-[#5A666F] mb-1 block">비고</label>
              <Input value={form.notes} onChange={e => set('notes')(e.target.value)} className="h-8 text-[12px]" />
            </div>
          </div>

          <p className="text-[11px] text-[#8A949C]">
            💡 센터를 <b>자재센터</b>로, 랙 번호를 입력하면 자재창고지도에 함께 표시됩니다.
          </p>
          {msg && (
            <p className={`text-[12px] ${msg.includes('완료') || msg.includes('추가') ? 'text-green-600' : 'text-red-500'}`}>{msg}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" className="text-[12px] h-8" onClick={onClose}>취소</Button>
            <Button onClick={submit} disabled={saving}
              className="bg-[#D60051] hover:bg-[#A3003D] text-white text-[12px] h-8">
              {saving ? '추가 중...' : '자재 추가'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 재고 현황 탭 ──────────────────────────────────────────────────────────────
function InventoryTab({ user, center, onCenterChange }: {
  user: SessionUser; center: string; onCenterChange: (c: string) => void
}) {
  const viewable = getViewableCenters(user.role, user.assigned_center ?? user.center)
  const isHub    = center === '자재센터'
  const isBrowse = user.id === GUEST_VIEWER.id // 둘러보기: 버튼을 보여주고 안내(클릭은 로그인 팝업)
  const canStock = user.role === 'admin' || user.role === 'materials'   // 입고/출고
  const canAct   = user.role === 'manager' || user.role === 'user'      // 이동신청/사용내역입력
  const canSelect = canStock || canAct
  // 자재 추가: admin 또는 자재센터 인원 전체(guest 제외)
  const userCenter = user.assigned_center ?? user.center
  const canAddItem = user.role === 'admin' || (userCenter === '자재센터' && user.role !== 'guest') || isBrowse
  const [showAdd, setShowAdd] = useState(false)

  const [data,    setData]    = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const [filterLarge, setFilterLarge] = useState('전체')
  const [filterMid,   setFilterMid]   = useState('전체')
  const [filterSmall, setFilterSmall] = useState('전체')
  const searchParams = useSearchParams()
  const [search,      setSearch]      = useState(() => searchParams.get('q') ?? '')
  const [kpiFilter,   setKpiFilter]   = useState<'all'|'low'|'zero'>('all')

  const [page,     setPage]     = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [sortField, setSortField] = useState<SortField>('item_name')
  const [sortDir,   setSortDir]   = useState<'asc'|'desc'>('asc')

  const [selected,    setSelected]    = useState<Set<number>>(new Set())
  const [actionMode,  setActionMode]  = useState<'in'|'out'|'use'|'transfer'|null>(null)
  const [stockQties,  setStockQties]  = useState<Record<number, number>>({})
  const [stockReason, setStockReason] = useState('')
  const [actDest,     setActDest]     = useState('')
  const [stockSaving, setStockSaving] = useState(false)
  const [stockMsg,    setStockMsg]    = useState('')
  // 처리 완료 메시지는 액션 패널이 닫힌 뒤 표 위에 잠시 남긴다
  useEffect(() => {
    if (!stockMsg || actionMode) return
    const t = setTimeout(() => setStockMsg(''), 4000)
    return () => clearTimeout(t)
  }, [stockMsg, actionMode])

  const [detailItem, setDetailItem] = useState<Item | null>(null)
  const [groupItem,  setGroupItem]  = useState<Group | null>(null)

  const fetchData = useCallback(async (c: string) => {
    setLoading(true); setError('')
    try {
      const res  = await fetch(`/api/warehouse?center=${encodeURIComponent(c)}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setData(json.data)
    } catch (e: unknown) {
      setError((e as Error).message || '데이터를 불러오지 못했습니다.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchData(center)
    setFilterLarge('전체'); setFilterMid('전체'); setFilterSmall('전체')
    setSearch(''); setKpiFilter('all'); setPage(1); setSelected(new Set())
  }, [center, fetchData])

  const groups = useMemo(() => groupItems(data), [data])
  const largeList = useMemo(() => ['전체', ...Array.from(new Set(data.map(r => r.category_large).filter(Boolean) as string[])).sort()], [data])
  const midList   = useMemo(() => {
    const src = filterLarge === '전체' ? data : data.filter(r => r.category_large === filterLarge)
    return ['전체', ...Array.from(new Set(src.map(r => r.category_mid).filter(Boolean) as string[])).sort()]
  }, [data, filterLarge])
  const smallList = useMemo(() => {
    const src = data.filter(r => (filterLarge === '전체' || r.category_large === filterLarge) && (filterMid === '전체' || r.category_mid === filterMid))
    return ['전체', ...Array.from(new Set(src.map(r => r.category_small).filter(Boolean) as string[])).sort()]
  }, [data, filterLarge, filterMid])

  const kpi = useMemo(() => ({
    all:  groups.length,
    low:  groups.filter(r => r.quantity >= 1 && r.quantity <= 9).length,
    zero: groups.filter(r => r.quantity === 0).length,
  }), [groups])

  const filtered = useMemo(() => {
    let rows = groups
    if (filterLarge !== '전체') rows = rows.filter(r => r.category_large === filterLarge)
    if (filterMid   !== '전체') rows = rows.filter(r => r.category_mid   === filterMid)
    if (filterSmall !== '전체') rows = rows.filter(r => r.category_small === filterSmall)
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(r =>
        r.item_name.toLowerCase().includes(q) ||
        r.erpCodes.some(c => c.toLowerCase().includes(q)) ||
        (r.category_large ?? '').toLowerCase().includes(q) ||
        (r.category_mid ?? '').toLowerCase().includes(q)
      )
    }
    if (kpiFilter === 'low')  rows = rows.filter(r => r.quantity >= 1 && r.quantity <= 9)
    if (kpiFilter === 'zero') rows = rows.filter(r => r.quantity === 0)
    return rows
  }, [groups, filterLarge, filterMid, filterSmall, search, kpiFilter])

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    if (sortField === 'quantity') return sortDir === 'asc' ? a.quantity - b.quantity : b.quantity - a.quantity
    const av = String(a[sortField] ?? ''); const bv = String(b[sortField] ?? '')
    return sortDir === 'asc' ? av.localeCompare(bv, 'ko') : bv.localeCompare(av, 'ko')
  }), [filtered, sortField, sortDir])

  const totalPages  = Math.max(1, Math.ceil(sorted.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paged       = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const pagedIds    = paged.flatMap(g => g.boxes.map(b => b.id))

  function handleSort(f: SortField) {
    if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(f); setSortDir('asc') }
  }

  function SortIcon({ field }: { field: string }) {
    if (sortField !== field) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="ml-1" style={{ color: '#D60051' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  function qtyColor(q: number) {
    if (q === 0) return 'text-red-500 font-bold'
    if (q <= 9)  return 'text-amber-500 font-semibold'
    return 'text-[#111111]'
  }

  const qtyOf = (id: number) => stockQties[id] ?? 1
  // 수량 0 = 이 박스에서는 빼지 않음 (같은 자재가 여러 박스에 있을 때) → 처리 대상에서 제외
  const actItems = useMemo(() => data.filter(r => selected.has(r.id) && (stockQties[r.id] ?? 1) > 0), [data, selected, stockQties])

  function openAction(mode: 'in'|'out'|'use'|'transfer') {
    setActionMode(mode); setStockMsg(''); setStockReason(''); setActDest(''); setStockQties({})
  }
  function resetAction() {
    setSelected(new Set()); setActionMode(null); setStockReason(''); setActDest(''); setStockQties({})
  }

  async function handleAction() {
    if (!actionMode || !selected.size) return
    const ids = actItems.map(r => r.id)
    if (!ids.length) return
    setStockSaving(true); setStockMsg('')
    try {
      // ── 입고 / 출고 (자재센터·관리자) ──
      if (actionMode === 'in' || actionMode === 'out') {
        if (!stockReason.trim()) { setStockSaving(false); return }
        const items = ids.map(id => ({ item_id: id, quantity: qtyOf(id) }))
        const res = await fetch('/api/warehouse/stock', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items, action: actionMode, reason: stockReason }),
        })
        const j = await res.json()
        if (!res.ok) setStockMsg(`❌ ${j.error}`)
        else { setStockMsg(j.errors?.length ? `⚠️ 일부 실패: ${j.errors.join(', ')}` : '✅ 완료'); resetAction(); fetchData(center) }
      }
      // ── 사용내역 입력 (재고 차감) ──
      else if (actionMode === 'use') {
        if (!stockReason.trim()) { setStockSaving(false); return }
        const rows = actItems.map(it => ({
          item_id: it.id, item_name: it.item_name, erp_code: it.erp_code ?? undefined,
          quantity: qtyOf(it.id), reason: stockReason,
        }))
        const res = await fetch('/api/usage', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows }),
        })
        const j = await res.json()
        if (!res.ok) setStockMsg(`❌ ${j.error}`)
        else {
          const fails = (j.results ?? []).filter((r: { ok: boolean }) => !r.ok)
          setStockMsg(fails.length ? `⚠️ 일부 실패: ${fails.map((f: { error: string }) => f.error).join(', ')}` : '✅ 사용 처리 완료')
          if (fails.length < rows.length) { resetAction(); fetchData(center) }
        }
      }
      // ── 이동 신청 (건별) ──
      else if (actionMode === 'transfer') {
        if (!actDest) { setStockSaving(false); return }
        const errs: string[] = []
        for (const it of actItems) {
          const res = await fetch('/api/transfers', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item_id: it.id, from_center: center, to_center: actDest, quantity: qtyOf(it.id) }),
          })
          if (!res.ok) { const j = await res.json(); errs.push(`${it.item_name}: ${j.error}`) }
        }
        setStockMsg(errs.length ? `⚠️ 일부 실패: ${errs.join(', ')}` : '✅ 이동 신청 완료')
        if (errs.length < actItems.length) { resetAction(); fetchData(center) }
      }
    } finally { setStockSaving(false) }
  }

  return (
    <div className="space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Select value={center} onValueChange={v => v !== null && onCenterChange(v)}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>{viewable.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" onClick={() => fetchData(center)} disabled={loading} className="text-[12px]">
            {loading ? '...' : '🔄'}
          </Button>
          {canAddItem && (
            <Button onClick={() => setShowAdd(true)}
              className="bg-[#D60051] hover:bg-[#A3003D] text-white text-[12px]">
              자재 추가
            </Button>
          )}
          <GuestCallout label="품명·분류·위치 입력해 새 자재 등록" />
        </div>
        {selected.size > 0 && (
          <div className="flex gap-2 flex-wrap">
            {canStock && (
              <>
                <Button size="sm" className="bg-[#0C7A57] hover:bg-[#0C7A57] text-white"
                  onClick={() => openAction('in')}>📥 입고 ({selected.size})</Button>
                <Button size="sm" className="bg-[#D60051] hover:bg-[#A3003D] text-white"
                  onClick={() => openAction('out')}>📤 출고 ({selected.size})</Button>
              </>
            )}
            {canAct && (
              <>
                <Button size="sm" className="bg-[#D60051] hover:bg-[#A3003D] text-white"
                  onClick={() => openAction('use')}>🧾 사용내역 입력 ({selected.size})</Button>
                <Button size="sm" className="bg-[#2F3941] hover:bg-[#1C2126] text-white"
                  onClick={() => openAction('transfer')}>🚚 이동신청 ({selected.size})</Button>
              </>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 p-2 rounded">{error}</p>}

      {/* KPI */}
      {!loading && data.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <KpiCard koLabel="전체 품목" value={kpi.all} color="#2F3941" icon={ClipboardCheck}
            active={kpiFilter === 'all'} onClick={() => { setKpiFilter('all'); setPage(1) }} />
          <KpiCard koLabel="재고 부족 (1~9개)" value={kpi.low} color="#96620A" icon={TriangleAlert}
            active={kpiFilter === 'low'} onClick={() => { setKpiFilter(kpiFilter === 'low' ? 'all' : 'low'); setPage(1) }} />
          <KpiCard koLabel="재고 없음" value={kpi.zero} color="#D60051" icon={PackageX}
            active={kpiFilter === 'zero'} onClick={() => { setKpiFilter(kpiFilter === 'zero' ? 'all' : 'zero'); setPage(1) }} />
        </div>
      )}

      {/* 필터 */}
      <div className="bg-white rounded-lg border border-[#E3E1DE] p-3 flex flex-wrap gap-2 items-center">
        <Input className="w-[200px] h-8 text-[12px]" placeholder="자재명 / ERP코드 / 분류명..."
          value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        <Select value={filterLarge} onValueChange={v => { if (v !== null) { setFilterLarge(v); setFilterMid('전체'); setFilterSmall('전체'); setPage(1) } }}>
          <SelectTrigger className="w-[130px] h-8 text-[12px]"><SelectValue placeholder="대분류" /></SelectTrigger>
          <SelectContent>{largeList.map(c => <SelectItem key={c} value={c}>{c === '전체' ? '대분류 전체' : c}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filterMid} onValueChange={v => { if (v !== null) { setFilterMid(v); setFilterSmall('전체'); setPage(1) } }}>
          <SelectTrigger className="w-[130px] h-8 text-[12px]"><SelectValue placeholder="중분류" /></SelectTrigger>
          <SelectContent>{midList.map(c => <SelectItem key={c} value={c}>{c === '전체' ? '중분류 전체' : c}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filterSmall} onValueChange={v => { if (v !== null) { setFilterSmall(v); setPage(1) } }}>
          <SelectTrigger className="w-[130px] h-8 text-[12px]"><SelectValue placeholder="소분류" /></SelectTrigger>
          <SelectContent>{smallList.map(c => <SelectItem key={c} value={c}>{c === '전체' ? '소분류 전체' : c}</SelectItem>)}</SelectContent>
        </Select>
        {(filterLarge !== '전체' || filterMid !== '전체' || filterSmall !== '전체' || search || kpiFilter !== 'all') && (
          <Button variant="ghost" className="text-[#D60051] text-[12px] h-8"
            onClick={() => { setFilterLarge('전체'); setFilterMid('전체'); setFilterSmall('전체'); setSearch(''); setKpiFilter('all'); setPage(1) }}>
            ✕ 초기화
          </Button>
        )}
      </div>

      {stockMsg && !actionMode && (
        <p className="text-[12.5px] font-semibold text-[#0C7A57] bg-[#EEF7F2] border border-[#CBE7D8] rounded px-3 py-2">{stockMsg}</p>
      )}

      {/* 액션 패널 (입고/출고/사용/이동신청) */}
      {actionMode && selected.size > 0 && (() => {
        const META = {
          in:       { title: '📥 입고',        btn: '✅ 입고 확정',   color: 'bg-[#0C7A57] hover:bg-[#0C7A57] text-white' },
          out:      { title: '📤 출고',        btn: '✅ 출고 확정',   color: 'bg-[#D60051] hover:bg-[#A3003D] text-white' },
          use:      { title: '🧾 사용내역 입력', btn: '✅ 사용 확정',   color: 'bg-[#D60051] hover:bg-[#A3003D] text-white' },
          transfer: { title: '🚚 이동 신청',    btn: '🚚 이동 신청',   color: 'bg-[#2F3941] hover:bg-[#1C2126] text-white' },
        }[actionMode]
        const needReason = actionMode !== 'transfer'
        const dests = transferDestinations(center)
        const disabled = stockSaving || !actItems.length || (needReason ? !stockReason.trim() : !actDest)
        return (
          <div className="border rounded-lg p-4 bg-[#FFF8F0] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold">{META.title} — {selected.size}개 자재</span>
              <button onClick={resetAction} className="text-[#8A949C] hover:text-red-400">✕</button>
            </div>

            {actionMode === 'transfer' && (
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-[#5A666F] block mb-1">출발 센터</label>
                  <input value={center} disabled className="border rounded px-3 py-1.5 text-[12px] bg-gray-50 text-[#8A949C] w-40" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[#5A666F] block mb-1">도착 센터 *</label>
                  <select value={actDest} onChange={e => setActDest(e.target.value)}
                    className="border rounded px-3 py-1.5 text-[12px] w-40 focus:outline-none focus:border-[#D60051] bg-white">
                    <option value="">선택하세요</option>
                    {dests.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
            )}

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {data.filter(r => selected.has(r.id)).map(r => (
                <div key={r.id} className={`flex items-center gap-2 ${qtyOf(r.id) === 0 ? 'opacity-50' : ''}`}>
                  <span className="text-[12px] flex-1 truncate">
                    {r.item_name}
                    {isHub && <span className="text-[#8A949C] font-mono text-[10px] ml-1.5">{boxLoc(r)}</span>}
                  </span>
                  <span className="text-[11px] text-[#8A949C]">현재 {r.quantity}개</span>
                  <input type="number" min={0} value={stockQties[r.id] ?? 1}
                    onChange={e => setStockQties(prev => ({ ...prev, [r.id]: Math.max(0, parseInt(e.target.value) || 0) }))}
                    title="0 입력 시 이 박스는 처리하지 않음"
                    className="w-20 border rounded px-2 py-0.5 text-[12px] text-right focus:outline-none bg-white" />
                </div>
              ))}
            </div>

            {needReason && (
              <div>
                <label className="text-[11px] font-semibold text-[#5A666F] block mb-1">사유 *</label>
                <input value={stockReason} onChange={e => setStockReason(e.target.value)}
                  placeholder={actionMode === 'use' ? '사용 사유' : '입출고 사유'}
                  className="w-full border rounded px-3 py-1.5 text-[12px] focus:outline-none focus:border-[#D60051] bg-white" />
              </div>
            )}

            {stockMsg && <p className="text-[12px]">{stockMsg}</p>}
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAction} disabled={disabled} className={META.color}>
                {stockSaving ? '처리 중...' : META.btn}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setActionMode(null); setStockMsg('') }}>취소</Button>
            </div>
          </div>
        )
      })()}

      {/* 테이블 카드 */}
      <div className="bg-white rounded-lg border border-[#E3E1DE] p-3 space-y-3">
      {/* 테이블 정보 */}
      <div className="flex items-center justify-between text-[12px] text-gray-500">
        <span><b className="text-[#111111]">{center}</b> — <span data-guest-blur>{sorted.length.toLocaleString()}</span>개 품목<GuestCallout label="행 선택 → 입고·출고·이동신청 처리" /></span>
        <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1) }}>
          <SelectTrigger className="w-[85px] h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{[20, 50, 100, 200].map(n => <SelectItem key={n} value={String(n)}>{n}개씩</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {/* 테이블 */}
      {loading ? (
        <div className="space-y-2 animate-pulse" aria-label="데이터 로딩 중">
          <div className="h-9 rounded bg-[#F1F1F0]" />
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-8 rounded bg-[#F6F6F7]" />)}
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-gray-400 border rounded">📭 해당 조건의 재고가 없습니다.</div>
      ) : (
        <div className="rounded-md overflow-auto max-h-[520px] border border-[#E3E1DE]">
          <table className="w-full text-[12px] border-collapse min-w-[720px]">
            <thead className="sticky top-0 bg-[#F6F6F7] z-10">
              <tr>
                {canSelect && (
                  <th className="px-2 py-2 border-b w-8">
                    <input type="checkbox" checked={pagedIds.length > 0 && pagedIds.every(id => selected.has(id))}
                      onChange={() => setSelected(pagedIds.every(id => selected.has(id)) ? new Set() : new Set(pagedIds))}
                      className="cursor-pointer" />
                  </th>
                )}
                {([
                  ['자재명', 'item_name'], ['수량', 'quantity'],
                  ['대분류', 'category_large'], ['중분류', 'category_mid'], ['소분류', 'category_small'],
                ] as [string, SortField][]).map(([label, field]) => (
                  <th key={field} onClick={() => handleSort(field)}
                    className="px-3 py-2 text-left text-[11px] font-semibold text-[#5A666F] border-b whitespace-nowrap cursor-pointer hover:text-[#D60051] select-none uppercase tracking-wide">
                    {label}<SortIcon field={field} />
                  </th>
                ))}
                {isHub && <th className="px-3 py-2 text-right text-[11px] font-semibold text-[#5A666F] border-b whitespace-nowrap">박스</th>}
              </tr>
            </thead>
            <tbody>
              {paged.map((g, i) => {
                const ids = g.boxes.map(b => b.id)
                const allSel = ids.every(id => selected.has(id))
                return (
                <tr key={g.key} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors`}>
                  {canSelect && (
                    <td className="px-2 py-1.5 text-center">
                      <input type="checkbox" checked={allSel}
                        onChange={() => setSelected(prev => { const n = new Set(prev); if (allSel) ids.forEach(id => n.delete(id)); else ids.forEach(id => n.add(id)); return n })}
                        className="cursor-pointer" />
                    </td>
                  )}
                  <td className="px-3 py-1.5 max-w-[260px] truncate">
                    <button onClick={() => setGroupItem(g)}
                      className="text-[#111111] font-medium hover:text-[#D60051] hover:underline text-left w-full truncate">
                      {g.item_name}
                    </button>
                  </td>
                  <td className={`px-3 py-1.5 text-right font-mono ${qtyColor(g.quantity)}`}>
                    {g.quantity.toLocaleString()}
                  </td>
                  <td data-guest-clear className="px-3 py-1.5 text-[#2F3941] whitespace-nowrap">{g.category_large ?? ''}</td>
                  <td data-guest-clear className="px-3 py-1.5 text-[#2F3941] whitespace-nowrap">{g.category_mid ?? ''}</td>
                  <td data-guest-clear className="px-3 py-1.5 text-[#2F3941] whitespace-nowrap">{g.category_small ?? ''}</td>
                  {isHub && (
                    <td data-guest-clear className="px-3 py-1.5 text-right text-[#5A666F] font-mono text-[11px] whitespace-nowrap">
                      {g.boxes.length}
                    </td>
                  )}
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage(1)}>처음</Button>
          <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage(p => p - 1)}>◀</Button>
          <span className="text-[12px] text-[#5A666F] px-1">{currentPage} / {totalPages} 페이지</span>
          <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setPage(p => p + 1)}>▶</Button>
          <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setPage(totalPages)}>끝</Button>
        </div>
      )}
      </div>

      {groupItem && !detailItem && (
        <ItemGroupModal group={groupItem} isHub={isHub}
          onClose={() => setGroupItem(null)}
          onOpenBox={item => setDetailItem(item)} />
      )}

      {detailItem && (
        <ItemDetailModal item={detailItem} user={user} center={center}
          onClose={() => setDetailItem(null)}
          onUpdated={() => { fetchData(center); setDetailItem(null); setGroupItem(null) }} />
      )}

      {showAdd && (
        <AddItemModal defaultCenter={center}
          onClose={() => setShowAdd(false)}
          onAdded={() => fetchData(center)} />
      )}
    </div>
  )
}

// ── 이동 신청 현황 탭 ─────────────────────────────────────────────────────────
function TransferTab({ user }: { user: SessionUser }) {
  const [data,    setData]    = useState<Transfer[]>([])
  const [loading, setLoading] = useState(true)
  const [acting,  setActing]  = useState<number | null>(null)

  const userCenter = user.assigned_center ?? user.center
  const role       = user.role

  const canApprove = useCallback((tr: Transfer) => {
    if (role === 'admin') return true
    if (role === 'materials') return tr.to_center === '자재센터' || tr.from_center === '자재센터'
    if (role === 'manager') return tr.to_center === userCenter
    return false
  }, [role, userCenter])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/transfers')
      const j   = await res.json()
      setData(j.data ?? [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleAction = async (id: number, action: 'approved' | 'rejected' | 'cancelled') => {
    setActing(id)
    try {
      await fetch('/api/transfers/action', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      })
      fetchData()
    } finally { setActing(null) }
  }

  const filterByStatus = (status: string | null) =>
    status ? data.filter(r => r.status === status) : data

  const pendingCount = data.filter(r => r.status === 'pending').length

  function TransferCard({ tr }: { tr: Transfer }) {
    const st = TR_STATUS[tr.status] ?? { label: tr.status, color: '#555' }
    const myRequest  = tr.requester?.id === user.id
    const approvable = canApprove(tr) && tr.status === 'pending'

    return (
      <div className="border rounded-lg p-4 bg-white space-y-2">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[13px] font-semibold text-[#111111]">
              {tr.warehouse?.item_name ?? '자재 정보 없음'}
            </div>
            <div className="text-[12px] text-[#5A666F] mt-0.5">
              신청자: {tr.requester?.name ?? '-'} · {tsKst(tr.requested_at)}
            </div>
          </div>
          <span className="text-[13px] font-bold flex-shrink-0 ml-2" style={{ color: st.color }}>{st.label}</span>
        </div>

        <div className="flex items-center gap-2 text-[12px]">
          <span className="bg-[#F6F6F7] border px-2 py-0.5 rounded text-[#2F3941]">{tr.from_center}</span>
          <span className="text-[#8A949C]">→</span>
          <span className="bg-[#F6F6F7] border px-2 py-0.5 rounded text-[#2F3941]">{tr.to_center}</span>
          <span className="ml-auto font-mono font-bold text-[#111111]">{tr.quantity}개</span>
        </div>

        {tr.status !== 'pending' && tr.approver?.name && (
          <div className="text-[11px] text-[#8A949C]">
            처리자: {tr.approver.name}{tr.processed_at && ` · ${tsKst(tr.processed_at)}`}
          </div>
        )}

        {tr.status === 'pending' && (
          <div className="flex gap-2 pt-1">
            {approvable && (
              <>
                <Button size="sm" className="bg-[#0C7A57] hover:bg-[#0C7A57] text-white"
                  disabled={acting === tr.id} onClick={() => handleAction(tr.id, 'approved')}>
                  ✅ 승인
                </Button>
                <Button size="sm" variant="outline" disabled={acting === tr.id}
                  onClick={() => handleAction(tr.id, 'rejected')}>
                  ❌ 거절
                </Button>
              </>
            )}
            {myRequest && (
              <Button size="sm" variant="outline" className="text-[#8A949C]"
                disabled={acting === tr.id} onClick={() => handleAction(tr.id, 'cancelled')}>
                🚫 취소
              </Button>
            )}
            {!approvable && !myRequest && (
              <span className="text-[11px] text-[#8A949C] self-center">🔒 승인 권한 없음</span>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-[#5A666F]">
          {role === 'manager' && `📌 ${userCenter} 관련 이동 내역 · ${userCenter}으로 들어오는 이동만 승인 가능`}
          {role === 'materials' && '📌 자재센터 관련 이동 내역'}
          {role === 'user' && '📌 본인이 신청한 이동 내역'}
        </p>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="text-[12px]">
          {loading ? '...' : '🔄'}
        </Button>
      </div>

      <Tabs defaultValue="pending">
        <TabsList className="flex-wrap h-auto">
          {[
            { key: 'pending',  label: `⏳ 대기중 (${pendingCount})` },
            { key: 'approved', label: '✅ 승인됨' },
            { key: 'rejected', label: '❌ 거절됨' },
            { key: 'all',      label: '📋 전체' },
          ].map(t => (
            <TabsTrigger key={t.key} value={t.key} className="text-[12px]">{t.label}</TabsTrigger>
          ))}
        </TabsList>
        {['pending','approved','rejected','all'].map(key => (
          <TabsContent key={key} value={key} className="space-y-2 mt-3">
            {loading ? (
              <p className="text-gray-400 text-sm text-center py-8">로딩 중...</p>
            ) : filterByStatus(key === 'all' ? null : key).length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">해당 신청 내역이 없습니다.</p>
            ) : filterByStatus(key === 'all' ? null : key).map(tr => (
              <TransferCard key={tr.id} tr={tr} />
            ))}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

// ── 재고 일괄 등록: 엑셀/CSV 파싱 (내보내기 CSV 포맷과 동일) ──────────────────
type BulkRow = {
  item_name: string; quantity: number; location: string
  rack_no: string; shelf: string; box_no: string
  category_large: string; category_mid: string; category_small: string
  erp_code: string; erp_name: string; notes: string
}

function parseWarehouseFile(buf: ArrayBuffer): BulkRow[] {
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return []
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
  if (aoa.length < 2) return []

  const header = (aoa[0] as unknown[]).map(h => String(h ?? '').trim())
  const col = (names: string[]) => {
    for (const n of names) { const i = header.findIndex(h => h === n); if (i !== -1) return i }
    return -1
  }
  const idx = {
    name:   col(['자재명', 'item_name', '품명']),
    qty:    col(['수량', 'quantity']),
    large:  col(['대분류', 'category_large']),
    mid:    col(['중분류', 'category_mid']),
    small:  col(['소분류', 'category_small']),
    rack:   col(['렉번호', '랙번호', 'rack_no']),
    shelf:  col(['단', 'shelf']),
    box:    col(['박스번호', 'box_no']),
    erpC:   col(['ERP코드', 'erp_code']),
    erpN:   col(['ERP품명', 'erp_name']),
    notes:  col(['비고', 'notes']),
    loc:    col(['센터', 'location']),
  }
  if (idx.name === -1) return []

  const cell = (cells: unknown[], i: number) => i >= 0 ? String(cells[i] ?? '').trim() : ''
  return (aoa.slice(1) as unknown[][]).map(cells => ({
    item_name:      cell(cells, idx.name),
    quantity:       idx.qty >= 0 ? (parseInt(String(cells[idx.qty] ?? '0')) || 0) : 0,
    category_large: cell(cells, idx.large),
    category_mid:   cell(cells, idx.mid),
    category_small: cell(cells, idx.small),
    rack_no:        cell(cells, idx.rack),
    shelf:          cell(cells, idx.shelf),
    box_no:         cell(cells, idx.box),
    erp_code:       cell(cells, idx.erpC),
    erp_name:       cell(cells, idx.erpN),
    notes:          cell(cells, idx.notes),
    location:       cell(cells, idx.loc),
  })).filter(r => r.item_name)
}

// ── 관리자 탭 ─────────────────────────────────────────────────────────────────
function AdminTab({ center, viewable, onChanged }: { center: string; viewable: string[]; onChanged: () => void }) {
  const [downloading,    setDownloading]    = useState(false)
  const [dlAllLoading,   setDlAllLoading]   = useState(false)

  // 센터 지정 삭제 (관리자 전용)
  const [delCenter,  setDelCenter]  = useState(center)
  const [delCount,   setDelCount]   = useState<number | null>(null)
  const [delConfirm, setDelConfirm] = useState(false)
  const [delSaving,  setDelSaving]  = useState(false)
  const [delMsg,     setDelMsg]     = useState('')

  // 선택 센터의 현재 재고 품목 수 조회
  useEffect(() => {
    let cancelled = false
    setDelCount(null); setDelConfirm(false); setDelMsg('')
    fetch(`/api/warehouse?center=${encodeURIComponent(delCenter)}`)
      .then(r => r.json())
      .then(j => { if (!cancelled) setDelCount((j.data ?? []).length) })
      .catch(() => { if (!cancelled) setDelCount(0) })
    return () => { cancelled = true }
  }, [delCenter])

  const handleDeleteCenter = async () => {
    setDelSaving(true); setDelMsg('')
    try {
      const res = await fetch('/api/admin/warehouse', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ center: delCenter }),
      })
      const j = await res.json()
      if (!res.ok) { setDelMsg(`❌ ${j.error}`); return }
      setDelMsg(`✅ ${delCenter} 재고 ${j.deleted ?? 0}건 삭제 완료`)
      setDelConfirm(false); setDelCount(0)
      onChanged()
    } finally { setDelSaving(false) }
  }

  // 재고 일괄 등록 (관리자 전용)
  const [upRows,    setUpRows]    = useState<BulkRow[]>([])
  const [upCenter,  setUpCenter]  = useState(center)   // 센터 칸이 빈 행에 적용할 기본 센터
  const [upSaving,  setUpSaving]  = useState(false)
  const [upMsg,     setUpMsg]     = useState('')
  const upFileRef = useRef<HTMLInputElement>(null)

  const handleUpFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUpRows([]); setUpMsg('')
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const parsed = parseWarehouseFile(ev.target?.result as ArrayBuffer)
        if (!parsed.length) { setUpMsg('❌ 올바른 양식이 아니거나, 자재명이 있는 행이 없습니다.'); return }
        setUpRows(parsed)
        setUpMsg(`📄 ${parsed.length}개 행 인식됨 — 내용 확인 후 등록하세요.`)
      } catch { setUpMsg('❌ 파일을 읽지 못했습니다.') }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleBulkRegister = async () => {
    if (!upRows.length) return
    setUpSaving(true); setUpMsg('')
    try {
      const res = await fetch('/api/admin/warehouse/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: upRows, defaultCenter: upCenter }),
      })
      const j = await res.json()
      if (!res.ok) {
        setUpMsg(`❌ ${j.error}${j.errors?.length ? ` (${j.errors.slice(0, 3).join(' / ')}${j.errors.length > 3 ? ' …' : ''})` : ''}`)
        return
      }
      const warn = j.errors?.length ? ` ⚠️ ${j.errors.length}행 건너뜀` : ''
      setUpMsg(`✅ ${j.inserted}건 등록 완료${warn}`)
      setUpRows([])
      if (upFileRef.current) upFileRef.current.value = ''
      onChanged()
    } finally { setUpSaving(false) }
  }

  const upNoCenter = useMemo(() => upRows.filter(r => !r.location).length, [upRows])

  const buildCsv = (rows: Item[]) => {
    const cols = ['자재명','수량','대분류','중분류','소분류','렉번호','단','박스번호','ERP코드','ERP품명','비고','센터']
    const body = rows.map(r =>
      [r.item_name, r.quantity, r.category_large ?? '', r.category_mid ?? '', r.category_small ?? '',
       r.rack_no ?? '', r.shelf ?? '', r.box_no ?? '', r.erp_code ?? '', r.erp_name ?? '', r.notes ?? '', r.location]
      .map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    ).join('\n')
    return '﻿' + cols.join(',') + '\n' + body
  }

  const downloadCsv = (csv: string, filename: string) => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  const handleExport = async () => {
    setDownloading(true)
    try {
      const res  = await fetch(`/api/warehouse?center=${encodeURIComponent(center)}`)
      const j    = await res.json()
      downloadCsv(buildCsv(j.data ?? []), `재고현황_${center}_${new Date().toISOString().slice(0,10)}.csv`)
    } finally { setDownloading(false) }
  }

  const handleExportAll = async () => {
    setDlAllLoading(true)
    try {
      const all: Item[] = []
      for (const c of viewable) {
        const res = await fetch(`/api/warehouse?center=${encodeURIComponent(c)}`)
        const j   = await res.json()
        all.push(...(j.data ?? []))
      }
      downloadCsv(buildCsv(all), `재고현황_전체_${new Date().toISOString().slice(0,10)}.csv`)
    } finally { setDlAllLoading(false) }
  }

  return (
    <div className="space-y-4 max-w-xl">
      <div className="border rounded-lg p-4 space-y-3">
        <h3 className="text-[14px] font-bold text-[#111111]">데이터 내보내기</h3>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-[#5A666F]">현재 센터 ({center})</span>
            <Button onClick={handleExport} disabled={downloading} variant="outline" className="text-[12px] h-8">
              {downloading ? '다운로드 중...' : '📥 CSV'}
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-[#5A666F]">전체 센터 ({viewable.length}개)</span>
            <Button onClick={handleExportAll} disabled={dlAllLoading} variant="outline" className="text-[12px] h-8">
              {dlAllLoading ? '다운로드 중...' : '📥 전체 CSV'}
            </Button>
          </div>
        </div>
      </div>

      {/* 재고 일괄 등록 (관리자 전용) */}
      <div className="border rounded-lg p-4 space-y-3">
        <h3 className="text-[14px] font-bold text-[#111111]">재고 일괄 등록</h3>
        <p className="text-[11px] text-[#8A949C]">
          내보내기 CSV/엑셀과 동일한 양식(자재명·수량·분류·렉/단/박스·ERP·비고·센터)을 업로드하면 일괄 추가됩니다.
          <br />행에 <b>센터</b> 값이 없으면 아래 <b>기본 센터</b>로 등록됩니다.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <input ref={upFileRef} type="file" accept=".xlsx,.xls,.csv"
            onChange={handleUpFile}
            className="text-[12px] file:mr-2 file:rounded file:border file:border-[#D9D9D9] file:bg-white file:px-2 file:py-1 file:text-[12px]" />
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[#5A666F]">기본 센터</span>
            <Select value={upCenter} onValueChange={v => v !== null && setUpCenter(v)}>
              <SelectTrigger className="w-[140px] h-8 text-[12px]"><SelectValue /></SelectTrigger>
              <SelectContent>{viewable.map(c => <SelectItem key={c} value={c} className="text-[12px]">{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        {upRows.length > 0 && (
          <div className="text-[11px] text-[#5A666F]">
            인식된 행 {upRows.length}개
            {upNoCenter > 0 && <span className="text-amber-600"> · 센터 미지정 {upNoCenter}개 → {upCenter}</span>}
          </div>
        )}

        {upMsg && (
          <p className={`text-[12px] ${upMsg.startsWith('✅') ? 'text-green-600' : upMsg.startsWith('❌') ? 'text-red-500' : 'text-[#5A666F]'}`}>{upMsg}</p>
        )}

        <Button onClick={handleBulkRegister} disabled={upSaving || upRows.length === 0}
          className="bg-[#D60051] hover:bg-[#A3003D] text-white text-[12px] h-8">
          {upSaving ? '등록 중...' : `⬆️ ${upRows.length || ''}건 등록`}
        </Button>
      </div>

      {/* 센터 지정 삭제 (관리자 전용) */}
      <div className="border border-red-200 rounded-lg p-4 space-y-3">
        <h3 className="text-[14px] font-bold text-red-600">센터 재고 삭제</h3>
        <p className="text-[11px] text-[#8A949C]">
          선택한 센터의 <b>모든 재고 품목</b>이 영구 삭제됩니다. 되돌릴 수 없습니다.
        </p>
        <div className="flex items-center gap-2">
          <Select value={delCenter} onValueChange={v => v !== null && setDelCenter(v)}>
            <SelectTrigger className="w-[150px] h-8 text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>{viewable.map(c => <SelectItem key={c} value={c} className="text-[12px]">{c}</SelectItem>)}</SelectContent>
          </Select>
          <span className="text-[12px] text-[#5A666F]">
            {delCount === null ? '조회 중...' : `${delCount.toLocaleString()}개 품목`}
          </span>
        </div>

        {delMsg && (
          <p className={`text-[12px] ${delMsg.startsWith('✅') ? 'text-green-600' : 'text-red-500'}`}>{delMsg}</p>
        )}

        {!delConfirm ? (
          <Button variant="outline" onClick={() => setDelConfirm(true)}
            disabled={!delCount}
            className="text-red-600 border-red-300 hover:bg-red-50 text-[12px] h-8">
            🗑️ {delCenter} 재고 전체 삭제
          </Button>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] text-red-600 font-semibold">
              정말 {delCenter}의 {delCount?.toLocaleString()}개 품목을 삭제하시겠습니까?
            </span>
            <Button onClick={handleDeleteCenter} disabled={delSaving}
              className="bg-red-600 hover:bg-red-700 text-white text-[12px] h-8">
              {delSaving ? '삭제 중...' : '확인 삭제'}
            </Button>
            <Button variant="outline" onClick={() => setDelConfirm(false)} disabled={delSaving}
              className="text-[12px] h-8">취소</Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export default function WarehouseContent({ user, initialTab }: { user: SessionUser; initialTab?: string }) {
  const viewable = useMemo(
    () => getViewableCenters(user.role, user.assigned_center ?? user.center),
    [user]
  )
  const [center, setCenter] = useState(viewable[0] ?? '자재센터')
  const [invNonce, setInvNonce] = useState(0)   // 관리자 삭제 후 재고 탭 강제 갱신
  const isAdmin  = user.role === 'admin'
  const isGuest  = user.role === 'guest'

  // 탑바 처리대기(이동)에서 ?tab=transfers 로 들어오면 해당 탭으로 시작 (유효한 탭만)
  const validTabs = new Set<string>([
    'inventory', 'transfers',
    ...(!isGuest ? ['material-requests', 'usage'] : []),
    ...(isAdmin ? ['admin'] : []),
  ])
  const activeTab = initialTab && validTabs.has(initialTab) ? initialTab : 'inventory'

  return (
    <div className="space-y-4">
      <Tabs key={activeTab} defaultValue={activeTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="inventory"  className="text-[13px]">재고 현황</TabsTrigger>
          <TabsTrigger value="transfers"  className="text-[13px]">이동 신청 현황</TabsTrigger>
          {!isGuest && <TabsTrigger value="material-requests" className="text-[13px]">자재요청</TabsTrigger>}
          {!isGuest && <TabsTrigger value="usage"             className="text-[13px]">사용내역</TabsTrigger>}
          {isAdmin  && <TabsTrigger value="admin"             className="text-[13px]">관리자</TabsTrigger>}
        </TabsList>

        <TabsContent value="inventory" className="mt-4">
          <InventoryTab key={invNonce} user={user} center={center} onCenterChange={setCenter} />
        </TabsContent>

        <TabsContent value="transfers" className="mt-4">
          <TransferTab user={user} />
        </TabsContent>

        {!isGuest && (
          <TabsContent value="material-requests" className="mt-4">
            <MaterialRequestsContent user={user} />
          </TabsContent>
        )}

        {!isGuest && (
          <TabsContent value="usage" className="mt-4">
            <UsageContent user={user} />
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="admin" className="mt-4">
            <AdminTab center={center} viewable={viewable} onChanged={() => setInvNonce(n => n + 1)} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
