'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Boxes, ClipboardCheck, TriangleAlert, PackageX, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SessionUser } from '@/lib/session'
import { getViewableCenters, CENTERS } from '@/constants/centers'
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
  pending:   { label: '⏳ 대기중', color: '#f57c00' },
  approved:  { label: '✅ 승인됨', color: '#2e7d32' },
  rejected:  { label: '❌ 거절됨', color: '#c62828' },
  cancelled: { label: '🚫 취소됨', color: '#757575' },
}

// ── KPI 카드 ─────────────────────────────────────────────────────────────────
function KpiCard({ enLabel, koLabel, value, unit = '개', color, icon: Icon, active, onClick }: {
  enLabel: string; koLabel: string; value: number; unit?: string; color: string
  icon: LucideIcon; active?: boolean; onClick?: () => void
}) {
  return (
    <div onClick={onClick}
      className={cn(
        'bg-white rounded-lg p-4 cursor-pointer transition-all',
        active ? 'border-2 shadow-sm' : 'border border-[#e2e8f0] hover:border-[#cbd5e1]'
      )}
      style={active ? { borderColor: color } : undefined}>
      <div className="flex items-start justify-between">
        <span className="text-[10px] font-bold tracking-[0.08em] text-[#94A3B8] uppercase">{enLabel}</span>
        <Icon size={18} strokeWidth={1.9} style={{ color }} />
      </div>
      <div className="mt-3 text-[11px] text-[#64748B]">{koLabel}</div>
      <div className="flex items-baseline gap-1 mt-0.5">
        <span className="text-[28px] font-bold leading-none font-heading" style={{ color }}>{value.toLocaleString()}</span>
        <span className="text-[12px] text-[#94A3B8]">{unit}</span>
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

  const REGIONAL = new Set(['강서센터','강북센터','강동센터','강남센터'])
  const SPECIAL  = new Set(['택시지원파트','리페어팀','AFC지원파트','고속/시외','대전센터','토스','외부창고','에이텍본사','티머니(버스)','티머니(택시)'])
  const allCenters = ['자재센터','강서센터','강북센터','강동센터','강남센터','택시지원파트','리페어팀','AFC지원파트','고속/시외','대전센터','토스','외부창고','에이텍본사','티머니(버스)','티머니(택시)']

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
        <div className="flex items-center justify-between px-5 py-3 border-b bg-[#F8F9FA]">
          <div>
            <div className="text-[15px] font-bold text-[#1E293B]">{item.item_name}</div>
            <div className="text-[11px] text-[#64748B]">
              {[item.category_large, item.category_mid, item.category_small].filter(Boolean).join(' > ')}
              {item.erp_code && ` · ERP: ${item.erp_code}`}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[20px] font-bold"
              style={{ color: item.quantity === 0 ? '#c62828' : item.quantity <= 9 ? '#f57c00' : '#2e7d32' }}>
              {item.quantity.toLocaleString()}개
            </span>
            <button onClick={onClose} className="text-[#94A3B8] hover:text-[#1E293B] text-xl leading-none">×</button>
          </div>
        </div>

        {/* 탭 */}
        <div className="flex border-b text-[12px]">
          {modalTabs.map(t => (
            <button key={t} onClick={() => setTab(t as typeof tab)}
              className={`px-4 py-2 font-medium border-b-2 transition-colors ${tab === t ? 'border-[#B32646] text-[#B32646]' : 'border-transparent text-[#64748B] hover:text-[#1E293B]'}`}>
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
              <thead className="bg-[#F8F9FA] sticky top-0">
                <tr>
                  {['일시','구분','수량','변동','담당자','사유'].map(h => (
                    <th key={h} className="px-2 py-1.5 text-left text-[#64748B] font-semibold border-b">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={h.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-2 py-1 text-[#94A3B8] whitespace-nowrap">{tsKst(h.acted_at)}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{ACTION_KO[h.action_type] ?? h.action_type}</td>
                    <td className="px-2 py-1 text-right font-mono font-bold">{h.quantity}</td>
                    <td className="px-2 py-1 text-[#64748B] whitespace-nowrap">{h.snapshot_qty_before} → {h.snapshot_qty_after}</td>
                    <td className="px-2 py-1 text-[#64748B]">{h.actor?.name ?? '-'}</td>
                    <td className="px-2 py-1 text-[#94A3B8] max-w-[150px] truncate">{h.reason ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 이동 신청 */}
          {tab === 'transfer' && (
            <div className="space-y-4 max-w-sm">
              <div>
                <label className="text-[11px] font-semibold text-[#64748B] block mb-1">출발 센터</label>
                <input value={center} disabled className="w-full border rounded px-3 py-1.5 text-[12px] bg-gray-50 text-[#94A3B8]" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[#64748B] block mb-1">도착 센터 *</label>
                <select value={trDest} onChange={e => setTrDest(e.target.value)}
                  className="w-full border rounded px-3 py-1.5 text-[12px] focus:outline-none focus:border-[#B32646]">
                  <option value="">선택하세요</option>
                  {destinations.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[#64748B] block mb-1">수량 * (현재 {item.quantity}개)</label>
                <input type="number" min={1} max={item.quantity} value={trQty}
                  onChange={e => setTrQty(Math.min(item.quantity, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="w-full border rounded px-3 py-1.5 text-[12px] focus:outline-none focus:border-[#B32646]" />
              </div>
              {trMsg && <p className="text-[12px]">{trMsg}</p>}
              <Button onClick={handleTransfer} disabled={trSaving || !trDest}
                className="w-full bg-[#B32646] hover:bg-[#B0003D] text-white">
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
                    <label className="text-[11px] font-semibold text-[#64748B] block mb-1">{label}</label>
                    <input value={String(editData[key] ?? '')} type={key === 'quantity' ? 'number' : 'text'}
                      onChange={e => setEditData(p => ({ ...p, [key]: key === 'quantity' ? parseInt(e.target.value) || 0 : e.target.value }))}
                      className="w-full border rounded px-2 py-1 text-[12px] focus:outline-none focus:border-[#B32646]" />
                  </div>
                ))}
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[#64748B] block mb-1">센터 (위치 변경)</label>
                <select value={String(editData.location ?? item.location)}
                  onChange={e => setEditData(p => ({ ...p, location: e.target.value }))}
                  className="w-full border rounded px-2 py-1 text-[12px] focus:outline-none focus:border-[#B32646] bg-white">
                  {CENTERS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[#64748B] block mb-1">비고</label>
                <textarea value={String(editData.notes ?? '')} rows={2}
                  onChange={e => setEditData(p => ({ ...p, notes: e.target.value }))}
                  className="w-full border rounded px-2 py-1 text-[12px] focus:outline-none focus:border-[#B32646] resize-none" />
              </div>
              {editMsg && <p className="text-[12px]">{editMsg}</p>}
              <div className="flex items-center gap-3 flex-wrap">
                <Button onClick={handleEdit} disabled={editSaving} className="bg-[#B32646] hover:bg-[#B0003D] text-white">
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
const TR_REGIONAL = new Set(['강서센터', '강북센터', '강동센터', '강남센터'])
const TR_ALL_CENTERS = [
  '자재센터', '강서센터', '강북센터', '강동센터', '강남센터', '택시지원파트', '리페어팀',
  'AFC지원파트', '고속/시외', '대전센터', '토스', '외부창고', '에이텍본사', '티머니(버스)', '티머니(택시)',
]
const TR_SPECIAL = new Set(TR_ALL_CENTERS.filter(c => c !== '자재센터' && !TR_REGIONAL.has(c)))

function transferDestinations(center: string): string[] {
  if (center === '자재센터') return TR_ALL_CENTERS.filter(c => c !== '자재센터')
  if (TR_REGIONAL.has(center)) return TR_ALL_CENTERS.filter(c => c === '자재센터' || (TR_REGIONAL.has(c) && c !== center))
  if (TR_SPECIAL.has(center)) return ['자재센터']
  return []
}

// ── 재고 현황 탭 ──────────────────────────────────────────────────────────────
function InventoryTab({ user, center, onCenterChange }: {
  user: SessionUser; center: string; onCenterChange: (c: string) => void
}) {
  const viewable = getViewableCenters(user.role, user.assigned_center ?? user.center)
  const isHub    = center === '자재센터'
  const canStock = user.role === 'admin' || user.role === 'materials'   // 입고/출고
  const canAct   = user.role === 'manager' || user.role === 'user'      // 이동신청/사용내역입력
  const canSelect = canStock || canAct

  const [data,    setData]    = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const [filterLarge, setFilterLarge] = useState('전체')
  const [filterMid,   setFilterMid]   = useState('전체')
  const [filterSmall, setFilterSmall] = useState('전체')
  const [search,      setSearch]      = useState('')
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

  const [detailItem, setDetailItem] = useState<Item | null>(null)

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
    all:  data.length,
    low:  data.filter(r => (r.quantity ?? 0) >= 1 && (r.quantity ?? 0) <= 9).length,
    zero: data.filter(r => (r.quantity ?? 0) === 0).length,
  }), [data])

  const filtered = useMemo(() => {
    let rows = data
    if (filterLarge !== '전체') rows = rows.filter(r => r.category_large === filterLarge)
    if (filterMid   !== '전체') rows = rows.filter(r => r.category_mid   === filterMid)
    if (filterSmall !== '전체') rows = rows.filter(r => r.category_small === filterSmall)
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(r =>
        r.item_name.toLowerCase().includes(q) ||
        (r.erp_code ?? '').toLowerCase().includes(q) ||
        (r.category_large ?? '').toLowerCase().includes(q) ||
        (r.category_mid ?? '').toLowerCase().includes(q)
      )
    }
    if (kpiFilter === 'low')  rows = rows.filter(r => (r.quantity ?? 0) >= 1 && (r.quantity ?? 0) <= 9)
    if (kpiFilter === 'zero') rows = rows.filter(r => (r.quantity ?? 0) === 0)
    return rows
  }, [data, filterLarge, filterMid, filterSmall, search, kpiFilter])

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    if (sortField === 'quantity') return sortDir === 'asc' ? (a.quantity ?? 0) - (b.quantity ?? 0) : (b.quantity ?? 0) - (a.quantity ?? 0)
    const av = String(a[sortField] ?? ''); const bv = String(b[sortField] ?? '')
    return sortDir === 'asc' ? av.localeCompare(bv, 'ko') : bv.localeCompare(av, 'ko')
  }), [filtered, sortField, sortDir])

  const totalPages  = Math.max(1, Math.ceil(sorted.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paged       = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  function handleSort(f: SortField) {
    if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(f); setSortDir('asc') }
  }

  function SortIcon({ field }: { field: string }) {
    if (sortField !== field) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="ml-1" style={{ color: '#B32646' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  function qtyColor(q: number) {
    if (q === 0) return 'text-red-500 font-bold'
    if (q <= 9)  return 'text-amber-500 font-semibold'
    return 'text-[#1E293B]'
  }

  const actItems = useMemo(() => data.filter(r => selected.has(r.id)), [data, selected])
  const qtyOf = (id: number) => stockQties[id] ?? 1

  function openAction(mode: 'in'|'out'|'use'|'transfer') {
    setActionMode(mode); setStockMsg(''); setStockReason(''); setActDest(''); setStockQties({})
  }
  function resetAction() {
    setSelected(new Set()); setActionMode(null); setStockReason(''); setActDest(''); setStockQties({})
  }

  async function handleAction() {
    if (!actionMode || !selected.size) return
    const ids = Array.from(selected)
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
        </div>
        {selected.size > 0 && (
          <div className="flex gap-2 flex-wrap">
            {canStock && (
              <>
                <Button size="sm" className="bg-[#2e7d32] hover:bg-[#1b5e20] text-white"
                  onClick={() => openAction('in')}>📥 입고 ({selected.size})</Button>
                <Button size="sm" className="bg-[#c62828] hover:bg-[#8e0000] text-white"
                  onClick={() => openAction('out')}>📤 출고 ({selected.size})</Button>
              </>
            )}
            {canAct && (
              <>
                <Button size="sm" className="bg-[#c62828] hover:bg-[#8e0000] text-white"
                  onClick={() => openAction('use')}>🧾 사용내역 입력 ({selected.size})</Button>
                <Button size="sm" className="bg-[#1565c0] hover:bg-[#0d47a1] text-white"
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
          <KpiCard enLabel="Total Inventory" koLabel="전체" value={kpi.all} color="#3B82F6" icon={ClipboardCheck}
            active={kpiFilter === 'all'} onClick={() => { setKpiFilter('all'); setPage(1) }} />
          <KpiCard enLabel="Low Stock Alert" koLabel="부족 (1~9)" value={kpi.low} color="#f59e0b" icon={TriangleAlert}
            active={kpiFilter === 'low'} onClick={() => { setKpiFilter(kpiFilter === 'low' ? 'all' : 'low'); setPage(1) }} />
          <KpiCard enLabel="Out of Stock" koLabel="없음" value={kpi.zero} color="#B32646" icon={PackageX}
            active={kpiFilter === 'zero'} onClick={() => { setKpiFilter(kpiFilter === 'zero' ? 'all' : 'zero'); setPage(1) }} />
        </div>
      )}

      {/* 필터 */}
      <div className="bg-white rounded-lg border border-[#e2e8f0] p-3 flex flex-wrap gap-2 items-center">
        <Input className="w-[200px] h-8 text-[12px]" placeholder="자재명 / ERP코드 / 분류명..."
          value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        <Select value={filterLarge} onValueChange={v => { if (v !== null) { setFilterLarge(v); setFilterMid('전체'); setFilterSmall('전체'); setPage(1) } }}>
          <SelectTrigger className="w-[115px] h-8 text-[12px]"><SelectValue placeholder="대분류" /></SelectTrigger>
          <SelectContent>{largeList.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filterMid} onValueChange={v => { if (v !== null) { setFilterMid(v); setFilterSmall('전체'); setPage(1) } }}>
          <SelectTrigger className="w-[115px] h-8 text-[12px]"><SelectValue placeholder="중분류" /></SelectTrigger>
          <SelectContent>{midList.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filterSmall} onValueChange={v => { if (v !== null) { setFilterSmall(v); setPage(1) } }}>
          <SelectTrigger className="w-[115px] h-8 text-[12px]"><SelectValue placeholder="소분류" /></SelectTrigger>
          <SelectContent>{smallList.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        {(filterLarge !== '전체' || filterMid !== '전체' || filterSmall !== '전체' || search || kpiFilter !== 'all') && (
          <Button variant="ghost" className="text-[#B32646] text-[12px] h-8"
            onClick={() => { setFilterLarge('전체'); setFilterMid('전체'); setFilterSmall('전체'); setSearch(''); setKpiFilter('all'); setPage(1) }}>
            ✕ 초기화
          </Button>
        )}
      </div>

      {/* 액션 패널 (입고/출고/사용/이동신청) */}
      {actionMode && selected.size > 0 && (() => {
        const META = {
          in:       { title: '📥 입고',        btn: '✅ 입고 확정',   color: 'bg-[#2e7d32] hover:bg-[#1b5e20] text-white' },
          out:      { title: '📤 출고',        btn: '✅ 출고 확정',   color: 'bg-[#c62828] hover:bg-[#8e0000] text-white' },
          use:      { title: '🧾 사용내역 입력', btn: '✅ 사용 확정',   color: 'bg-[#c62828] hover:bg-[#8e0000] text-white' },
          transfer: { title: '🚚 이동 신청',    btn: '🚚 이동 신청',   color: 'bg-[#1565c0] hover:bg-[#0d47a1] text-white' },
        }[actionMode]
        const needReason = actionMode !== 'transfer'
        const dests = transferDestinations(center)
        const disabled = stockSaving || (needReason ? !stockReason.trim() : !actDest)
        return (
          <div className="border rounded-lg p-4 bg-[#FFF8F0] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold">{META.title} — {selected.size}개 자재</span>
              <button onClick={resetAction} className="text-[#94A3B8] hover:text-red-400">✕</button>
            </div>

            {actionMode === 'transfer' && (
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-[#64748B] block mb-1">출발 센터</label>
                  <input value={center} disabled className="border rounded px-3 py-1.5 text-[12px] bg-gray-50 text-[#94A3B8] w-40" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[#64748B] block mb-1">도착 센터 *</label>
                  <select value={actDest} onChange={e => setActDest(e.target.value)}
                    className="border rounded px-3 py-1.5 text-[12px] w-40 focus:outline-none focus:border-[#B32646] bg-white">
                    <option value="">선택하세요</option>
                    {dests.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
            )}

            <div className="space-y-2 max-h-40 overflow-y-auto">
              {actItems.map(r => (
                <div key={r.id} className="flex items-center gap-2">
                  <span className="text-[12px] flex-1 truncate">{r.item_name}</span>
                  <span className="text-[11px] text-[#94A3B8]">현재 {r.quantity}개</span>
                  <input type="number" min={1} value={stockQties[r.id] ?? 1}
                    onChange={e => setStockQties(prev => ({ ...prev, [r.id]: parseInt(e.target.value) || 1 }))}
                    className="w-20 border rounded px-2 py-0.5 text-[12px] text-right focus:outline-none bg-white" />
                </div>
              ))}
            </div>

            {needReason && (
              <div>
                <label className="text-[11px] font-semibold text-[#64748B] block mb-1">사유 *</label>
                <input value={stockReason} onChange={e => setStockReason(e.target.value)}
                  placeholder={actionMode === 'use' ? '사용 사유' : '입출고 사유'}
                  className="w-full border rounded px-3 py-1.5 text-[12px] focus:outline-none focus:border-[#B32646] bg-white" />
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
      <div className="bg-white rounded-lg border border-[#e2e8f0] p-3 space-y-3">
      {/* 테이블 정보 */}
      <div className="flex items-center justify-between text-[12px] text-gray-500">
        <span><b className="text-[#1E293B]">{center}</b> — {sorted.length.toLocaleString()}개 품목</span>
        <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1) }}>
          <SelectTrigger className="w-[85px] h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{[20, 50, 100, 200].map(n => <SelectItem key={n} value={String(n)}>{n}개씩</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {/* 테이블 */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-400 border rounded">데이터 로딩 중...</div>
      ) : sorted.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-gray-400 border rounded">📭 해당 조건의 재고가 없습니다.</div>
      ) : (
        <div className="rounded-md overflow-auto max-h-[520px] border border-[#e2e8f0]">
          <table className="w-full text-[12px] border-collapse min-w-[720px]">
            <thead className="sticky top-0 bg-[#F8F9FA] z-10">
              <tr>
                {canSelect && (
                  <th className="px-2 py-2 border-b w-8">
                    <input type="checkbox" checked={selected.size === paged.length && paged.length > 0}
                      onChange={() => setSelected(selected.size === paged.length ? new Set() : new Set(paged.map(r => r.id)))}
                      className="cursor-pointer" />
                  </th>
                )}
                {([
                  ['자재명', 'item_name'], ['수량', 'quantity'],
                  ['대분류', 'category_large'], ['중분류', 'category_mid'], ['소분류', 'category_small'],
                ] as [string, SortField][]).map(([label, field]) => (
                  <th key={field} onClick={() => handleSort(field)}
                    className="px-3 py-2 text-left text-[11px] font-semibold text-[#64748B] border-b whitespace-nowrap cursor-pointer hover:text-[#B32646] select-none uppercase tracking-wide">
                    {label}<SortIcon field={field} />
                  </th>
                ))}
                {isHub && <th className="px-3 py-2 text-left text-[11px] font-semibold text-[#64748B] border-b">렉/단/박스</th>}
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-[#64748B] border-b">ERP코드</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((item, i) => (
                <tr key={item.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors`}>
                  {canSelect && (
                    <td className="px-2 py-1.5 text-center">
                      <input type="checkbox" checked={selected.has(item.id)}
                        onChange={() => setSelected(prev => { const n = new Set(prev); if (n.has(item.id)) n.delete(item.id); else n.add(item.id); return n })}
                        className="cursor-pointer" />
                    </td>
                  )}
                  <td className="px-3 py-1.5 max-w-[200px] truncate">
                    <button onClick={() => setDetailItem(item)}
                      className="text-[#1E293B] font-medium hover:text-[#B32646] hover:underline text-left w-full truncate">
                      {item.item_name}
                    </button>
                  </td>
                  <td className={`px-3 py-1.5 text-right font-mono ${qtyColor(item.quantity ?? 0)}`}>
                    {(item.quantity ?? 0).toLocaleString()}
                  </td>
                  <td className="px-3 py-1.5 text-[#475569] whitespace-nowrap">{item.category_large ?? ''}</td>
                  <td className="px-3 py-1.5 text-[#475569] whitespace-nowrap">{item.category_mid ?? ''}</td>
                  <td className="px-3 py-1.5 text-[#475569] whitespace-nowrap">{item.category_small ?? ''}</td>
                  {isHub && (
                    <td className="px-3 py-1.5 text-[#64748B] font-mono text-[11px] whitespace-nowrap">
                      {[item.rack_no, item.shelf, item.box_no].filter(Boolean).join(' / ')}
                    </td>
                  )}
                  <td className="px-3 py-1.5 text-[#94A3B8] font-mono text-[11px]">{item.erp_code ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage(p => p - 1)}>◀</Button>
          <span className="text-[12px] text-gray-600">{currentPage} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setPage(p => p + 1)}>▶</Button>
        </div>
      )}
      </div>

      {detailItem && (
        <ItemDetailModal item={detailItem} user={user} center={center}
          onClose={() => setDetailItem(null)}
          onUpdated={() => { fetchData(center); setDetailItem(null) }} />
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
            <div className="text-[13px] font-semibold text-[#1E293B]">
              {tr.warehouse?.item_name ?? '자재 정보 없음'}
            </div>
            <div className="text-[12px] text-[#64748B] mt-0.5">
              신청자: {tr.requester?.name ?? '-'} · {tsKst(tr.requested_at)}
            </div>
          </div>
          <span className="text-[13px] font-bold flex-shrink-0 ml-2" style={{ color: st.color }}>{st.label}</span>
        </div>

        <div className="flex items-center gap-2 text-[12px]">
          <span className="bg-[#F8F9FA] border px-2 py-0.5 rounded text-[#475569]">{tr.from_center}</span>
          <span className="text-[#94A3B8]">→</span>
          <span className="bg-[#F8F9FA] border px-2 py-0.5 rounded text-[#475569]">{tr.to_center}</span>
          <span className="ml-auto font-mono font-bold text-[#1E293B]">{tr.quantity}개</span>
        </div>

        {tr.status !== 'pending' && tr.approver?.name && (
          <div className="text-[11px] text-[#94A3B8]">
            처리자: {tr.approver.name}{tr.processed_at && ` · ${tsKst(tr.processed_at)}`}
          </div>
        )}

        {tr.status === 'pending' && (
          <div className="flex gap-2 pt-1">
            {approvable && (
              <>
                <Button size="sm" className="bg-[#2e7d32] hover:bg-[#1b5e20] text-white"
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
              <Button size="sm" variant="outline" className="text-[#94A3B8]"
                disabled={acting === tr.id} onClick={() => handleAction(tr.id, 'cancelled')}>
                🚫 취소
              </Button>
            )}
            {!approvable && !myRequest && (
              <span className="text-[11px] text-[#94A3B8] self-center">🔒 승인 권한 없음</span>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-[#64748B]">
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

// ── 관리자 탭 ─────────────────────────────────────────────────────────────────
function AdminTab({ center, viewable }: { center: string; viewable: string[] }) {
  const [downloading,    setDownloading]    = useState(false)
  const [dlAllLoading,   setDlAllLoading]   = useState(false)

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
    <div className="space-y-4 max-w-md">
      <div className="border rounded-lg p-4 space-y-3">
        <h3 className="text-[14px] font-bold text-[#1E293B]">💾 데이터 내보내기</h3>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-[#64748B]">현재 센터 ({center})</span>
            <Button onClick={handleExport} disabled={downloading} variant="outline" className="text-[12px] h-8">
              {downloading ? '다운로드 중...' : '📥 CSV'}
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-[#64748B]">전체 센터 ({viewable.length}개)</span>
            <Button onClick={handleExportAll} disabled={dlAllLoading} variant="outline" className="text-[12px] h-8">
              {dlAllLoading ? '다운로드 중...' : '📥 전체 CSV'}
            </Button>
          </div>
        </div>
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
      {/* 페이지 헤더 */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-[#b32646] flex items-center justify-center text-white flex-shrink-0">
          <Boxes size={20} strokeWidth={1.9} />
        </div>
        <div>
          <h2 className="text-[20px] font-bold text-[#0b1c30] font-heading leading-tight">재고 현황</h2>
          <p className="text-[12px] text-[#64748B] mt-0.5">실시간 창고 자재 및 단말기 재고 데이터입니다.</p>
        </div>
      </div>
      <Tabs key={activeTab} defaultValue={activeTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="inventory"  className="text-[13px]">📦 재고 현황</TabsTrigger>
          <TabsTrigger value="transfers"  className="text-[13px]">🚚 이동 신청 현황</TabsTrigger>
          {!isGuest && <TabsTrigger value="material-requests" className="text-[13px]">📋 자재요청</TabsTrigger>}
          {!isGuest && <TabsTrigger value="usage"             className="text-[13px]">📊 사용내역</TabsTrigger>}
          {isAdmin  && <TabsTrigger value="admin"             className="text-[13px]">⚙️ 관리자</TabsTrigger>}
        </TabsList>

        <TabsContent value="inventory" className="mt-4">
          <InventoryTab user={user} center={center} onCenterChange={setCenter} />
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
            <AdminTab center={center} viewable={viewable} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
