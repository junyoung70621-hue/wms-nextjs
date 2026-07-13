'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import type { SessionUser } from '@/lib/session'
import { NO_WAREHOUSE } from '@/constants/centers'
import GuestCallout from '@/components/auth/GuestCallout'
import TerminalBoxSection from '@/components/TerminalBoxSection'
import WarehouseMap from './WarehouseMap'

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
}

type BoxTerminal = {
  trcn_id: string
  rack_no: string | null
  shelf: string | null
  box_no: string | null
  warehouse_id: number | null
  device_type: string | null
}

type RackGroup = {
  rack_no: string
  shelves: Record<string, Item[]>
}

function groupByRack(items: Item[]): { racks: RackGroup[]; noRack: Item[] } {
  const rackMap: Record<string, Record<string, Item[]>> = {}
  const noRack: Item[] = []

  for (const item of items) {
    if (!item.rack_no) { noRack.push(item); continue }
    if (!rackMap[item.rack_no]) rackMap[item.rack_no] = {}
    const shelf = item.shelf ?? '미지정'
    if (!rackMap[item.rack_no][shelf]) rackMap[item.rack_no][shelf] = []
    rackMap[item.rack_no][shelf].push(item)
  }

  const racks = Object.entries(rackMap)
    .sort(([a], [b]) => a.localeCompare(b, 'ko'))
    .map(([rack_no, shelves]) => ({ rack_no, shelves }))

  return { racks, noRack }
}

function ItemChip({ item, onClick }: { item: Item; onClick: () => void }) {
  const low = item.quantity === 0
  return (
    <button
      onClick={onClick}
      className={`text-left w-full px-2 py-1 rounded text-[11px] transition-colors ${
        low
          ? 'bg-red-50 border border-red-200 hover:bg-red-100'
          : 'bg-white border border-[rgba(0,0,0,0.08)] hover:bg-gray-50'
      }`}
    >
      <div className="font-medium text-[#1E293B] truncate leading-tight">{item.item_name}</div>
      <div className={`text-[10px] mt-0.5 ${low ? 'text-red-500 font-bold' : 'text-[#94A3B8]'}`}>
        {item.quantity.toLocaleString()}개
        {item.box_no ? ` · ${item.box_no}` : ''}
      </div>
    </button>
  )
}

function ItemModal({ item, canEdit, location, onClose, onSaved, onBoxChanged }: {
  item: Item; canEdit: boolean; location: string; onClose: () => void; onSaved: () => void; onBoxChanged: () => void
}) {
  const [form, setForm] = useState({
    item_name: item.item_name,
    quantity: String(item.quantity ?? 0),
    rack_no: item.rack_no ?? '',
    shelf: item.shelf ?? '',
    box_no: item.box_no ?? '',
    category_large: item.category_large ?? '',
    category_mid: item.category_mid ?? '',
  })
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const set = (k: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [k]: v }))

  // 단말기 IH 추가/삭제로 박스 수량이 서버에서 바뀌면(adjustBoxQuantity) 수량 입력칸도 자동 동기화
  useEffect(() => {
    setForm(f => ({ ...f, quantity: String(item.quantity ?? 0) }))
  }, [item.quantity])

  // 수량이 기존과 달라졌는지 → 사유 입력 노출/필수
  const qtyChanged = (Number(form.quantity) || 0) !== (item.quantity ?? 0)

  async function save() {
    if (qtyChanged && !reason.trim()) { setMsg('수량 변경 사유를 입력해 주세요.'); return }
    setSaving(true); setMsg('')
    try {
      const res = await fetch('/api/warehouse/item', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          item_name: form.item_name,
          quantity: Number(form.quantity) || 0,
          rack_no: form.rack_no || null,
          shelf: form.shelf || null,
          box_no: form.box_no || null,
          category_large: form.category_large || null,
          category_mid: form.category_mid || null,
          reason: qtyChanged ? reason.trim() : undefined,
        }),
      })
      const d = await res.json()
      if (!res.ok || d.error) { setMsg(d.error || '저장 실패'); setSaving(false); return }
      onSaved()
    } catch { setMsg('저장 실패'); setSaving(false) }
  }

  const FIELDS: [keyof typeof form, string, boolean][] = [
    ['item_name', '품명', false],
    ['quantity', '수량', true],
    ['rack_no', '랙', false],
    ['shelf', '선반', false],
    ['box_no', '박스', false],
    ['category_large', '대분류', false],
    ['category_mid', '중분류', false],
  ]

  const isTerminalBox = item.category_mid === '단말기'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className={`bg-white rounded-xl shadow-xl p-5 max-w-full max-h-[85vh] overflow-y-auto space-y-3 ${isTerminalBox ? 'w-[440px]' : 'w-[340px]'}`} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h3 className="text-[14px] font-bold text-[#1E293B] truncate pr-2">{item.item_name}</h3>
          <button onClick={onClose} className="text-[#94A3B8] hover:text-[#1E293B] text-lg leading-none flex-shrink-0">×</button>
        </div>

        {canEdit ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              {FIELDS.map(([key, label, num]) => (
                <div key={key} className={key === 'item_name' ? 'col-span-2' : ''}>
                  <label className="text-[11px] text-[#64748B] block mb-0.5">{label}</label>
                  <Input
                    type={num ? 'number' : 'text'}
                    value={form[key]}
                    onChange={e => set(key)(e.target.value)}
                    className="h-8 text-[12px] bg-white"
                  />
                </div>
              ))}
            </div>
            {qtyChanged && (
              <div>
                <label className="text-[11px] text-[#64748B] block mb-0.5">
                  수량 변경 사유 <span className="text-[#B32646]">*</span>
                  <span className="text-[#94A3B8] ml-1">({item.quantity.toLocaleString()} → {(Number(form.quantity) || 0).toLocaleString()})</span>
                </label>
                <Input
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="예: 실사 조정 / 입고 / 폐기"
                  className="h-8 text-[12px] bg-white"
                />
              </div>
            )}
            {msg && <div className="text-[11px] text-[#c62828]">{msg}</div>}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose}
                className="h-8 px-3 text-[12px] rounded-md border border-[#E2E8F0] text-[#475569] hover:bg-[#F1F5F9]">취소</button>
              <button onClick={save} disabled={saving}
                className="h-8 px-3 text-[12px] rounded-md bg-[#B32646] text-white hover:bg-[#9a1f3c] disabled:opacity-60">
                {saving ? '저장 중…' : '저장'}
              </button>
            </div>
            <p className="text-[10px] text-[#94A3B8]">재고 현황과 동일한 데이터로, 저장 시 즉시 반영됩니다.</p>
          </>
        ) : (
          <table className="w-full text-[12px]">
            <tbody className="divide-y divide-[rgba(0,0,0,0.05)]">
              {[
                ['수량', `${item.quantity.toLocaleString()}개`],
                ['랙', item.rack_no ?? '-'],
                ['선반', item.shelf ?? '-'],
                ['박스', item.box_no ?? '-'],
                ['대분류', item.category_large ?? '-'],
                ['중분류', item.category_mid ?? '-'],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td className="py-1.5 pr-3 text-[#64748B] w-16">{k}</td>
                  <td className="py-1.5 font-medium text-[#1E293B]">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {isTerminalBox && <TerminalBoxSection item={item} canEdit={canEdit} location={location} onChanged={onBoxChanged} />}
      </div>
    </div>
  )
}

// 좌표(랙|선반|박스) 키 — box_terminals 와 자재(warehouse) 연결용
const coordKey = (r: string | null, s: string | null, b: string | null) => `${r ?? ''}|${s ?? ''}|${b ?? ''}`

// 한 박스(좌표/warehouse_id)에 속한 단말기(IH) 목록 추출 — itemIhMap 과 동일 규칙
function terminalsForBox(boxItems: Item[], terminals: BoxTerminal[]): BoxTerminal[] {
  const ids = new Set(boxItems.map(i => i.id))
  const keys = new Set(boxItems.map(i => coordKey(i.rack_no, i.shelf, i.box_no)))
  return terminals.filter(t =>
    (t.warehouse_id != null && ids.has(t.warehouse_id)) ||
    (t.warehouse_id == null && keys.has(coordKey(t.rack_no, t.shelf, t.box_no))))
}

type BoxGroup = { boxNo: string | null; items: Item[] }

// 약도에서 렉 클릭 → 해당 rack_no 의 선반·박스 상세 (선반 reveal 애니메이션 + 박스번호)
function RackDetailModal({ rackNo, label, items, terminals, onBoxClick, onClose }: {
  rackNo: string; label: string; items: Item[]; terminals: BoxTerminal[]
  onBoxClick: (b: { shelf: string; boxNo: string | null; items: Item[] }) => void; onClose: () => void
}) {
  const rackItems = items.filter(i => i.rack_no === rackNo)
  const byShelf: Record<string, Item[]> = {}
  for (const it of rackItems) {
    const s = it.shelf ?? '미지정'
    ;(byShelf[s] ??= []).push(it)
  }
  // 선반 → 박스(box_no) 2단 그룹
  const shelves: [string, BoxGroup[]][] = Object.entries(byShelf)
    .sort(([a], [b]) => a.localeCompare(b, 'ko', { numeric: true }))
    .map(([shelfName, shelfItems]) => {
      const boxMap = new Map<string, Item[]>()
      for (const it of shelfItems) {
        const k = it.box_no ?? ''
        if (!boxMap.has(k)) boxMap.set(k, [])
        boxMap.get(k)!.push(it)
      }
      const boxes: BoxGroup[] = [...boxMap.entries()]
        .map(([b, arr]) => ({ boxNo: b === '' ? null : b, items: arr }))
        .sort((x, y) => String(x.boxNo ?? '').localeCompare(String(y.boxNo ?? ''), 'ko', { numeric: true }))
      return [shelfName, boxes] as [string, BoxGroup[]]
    })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-[680px] max-w-full max-h-[82vh] flex flex-col modal-pop" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-bold text-[#B32646]">📍 {label}</span>
            <span className="text-[11px] text-[#94A3B8]">{rackItems.length}개 품목</span>
          </div>
          <button onClick={onClose} className="text-[#94A3B8] hover:text-[#1E293B] text-lg leading-none">×</button>
        </div>
        <div className="p-4 overflow-y-auto">
          {rackItems.length === 0 ? (
            <div className="text-[12px] text-[#94A3B8] py-8 text-center">이 렉에 등록된 자재가 없습니다.</div>
          ) : shelves.map(([shelfName, boxes], si) => (
            <div
              key={shelfName}
              className="shelf-reveal mb-2.5 last:mb-0 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] overflow-hidden"
              style={{ animationDelay: `${si * 70}ms` }}
            >
              {/* 선반 헤더 (렉 가로 칸처럼) */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-[#FBE9EE] to-transparent border-b border-[#E2E8F0]">
                <span className="text-[11px] font-bold text-[#B32646]">🗄️ 선반 {shelfName}</span>
                <span className="text-[10px] text-[#94A3B8]">박스 {boxes.length}개</span>
              </div>
              {/* 박스번호 칩 */}
              <div className="p-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
                {boxes.map((box, bi) => {
                  const qty = box.items.reduce((s, it) => s + (it.quantity || 0), 0)
                  const ihCount = terminalsForBox(box.items, terminals).length
                  return (
                    <button
                      key={box.boxNo ?? `none-${bi}`}
                      onClick={() => onBoxClick({ shelf: shelfName, boxNo: box.boxNo, items: box.items })}
                      className="text-left px-2.5 py-2 rounded-lg border border-[#E2E8F0] bg-white hover:border-[#B32646] hover:bg-[#FBE9EE]/40 hover:-translate-y-[1px] transition-all"
                    >
                      <div className="flex items-center gap-1 text-[12px] font-bold text-[#1E293B] truncate leading-tight">
                        <span>📦</span>
                        <span className="truncate">{box.boxNo ?? '박스 미지정'}</span>
                      </div>
                      <div className="text-[10px] text-[#94A3B8] mt-0.5">
                        품목 {box.items.length} · {qty.toLocaleString()}개
                        {ihCount > 0 && <span className="text-[#2563EB]"> · IH {ihCount}</span>}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// 박스 클릭 → 박스 내용물(품목 + 단말기 IH) 팝업
function BoxContentModal({ rackNo, shelf, boxNo, items, terminals, onItemClick, onClose }: {
  rackNo: string; shelf: string; boxNo: string | null; items: Item[]; terminals: BoxTerminal[]
  onItemClick: (it: Item) => void; onClose: () => void
}) {
  const ihList = terminalsForBox(items, terminals)
  const sorted = [...items].sort((a, b) => a.item_name.localeCompare(b.item_name, 'ko', { numeric: true }))

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-[460px] max-w-full max-h-[85vh] flex flex-col modal-pop" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-4 py-3 border-b border-[#E2E8F0]">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[14px] font-bold text-[#1E293B] truncate">
              <span>📦</span><span className="truncate">박스 {boxNo ?? '미지정'}</span>
            </div>
            <div className="text-[11px] text-[#94A3B8] mt-0.5">랙 {rackNo} · 선반 {shelf}</div>
          </div>
          <button onClick={onClose} className="text-[#94A3B8] hover:text-[#1E293B] text-lg leading-none flex-shrink-0">×</button>
        </div>

        <div className="p-4 overflow-y-auto space-y-4">
          {/* 품목 목록 */}
          <div>
            <div className="text-[11px] font-bold text-[#64748B] mb-1.5">📋 품목 <span className="text-[#94A3B8] font-normal">({sorted.length})</span></div>
            {sorted.length === 0 ? (
              <div className="text-[11px] text-[#94A3B8]">품목이 없습니다.</div>
            ) : (
              <div className="space-y-1">
                {sorted.map(it => {
                  const low = it.quantity === 0
                  return (
                    <button
                      key={it.id}
                      onClick={() => onItemClick(it)}
                      className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-left transition-colors ${
                        low ? 'bg-red-50 border-red-200 hover:bg-red-100' : 'bg-white border-[#E2E8F0] hover:bg-[#F1F5F9]'
                      }`}
                    >
                      <span className="text-[12px] font-medium text-[#1E293B] truncate">{it.item_name}</span>
                      <span className={`text-[11px] flex-shrink-0 ${low ? 'text-red-500 font-bold' : 'text-[#64748B]'}`}>{it.quantity.toLocaleString()}개</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* 박스 내 단말기(IH) */}
          {ihList.length > 0 && (
            <div>
              <div className="text-[11px] font-bold text-[#64748B] mb-1.5">📟 박스 내 단말기 <span className="text-[#94A3B8] font-normal">({ihList.length})</span></div>
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                {ihList.map(t => (
                  <span key={t.trcn_id} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#F1F5F9] border border-[#E2E8F0] text-[10px] text-[#475569]">
                    <span className="font-mono">{t.trcn_id}</span>
                    {t.device_type && <span className="text-[#94A3B8]">{t.device_type}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          <p className="text-[10px] text-[#94A3B8]">품목을 클릭하면 상세·수정 화면이 열립니다.</p>
        </div>
      </div>
    </div>
  )
}

export default function RackMapContent({ user }: { user: SessionUser | null }) {
  const [items,    setItems]    = useState<Item[]>([])
  const [terminals, setTerminals] = useState<BoxTerminal[]>([])
  const [centers,  setCenters]  = useState<string[]>([])
  const [center,   setCenter]   = useState('')
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState<Item | null>(null)
  const [selectedRack, setSelectedRack] = useState<{ rackNo: string; label: string } | null>(null)
  const [selectedBox, setSelectedBox] = useState<{ rackNo: string; shelf: string; boxNo: string | null; items: Item[] } | null>(null)
  const [focused, setFocused] = useState(false)

  const userCenter = user ? (user.assigned_center ?? user.center) : '자재센터'

  useEffect(() => {
    if (!user) {
      // 게스트 미리보기: API는 401이므로 호출 생략, 자재센터 약도(빈 데이터)만 렌더
      setCenters(['자재센터'])
      setCenter('자재센터')
      setLoading(false)
      return
    }
    const isManager = user.role === 'admin' || user.role === 'materials'
    // 자체 창고가 없는 센터(고객지원사업부)는 서버가 허용한 자재센터 지도를 조회
    const noOwnMap = NO_WAREHOUSE.has(userCenter)
    fetch('/api/rack-map' + (isManager || noOwnMap ? '' : `?center=${encodeURIComponent(userCenter)}`))
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        setCenters(d.centers ?? [])
        setCenter(isManager || noOwnMap ? (d.centers?.[0] ?? '') : userCenter)
        setItems(d.data ?? [])
        setTerminals(d.terminals ?? [])
      })
      .catch(() => setError('로드 실패'))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const reload = useCallback(async (c: string): Promise<Item[] | null> => {
    if (!c) return null
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/rack-map?center=${encodeURIComponent(c)}`)
      const d = await res.json()
      if (d.error) { setError(d.error); return null }
      const data: Item[] = d.data ?? []
      setItems(data)
      setTerminals(d.terminals ?? [])
      return data
    } catch { setError('로드 실패'); return null }
    finally { setLoading(false) }
  }, [])

  const handleCenterChange = (c: string) => {
    setCenter(c)
    reload(c)
  }

  // 수정 권한: 관리자 / 자재센터 직원(자재파트 포함, guest 제외) — /warehouse·박스단말기와 동일 기준
  const canEdit = !!user && (user.role === 'admin' || (userCenter === '자재센터' && user.role !== 'guest'))

  // 자재 id → 그 박스에 보관된 단말기 IH 목록 (IH 번호 검색용)
  // box_terminals 는 warehouse_id 우선, 없으면 좌표(랙/선반/박스)로 자재와 연결
  const itemIhMap = useMemo(() => {
    const byCoord = new Map<string, number>()
    for (const it of items) byCoord.set(coordKey(it.rack_no, it.shelf, it.box_no), it.id)
    const m = new Map<number, string[]>()
    for (const t of terminals) {
      let id = t.warehouse_id ?? null
      if (id == null) { const f = byCoord.get(coordKey(t.rack_no, t.shelf, t.box_no)); if (f != null) id = f }
      if (id == null) continue
      const arr = m.get(id) ?? []
      arr.push(t.trcn_id)
      m.set(id, arr)
    }
    return m
  }, [items, terminals])

  const ihHit = useCallback((id: number, q: string) =>
    (itemIhMap.get(id) ?? []).find(ih => ih.toLowerCase().includes(q)), [itemIhMap])

  const filtered = useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(i =>
      i.item_name.toLowerCase().includes(q) ||
      (i.rack_no ?? '').toLowerCase().includes(q) ||
      (i.category_large ?? '').toLowerCase().includes(q) ||
      !!ihHit(i.id, q)
    )
  }, [items, search, ihHit])

  const { racks, noRack } = useMemo(() => groupByRack(filtered), [filtered])

  // 약도용: rack_no → 품목 수 (검색 무관, 전체 기준)
  const rackCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const it of items) if (it.rack_no) m[it.rack_no] = (m[it.rack_no] ?? 0) + 1
    return m
  }, [items])

  const isManager = user?.role === 'admin' || user?.role === 'materials'
  const isHub = center === '자재센터'

  // 약도 검색: 자재명/분류/IH 매칭 → 위치(랙·선반·박스) 표시, 매칭 렉 강조
  const matches = useMemo(() => {
    if (!isHub || !search.trim()) return []
    const q = search.toLowerCase()
    const out: (Item & { _ih?: string })[] = []
    for (const i of items) {
      if (!i.rack_no) continue
      const nameHit =
        i.item_name.toLowerCase().includes(q) ||
        (i.category_large ?? '').toLowerCase().includes(q) ||
        (i.category_mid ?? '').toLowerCase().includes(q)
      const hitIh = ihHit(i.id, q)
      if (nameHit) out.push(i)
      else if (hitIh) out.push({ ...i, _ih: hitIh })
    }
    return out
  }, [isHub, search, items, ihHit])
  const highlightRacks = useMemo(
    () => new Set(matches.map(m => m.rack_no!).filter(Boolean)),
    [matches],
  )

  return (
    <div className="space-y-4">
      {/* 필터 바 */}
      <div className="bg-white rounded-lg border border-[#e2e8f0] p-3">
      <div className="flex flex-wrap gap-2 items-center">
        {isManager && (
          <Select value={center} onValueChange={v => v !== null && handleCenterChange(v)}>
            <SelectTrigger className="h-8 text-[12px] w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {centers.map(c => (
                <SelectItem key={c} value={c} className="text-[12px]">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {isHub ? (
          <div className="relative">
            <Input
              placeholder="자재명·IH 검색 → 랙·선반·박스 위치"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 150)}
              className="h-8 text-[12px] w-72"
            />
            {focused && search.trim() && (
              <div className="absolute z-30 mt-1 w-[380px] max-h-[340px] overflow-auto bg-white border border-[#e2e8f0] rounded-lg shadow-lg">
                {matches.length === 0 ? (
                  <div className="px-3 py-3 text-[12px] text-[#94A3B8]">일치하는 자재가 없습니다.</div>
                ) : (
                  <>
                    <div className="px-3 py-1.5 text-[10px] text-[#94A3B8] border-b border-[#f1f5f9] sticky top-0 bg-white">
                      {matches.length}개 위치 · 클릭하면 해당 렉이 열립니다
                    </div>
                    {matches.slice(0, 50).map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onMouseDown={() => { setSelectedRack({ rackNo: m.rack_no!, label: `랙${m.rack_no}` }); setFocused(false) }}
                        className="w-full text-left px-3 py-2 hover:bg-[#f1f5f9] border-b border-[#f1f5f9] last:border-0"
                      >
                        <div className="text-[12px] font-medium text-[#1E293B] truncate">
                          {m.item_name}
                          {m._ih && <span className="ml-1.5 font-mono text-[10px] text-[#2563eb]">IH {m._ih}</span>}
                        </div>
                        <div className="text-[11px] text-[#64748B] mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded bg-[#fbe9ee] text-[#B32646] font-semibold">랙 {m.rack_no}</span>
                          <span className="px-1.5 py-0.5 rounded bg-[#F1F5F9]">선반 {m.shelf ?? '-'}</span>
                          <span className="px-1.5 py-0.5 rounded bg-[#F1F5F9]">박스 {m.box_no ?? '-'}</span>
                          <span className="text-[#94A3B8] ml-auto">{m.quantity}개</span>
                        </div>
                      </button>
                    ))}
                    {matches.length > 50 && (
                      <div className="px-3 py-1.5 text-[10px] text-[#94A3B8]">상위 50개 위치만 표시</div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          <Input
            placeholder="품명 / IH / 랙 검색"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 text-[12px] w-48"
          />
        )}
        <GuestCallout label="자재명·IH 검색 → 랙·선반·박스 위치 표시" />
        <span className="text-[11px] text-[#94A3B8] ml-auto">
          {isHub
            ? (search.trim() ? `${matches.length}개 위치 매칭` : `${Object.keys(rackCounts).length}개 렉`)
            : `${filtered.length}개 품목 · ${racks.length}개 랙`}
        </span>
      </div>
      </div>

      {loading ? (
        <div className="text-[12px] text-[#94A3B8] py-8 text-center">불러오는 중...</div>
      ) : error ? (
        <div className="text-red-500 text-[12px]">{error}</div>
      ) : isHub ? (
        <WarehouseMap
          counts={rackCounts}
          highlight={highlightRacks}
          onRackClick={(rackNo, label) => setSelectedRack({ rackNo, label })}
        />
      ) : racks.length === 0 && noRack.length === 0 ? (
        <div className="text-[12px] text-[#94A3B8] py-8 text-center">
          {center} 센터에 등록된 자재 없음
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-[#e2e8f0] p-4">
        <div className="space-y-3">
          {racks.map(rack => {
            const shelvesSorted = Object.entries(rack.shelves)
              .sort(([a], [b]) => a.localeCompare(b, 'ko'))
            return (
              <div
                key={rack.rack_no}
                className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] overflow-hidden"
              >
                <div className="px-3 py-2 bg-[#F8F9FA] border-b border-[rgba(0,0,0,0.06)] flex items-center gap-2">
                  <span className="text-[12px] font-bold text-[#B32646]">
                    📍 {rack.rack_no}
                  </span>
                  <span className="text-[10px] text-[#94A3B8]">
                    {Object.values(rack.shelves).flat().length}개 품목
                  </span>
                </div>
                <div className="p-2">
                  {shelvesSorted.map(([shelfName, shelfItems]) => (
                    <div key={shelfName} className="mb-2 last:mb-0">
                      <div className="text-[10px] text-[#64748B] font-medium mb-1 px-1">
                        선반 {shelfName}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1">
                        {shelfItems.map(item => (
                          <ItemChip
                            key={item.id}
                            item={item}
                            onClick={() => setSelected(item)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {/* 위치 미지정 */}
          {noRack.length > 0 && (
            <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] overflow-hidden">
              <div className="px-3 py-2 bg-[#F8F9FA] border-b border-[rgba(0,0,0,0.06)] flex items-center gap-2">
                <span className="text-[12px] font-bold text-[#94A3B8]">📦 위치 미지정</span>
                <span className="text-[10px] text-[#94A3B8]">{noRack.length}개 품목</span>
              </div>
              <div className="p-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1">
                {noRack.map(item => (
                  <ItemChip key={item.id} item={item} onClick={() => setSelected(item)} />
                ))}
              </div>
            </div>
          )}
        </div>
        </div>
      )}

      {/* 약도 렉 상세 (선반·박스번호) */}
      {selectedRack && (
        <RackDetailModal
          rackNo={selectedRack.rackNo}
          label={selectedRack.label}
          items={items}
          terminals={terminals}
          onBoxClick={b => setSelectedBox({ rackNo: selectedRack.rackNo, ...b })}
          onClose={() => setSelectedRack(null)}
        />
      )}

      {/* 박스 내용물 팝업 */}
      {selectedBox && (
        <BoxContentModal
          rackNo={selectedBox.rackNo}
          shelf={selectedBox.shelf}
          boxNo={selectedBox.boxNo}
          items={selectedBox.items}
          terminals={terminals}
          onItemClick={it => { setSelected(it); setSelectedBox(null) }}
          onClose={() => setSelectedBox(null)}
        />
      )}

      {selected && (
        <ItemModal
          item={selected}
          canEdit={canEdit}
          location={center}
          onClose={() => setSelected(null)}
          onSaved={() => { setSelected(null); reload(center) }}
          onBoxChanged={async () => {
            const data = await reload(center)
            // 모달에 표시 중인 박스의 최신 수량으로 갱신 → 단말기 IH 추가 즉시 수량 반영
            if (data) setSelected(prev => (prev ? data.find(i => i.id === prev.id) ?? prev : prev))
          }}
        />
      )}
    </div>
  )
}
