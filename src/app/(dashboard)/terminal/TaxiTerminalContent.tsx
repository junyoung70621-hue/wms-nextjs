'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Upload, Pencil, ChevronDown, ChevronRight, Wrench, PackageCheck,
  Truck, PackageX, X, Ban, Send,
} from 'lucide-react'
import type { SessionUser } from '@/lib/session'
import {
  classifyTaxi, normalizeTrcnId, findTrcnIndex, countByDevice,
  TAXI_DEVICE_ORDER, DRIVER_PRIORITY,
  type TaxiMovement, type TaxiDelivery, type TaxiStatus, type DriverGroup,
} from '@/lib/taxiTracking'

// ── 날짜 유틸 (KST) ────────────────────────────────────────────────────────────
function kstToday(): string {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
}
function daysAgo(n: number): string {
  return new Date(Date.now() + 9 * 3600000 - n * 86400000).toISOString().slice(0, 10)
}

async function fetchMovements(params: Record<string, string>): Promise<TaxiMovement[]> {
  const r = await fetch(`/api/taxi/movements?${new URLSearchParams(params)}`)
  const d = await r.json()
  return d.data ?? []
}

// 엑셀 → TRCN_ID 목록 (헤더 자동 감지)
function parseExcelFile(file: File): Promise<{ ids: string[]; detected: boolean }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target!.result as ArrayBuffer), { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
        let headerRow = -1, col = -1
        for (let i = 0; i < Math.min(aoa.length, 20); i++) {
          const idx = findTrcnIndex(aoa[i])
          if (idx >= 0) { headerRow = i; col = idx; break }
        }
        if (col < 0) { resolve({ ids: [], detected: false }); return }
        const ids: string[] = []
        for (let k = headerRow + 1; k < aoa.length; k++) {
          const v = normalizeTrcnId(aoa[k][col])
          if (v) ids.push(v)
        }
        resolve({ ids, detected: true })
      } catch (e) { reject(e) }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

interface Perms { userId: string; center: string; isAdmin: boolean; canWrite: boolean }

// ── 공통: 기종 카운트 칩 ────────────────────────────────────────────────────────
function DeviceChips({ items }: { items: { device_type: string }[] }) {
  const counts = countByDevice(items)
  if (!counts.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {counts.map(c => (
        <span key={c.device} className="px-2 py-0.5 rounded bg-[#F1F5F9] text-[11px] text-[#475569]">
          {c.device} <b className="text-[#B32646]">{c.count}</b>
        </span>
      ))}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 메인
// ══════════════════════════════════════════════════════════════════════════════
export default function TaxiTerminalContent({ user }: { user: SessionUser }) {
  const center = user.assigned_center ?? user.center
  const perms: Perms = useMemo(() => {
    const isAdmin = user.role === 'admin'
    const canWrite = isAdmin || (center === '자재센터' && user.role !== 'guest')
    return { userId: user.id, center, isAdmin, canWrite }
  }, [user, center])

  return (
    <div className="space-y-4">
      <Tabs defaultValue="status">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="status" className="text-[12px]">📊 현황</TabsTrigger>
          <TabsTrigger value="history" className="text-[12px]">📋 이력 조회</TabsTrigger>
          <TabsTrigger value="delivery" className="text-[12px]">🚚 배송 이력</TabsTrigger>
        </TabsList>

        <TabsContent value="status" className="mt-4"><StatusTab perms={perms} /></TabsContent>
        <TabsContent value="history" className="mt-4"><HistoryTab perms={perms} /></TabsContent>
        <TabsContent value="delivery" className="mt-4"><DeliveryTab perms={perms} /></TabsContent>
      </Tabs>
    </div>
  )
}

// ── 탭1: 현황 ─────────────────────────────────────────────────────────────────
function MetricCard({ icon: Icon, label, value, sub, color }: {
  icon: typeof Wrench; label: string; value: number; sub?: string; color: string
}) {
  return (
    <div className="bg-white rounded-lg border border-[#e2e8f0] p-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
           style={{ background: color + '18' }}>
        <Icon size={18} strokeWidth={2} style={{ color }} />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] text-[#64748B] truncate">{label}</div>
        <div className="flex items-baseline gap-1">
          <span className="text-[22px] font-bold leading-none font-heading" style={{ color }}>{value.toLocaleString()}</span>
          <span className="text-[11px] text-[#94A3B8]">대</span>
          {sub && <span className="text-[10px] text-[#94A3B8] ml-1">{sub}</span>}
        </div>
      </div>
    </div>
  )
}

// ── 표 정렬 (재사용) ─────────────────────────────────────────────────────────
type SortDir = 'asc' | 'desc'
function useSort<T extends Record<string, unknown>>(items: T[]) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const sorted = useMemo(() => {
    if (!sortKey) return items
    const k = sortKey
    return [...items].sort((a, b) => {
      const va = a[k], vb = b[k]
      let c: number
      if (typeof va === 'boolean' || typeof vb === 'boolean') c = (va ? 1 : 0) - (vb ? 1 : 0)
      else if (typeof va === 'number' && typeof vb === 'number') c = va - vb
      else c = String(va ?? '').localeCompare(String(vb ?? ''), 'ko', { numeric: true })
      return sortDir === 'asc' ? c : -c
    })
  }, [items, sortKey, sortDir])
  const toggle = (key: string) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }
  return { sorted, sortKey, sortDir, toggle }
}

function SortTh({ label, field, sortKey, sortDir, onSort, className }: {
  label: string; field: string; sortKey: string | null; sortDir: SortDir; onSort: (k: string) => void; className?: string
}) {
  const active = sortKey === field
  return (
    <th className={`${className ?? 'px-2 py-1.5 text-left font-semibold'} cursor-pointer select-none hover:text-[#1E293B]`}
        onClick={() => onSort(field)} title="클릭하여 정렬">
      <span className="inline-flex items-center gap-0.5">{label}
        <span className="text-[8px] text-[#94A3B8]">{active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </span>
    </th>
  )
}

function StatusTab({ perms }: { perms: Perms }) {
  const [st, setSt] = useState<TaxiStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [repairSel, setRepairSel] = useState<Set<string>>(new Set())
  const [storeSel, setStoreSel] = useState<Set<string>>(new Set())
  const [storeOpen, setStoreOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [deliverGroup, setDeliverGroup] = useState<DriverGroup | null>(null)
  const [uploadDir, setUploadDir] = useState<'in' | 'out' | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setMsg('')
    const r = await fetch('/api/taxi/status')
    const d = await r.json()
    if (d.error) { setMsg(d.error); setSt(null) }
    else { setSt(d); setRepairSel(new Set()) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function markRepairDone() {
    if (!repairSel.size) return
    setBusy(true); setMsg('')
    const r = await fetch('/api/taxi/repair', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...repairSel] }),
    })
    const d = await r.json()
    setMsg(d.error ? `❌ ${d.error}` : `✅ 수리완료 ${d.updated}건 → 자재센터 보관`)
    setBusy(false)
    if (!d.error) load()
  }

  if (loading) return <div className="text-[12px] text-[#94A3B8] py-8 text-center">불러오는 중…</div>
  if (!st) return <div className="text-[12px] text-[#c62828] py-8 text-center">{msg || '데이터를 불러오지 못했습니다.'}</div>

  const m = st.metrics
  return (
    <div className="space-y-4">
      {/* 메트릭 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard icon={Wrench} label="🔧 수리중" value={m.repairing} color="#f59e0b" />
        <MetricCard icon={PackageCheck} label="📦 자재센터 보관(출고대기)" value={m.stored} color="#1565c0" />
        <MetricCard icon={Truck} label="📤 양품출고 합계" value={m.outTotal} color="#16a34a" />
        <MetricCard icon={PackageX} label="📥 불량입고 합계" value={m.inTotal}
          sub={m.terminated ? `해지 ${m.terminated}` : undefined} color="#B32646" />
      </div>

      <div className="flex items-center gap-2">
        {perms.canWrite && (
          <>
            <Button type="button" className="h-8 text-[12px] gap-1.5 bg-[#B32646] hover:bg-[#9a1f3c] text-white"
                    onClick={() => setUploadDir('in')}>
              <PackageX size={14} strokeWidth={2} /> 불량입고
            </Button>
            <Button type="button" className="h-8 text-[12px] gap-1.5 bg-[#16a34a] hover:bg-[#15803d] text-white"
                    onClick={() => setUploadDir('out')}>
              <Truck size={14} strokeWidth={2} /> 양품출고
            </Button>
          </>
        )}
        <Button type="button" variant="outline" className="h-8 text-[12px] ml-auto" onClick={load}>새로고침</Button>
      </div>
      {msg && <div className="text-[12px] text-[#475569]">{msg}</div>}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* 자재센터 측 */}
        <div className="space-y-4">
          {/* 수리중 */}
          <div className="bg-white rounded-lg border border-[#e2e8f0] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[13px] font-bold text-[#1E293B]">🔧 수리중 <span className="text-[#94A3B8] font-normal">({st.repairing.length})</span></div>
              {perms.canWrite && st.repairing.length > 0 && (
                <Button type="button" className="h-7 text-[11px]" disabled={busy || !repairSel.size}
                        onClick={markRepairDone}>
                  수리완료 처리 ({repairSel.size})
                </Button>
              )}
            </div>
            <DeviceChips items={st.repairing} />
            <ItemTable items={st.repairing} selectable={perms.canWrite}
              selected={repairSel} onToggle={id => setRepairSel(prev => {
                const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n
              })}
              onToggleAll={ids => setRepairSel(prev => prev.size === ids.length ? new Set() : new Set(ids))} />
          </div>

          {/* 자재센터 보관 */}
          <div className="bg-white rounded-lg border border-[#e2e8f0] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[13px] font-bold text-[#1E293B]">📦 자재센터 보관 (출고 대기) <span className="text-[#94A3B8] font-normal">({st.stored.length})</span></div>
              {perms.canWrite && st.stored.length > 0 && (
                <Button type="button" variant="outline" className="h-7 text-[11px] gap-1"
                        disabled={!storeSel.size} onClick={() => setStoreOpen(true)}>
                  <PackageCheck size={12} strokeWidth={2} /> 자재창고 보관 ({storeSel.size})
                </Button>
              )}
            </div>
            <DeviceChips items={st.stored} />
            <ItemTable items={st.stored} selectable={perms.canWrite}
              selected={storeSel} onToggle={id => setStoreSel(prev => {
                const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n
              })}
              onToggleAll={ids => setStoreSel(prev => prev.size === ids.length ? new Set() : new Set(ids))} />
            {perms.canWrite && st.stored.length > 0 && (
              <div className="text-[11px] text-[#94A3B8]">※ 체크 후 「자재창고 보관」으로 랙·박스를 지정하면 자재창고 지도 해당 박스에 들어갑니다. 출고는 「양품출고」에서 진행하세요.</div>
            )}
          </div>
        </div>

        {/* 기사 보유 재고 */}
        <div className="bg-white rounded-lg border border-[#e2e8f0] p-4 space-y-3">
          <div className="text-[13px] font-bold text-[#1E293B]">🚗 물류기사 재고현황
            <span className="text-[#94A3B8] font-normal"> ({st.drivers.reduce((a, g) => a + g.count, 0)})</span>
          </div>
          {st.drivers.length === 0 ? (
            <div className="text-[11px] text-[#94A3B8] py-3 text-center bg-[#F8F9FA] rounded">기사 보유 재고 없음</div>
          ) : st.drivers.map(g => (
            <DriverCard key={g.driver} group={g} canWrite={perms.canWrite}
              onDeliver={() => setDeliverGroup(g)} />
          ))}
        </div>
      </div>

      {uploadDir && (
        <UploadModal direction={uploadDir} onClose={() => setUploadDir(null)} onSaved={load} />
      )}

      {deliverGroup && (
        <DeliveryModal group={deliverGroup} onClose={() => setDeliverGroup(null)}
          onDone={() => { setDeliverGroup(null); load() }} />
      )}

      {storeOpen && (
        <StoreModal
          items={st.stored.filter(s => storeSel.has(s.id)).map(s => ({ trcn_id: s.trcn_id, device_type: s.device_type }))}
          onClose={() => setStoreOpen(false)}
          onDone={(m) => { setStoreOpen(false); setStoreSel(new Set()); setMsg(m) }}
        />
      )}
    </div>
  )
}

// 자재창고 보관: 선택한 보관 단말기를 랙·박스에 일괄 지정
function StoreModal({ items, onClose, onDone }: {
  items: { trcn_id: string; device_type: string }[]
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const [rackNo, setRackNo] = useState('')
  const [shelf, setShelf] = useState('')
  const [boxNo, setBoxNo] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function submit() {
    if (!rackNo.trim() || !boxNo.trim()) { setMsg('랙 번호와 박스 번호를 입력하세요.'); return }
    setBusy(true); setMsg('')
    try {
      const res = await fetch('/api/box-terminals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: '자재센터', rack_no: rackNo.trim(), shelf: shelf.trim() || null, box_no: boxNo.trim(),
          items,
        }),
      })
      const d = await res.json()
      setBusy(false)
      if (!res.ok) { setMsg(`❌ ${d.error}`); return }
      onDone(`✅ ${d.stored}개 단말기를 랙 ${rackNo}${shelf ? ` · 선반 ${shelf}` : ''} · 박스 ${boxNo}에 보관했습니다.`)
    } catch { setBusy(false); setMsg('저장 실패') }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-lg w-[440px] max-w-full my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E2E8F0]">
          <div className="text-[13px] font-bold text-[#1E293B] flex items-center gap-1.5">
            <PackageCheck size={15} className="text-[#1565c0]" /> 자재창고 보관 — {items.length}개
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded text-[#64748B] hover:bg-[#F1F5F9]"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-[11px] text-[#94A3B8]">선택한 단말기를 자재창고의 특정 랙·박스에 지정합니다. (자재창고 지도 해당 박스에 표시됨)</p>
          <div className="flex flex-wrap gap-2">
            <div>
              <label className="text-[11px] text-[#64748B] block mb-0.5">랙 번호 <span className="text-[#B32646]">*</span></label>
              <input value={rackNo} onChange={e => setRackNo(e.target.value)} placeholder="예: 10-1"
                className="h-8 text-[12px] border border-[#E2E8F0] rounded px-2 bg-white w-28" />
            </div>
            <div>
              <label className="text-[11px] text-[#64748B] block mb-0.5">선반</label>
              <input value={shelf} onChange={e => setShelf(e.target.value)} placeholder="예: 3"
                className="h-8 text-[12px] border border-[#E2E8F0] rounded px-2 bg-white w-20" />
            </div>
            <div>
              <label className="text-[11px] text-[#64748B] block mb-0.5">박스 번호 <span className="text-[#B32646]">*</span></label>
              <input value={boxNo} onChange={e => setBoxNo(e.target.value)} placeholder="예: 9"
                className="h-8 text-[12px] border border-[#E2E8F0] rounded px-2 bg-white w-24" />
            </div>
          </div>
          <div className="max-h-44 overflow-y-auto rounded border border-[#E2E8F0]">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-[#F8F9FA] text-[#64748B]"><tr>
                <th className="px-2 py-1.5 text-left font-semibold">TRCN_ID</th>
                <th className="px-2 py-1.5 text-left font-semibold">기종</th>
              </tr></thead>
              <tbody>
                {items.map(it => (
                  <tr key={it.trcn_id} className="border-t border-[#F1F5F9]">
                    <td className="px-2 py-1 font-mono text-[#475569]">{it.trcn_id}</td>
                    <td className="px-2 py-1 text-[#1E293B]">{it.device_type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {msg && <div className="text-[11px] text-[#c62828]">{msg}</div>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="h-8 text-[12px]" onClick={onClose}>취소</Button>
            <Button type="button" className="h-8 text-[12px]" disabled={busy || !items.length} onClick={submit}>
              {busy ? '저장 중…' : `보관 (${items.length})`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// 입·출고 업로드 모달 (입고/출고 버튼 → 팝업)
function UploadModal({ direction, onClose, onSaved }: {
  direction: 'in' | 'out'; onClose: () => void; onSaved: () => void
}) {
  const isIn = direction === 'in'
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-lg w-[560px] max-w-full my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E2E8F0]">
          <div className="text-[13px] font-bold text-[#1E293B] flex items-center gap-1.5">
            {isIn ? <><PackageX size={15} className="text-[#B32646]" /> 불량입고</> : <><Truck size={15} className="text-[#16a34a]" /> 양품출고</>}
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded text-[#64748B] hover:bg-[#F1F5F9]"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-2">
          <p className="text-[11px] text-[#94A3B8]">
            {isIn ? '현장에서 회수한 불량 단말기를 자재센터로 입고합니다. 행별로 해지 여부를 체크하세요.'
                  : '수리완료된 양품을 담당기사에게 출고합니다.'}
          </p>
          {isIn ? <InboundPanel onSaved={onSaved} /> : <OutboundPanel onSaved={onSaved} />}
        </div>
      </div>
    </div>
  )
}

// 단말기 목록 테이블 (수리중/보관 공용)
function ItemTable({ items, selectable, selected, onToggle, onToggleAll }: {
  items: { id: string; trcn_id: string; device_type: string; upload_date: string; is_terminated: boolean }[]
  selectable?: boolean
  selected?: Set<string>
  onToggle?: (id: string) => void
  onToggleAll?: (ids: string[]) => void
}) {
  const { sorted, sortKey, sortDir, toggle } = useSort(items)
  if (!items.length) return <div className="text-[11px] text-[#94A3B8] py-3 text-center bg-[#F8F9FA] rounded">없음</div>
  const ids = items.map(i => i.id)
  return (
    <div className="overflow-x-auto rounded border border-[#E2E8F0] max-h-72">
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 bg-[#F8F9FA] text-[#64748B]">
          <tr>
            {selectable && (
              <th className="px-2 py-1.5 w-8">
                <input type="checkbox" checked={!!selected && selected.size === ids.length && ids.length > 0}
                  onChange={() => onToggleAll?.(ids)} className="cursor-pointer" />
              </th>
            )}
            <SortTh label="TRCN_ID" field="trcn_id" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
            <SortTh label="기종" field="device_type" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
            <SortTh label="입고일" field="upload_date" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
            <SortTh label="해지" field="is_terminated" sortKey={sortKey} sortDir={sortDir} onSort={toggle}
              className="px-2 py-1.5 text-center font-semibold" />
          </tr>
        </thead>
        <tbody>
          {sorted.map(it => (
            <tr key={it.id} className="border-t border-[#F1F5F9]">
              {selectable && (
                <td className="px-2 py-1.5 text-center">
                  <input type="checkbox" checked={!!selected?.has(it.id)}
                    onChange={() => onToggle?.(it.id)} className="cursor-pointer" />
                </td>
              )}
              <td className="px-2 py-1.5 font-mono text-[#475569]">{it.trcn_id}</td>
              <td className="px-2 py-1.5 text-[#1E293B]">{it.device_type}</td>
              <td className="px-2 py-1.5 text-[#94A3B8]">{it.upload_date}</td>
              <td className="px-2 py-1.5 text-center">
                {it.is_terminated && <span className="text-[10px] font-bold text-white bg-[#c62828] rounded px-1.5 py-0.5">해지</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DriverCard({ group, canWrite, onDeliver }: { group: DriverGroup; canWrite: boolean; onDeliver: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-[#E2E8F0] rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-[#f8f9ff]">
        <button type="button" onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1.5 text-[12px] font-semibold text-[#1E293B] hover:text-[#B32646]">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {group.driver}
          <span className="text-[#B32646] font-bold">{group.count}</span>
        </button>
        <div className="ml-auto flex items-center gap-2">
          <DeviceChips items={group.items} />
          {canWrite && (
            <Button type="button" variant="outline" className="h-7 text-[11px] gap-1" onClick={onDeliver}>
              <Send size={12} strokeWidth={1.9} /> 배송완료
            </Button>
          )}
        </div>
      </div>
      {open && (
        <div className="px-3 py-2 flex flex-wrap gap-1.5">
          {group.items.map(it => (
            <span key={it.out_id} className="px-2 py-0.5 rounded bg-white border border-[#E2E8F0] text-[10px] text-[#475569]">
              <span className="font-mono">{it.trcn_id}</span>
              <span className="text-[#94A3B8] ml-1">{it.device_type}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// 배송완료 모달
function DeliveryModal({ group, onClose, onDone }: { group: DriverGroup; onClose: () => void; onDone: () => void }) {
  const [sel, setSel] = useState<Set<string>>(new Set(group.items.map(i => i.trcn_id)))
  const [date, setDate] = useState(kstToday())
  const [dealer, setDealer] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const { sorted, sortKey, sortDir, toggle } = useSort(group.items)

  async function submit() {
    const rows = group.items.filter(i => sel.has(i.trcn_id))
      .map(i => ({ trcn_id: i.trcn_id, device_type: i.device_type, driver_name: group.driver }))
    if (!rows.length) { setMsg('선택된 단말기가 없습니다.'); return }
    setBusy(true); setMsg('')
    const r = await fetch('/api/taxi/deliveries', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delivery_date: date, dealer_name: dealer, rows }),
    })
    const d = await r.json()
    setBusy(false)
    if (d.error) { setMsg(`❌ ${d.error}`); return }
    onDone()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-lg w-[520px] max-w-full my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E2E8F0]">
          <div className="text-[13px] font-bold text-[#1E293B]">🚚 배송완료 처리 — {group.driver}</div>
          <button type="button" onClick={onClose} className="p-1 rounded text-[#64748B] hover:bg-[#F1F5F9]"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="text-[11px] text-[#64748B] block mb-0.5">배송 날짜</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="h-8 text-[12px] border border-[#E2E8F0] rounded px-2" />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="text-[11px] text-[#64748B] block mb-0.5">대리점/인계처 (선택)</label>
              <Input value={dealer} onChange={e => setDealer(e.target.value)} className="h-8 text-[12px]" placeholder="예: ○○대리점" />
            </div>
          </div>
          <div className="text-[11px] text-[#64748B]">배송 처리할 단말기 ({sel.size}/{group.items.length})</div>
          <div className="max-h-60 overflow-y-auto rounded border border-[#E2E8F0]">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-[#F8F9FA] text-[#64748B]"><tr>
                <th className="px-2 py-1.5 w-8">
                  <input type="checkbox" checked={sel.size === group.items.length}
                    onChange={() => setSel(sel.size === group.items.length ? new Set() : new Set(group.items.map(i => i.trcn_id)))}
                    className="cursor-pointer" />
                </th>
                <SortTh label="TRCN_ID" field="trcn_id" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
                <SortTh label="기종" field="device_type" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
              </tr></thead>
              <tbody>
                {sorted.map(it => (
                  <tr key={it.out_id} className="border-t border-[#F1F5F9]">
                    <td className="px-2 py-1.5 text-center">
                      <input type="checkbox" checked={sel.has(it.trcn_id)}
                        onChange={() => setSel(prev => { const n = new Set(prev); if (n.has(it.trcn_id)) n.delete(it.trcn_id); else n.add(it.trcn_id); return n })}
                        className="cursor-pointer" />
                    </td>
                    <td className="px-2 py-1.5 font-mono text-[#475569]">{it.trcn_id}</td>
                    <td className="px-2 py-1.5 text-[#1E293B]">{it.device_type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {msg && <div className="text-[11px] text-[#c62828]">{msg}</div>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="h-8 text-[12px]" onClick={onClose}>취소</Button>
            <Button type="button" className="h-8 text-[12px]" disabled={busy || !sel.size} onClick={submit}>
              {busy ? '처리 중…' : `배송완료 (${sel.size})`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// 불량입고 패널 (행별 해지)
function InboundPanel({ onSaved }: { onSaved: () => void }) {
  const [date, setDate] = useState(kstToday())
  const [rows, setRows] = useState<{ id: string; terminated: boolean }[]>([])
  const [fileName, setFileName] = useState('')
  const [manual, setManual] = useState('')
  const [notes, setNotes] = useState('')
  const [force, setForce] = useState(false)
  const [dups, setDups] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const classified = useMemo(() => rows.map(r => ({ ...r, device: classifyTaxi(r.id) })), [rows])
  const invalid = classified.filter(c => c.device === '미분류').length
  const { sorted: sortedRows, sortKey, sortDir, toggle } = useSort(classified)

  function setIds(ids: string[]) {
    setRows(ids.map(id => ({ id, terminated: false })))
    setMsg(''); setDups(null); setForce(false)
  }
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    setFileName(f.name)
    try {
      const { ids, detected } = await parseExcelFile(f)
      if (!detected) { setMsg('단말기ID 컬럼을 찾지 못했습니다.'); setRows([]); return }
      setIds(ids)
    } catch { setMsg('파일 읽기 실패'); setRows([]) }
  }
  function applyManual() {
    setIds(manual.split(/[\n,\s]+/).map(normalizeTrcnId).filter(Boolean)); setFileName('')
  }

  async function save() {
    if (!rows.length) { setMsg('단말기ID가 없습니다.'); return }
    setBusy(true); setMsg('')
    try {
      const ids = rows.map(r => r.id)
      if (dups === null) {
        const r = await fetch('/api/taxi/movements/check', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ direction: 'in', upload_date: date, trcn_ids: ids }),
        })
        const dl: string[] = (await r.json()).dups ?? []
        setDups(dl)
        if (dl.length && !force) {
          setMsg(`중복 ${dl.length}건. "중복 무시" 체크 후 다시 저장하세요.`); setBusy(false); return
        }
      }
      const r = await fetch('/api/taxi/movements', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          direction: 'in', upload_date: date, file_name: fileName || null, notes: notes || null,
          items: rows.map(x => ({ trcn_id: x.id, is_terminated: x.terminated })), force,
        }),
      })
      const d = await r.json()
      if (d.error) { setMsg(d.error); setBusy(false); return }
      let mm = `저장 완료: ${d.inserted}건`
      if (d.unclassified) mm += ` · 미분류 ${d.unclassified}건`
      if (d.dups) mm += ` · 중복 ${d.dups}건`
      if (d.removedFromBox) mm += ` · 박스에서 ${d.removedFromBox}개 제거`
      setMsg(mm)
      setRows([]); setFileName(''); setManual(''); setNotes(''); setDups(null); setForce(false)
      if (fileRef.current) fileRef.current.value = ''
      onSaved()
    } catch { setMsg('저장 실패') }
    setBusy(false)
  }

  const termCount = rows.filter(r => r.terminated).length
  return (
    <div className="space-y-3 p-3 bg-[#FAFAFA] rounded-lg border border-[#E2E8F0]">
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="text-[11px] text-[#64748B] block mb-0.5">입고 날짜</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="h-8 text-[12px] border border-[#E2E8F0] rounded px-2 bg-white" />
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
        <Button type="button" variant="outline" className="h-8 text-[12px] gap-1.5" onClick={() => fileRef.current?.click()}>
          <Upload size={14} /> 엑셀
        </Button>
        <span className="text-[11px] text-[#64748B] truncate max-w-[140px] self-center">{fileName || '파일 없음'}</span>
      </div>
      <div className="flex gap-2">
        <textarea value={manual} onChange={e => setManual(e.target.value)} rows={2}
          className="flex-1 text-[12px] border border-[#E2E8F0] rounded px-2 py-1 bg-white" placeholder="직접 입력 (줄바꿈/쉼표): 182100001, ..." />
        <Button type="button" variant="outline" className="h-8 text-[12px] self-end" onClick={applyManual}>적용</Button>
      </div>

      {rows.length > 0 && (
        <>
          <div className="text-[11px] flex flex-wrap gap-3">
            <span className="text-[#16a34a]">유효 <b>{rows.length - invalid}</b></span>
            {invalid > 0 && <span className="text-[#c62828]">미분류 <b>{invalid}</b></span>}
            <span className="text-[#94A3B8]">전체 {rows.length}</span>
            <span className="text-[#c62828] ml-auto">해지 {termCount}</span>
          </div>
          <div className="max-h-52 overflow-y-auto rounded border border-[#E2E8F0]">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-[#F8F9FA] text-[#64748B]"><tr>
                <SortTh label="TRCN_ID" field="id" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
                <SortTh label="기종" field="device" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
                <SortTh label="해지" field="terminated" sortKey={sortKey} sortDir={sortDir} onSort={toggle}
                  className="px-2 py-1.5 text-center font-semibold" />
              </tr></thead>
              <tbody>
                {sortedRows.map((c, i) => (
                  <tr key={`${c.id}-${i}`} className="border-t border-[#F1F5F9]">
                    <td className="px-2 py-1 font-mono text-[#475569]">{c.id}</td>
                    <td className={`px-2 py-1 ${c.device === '미분류' ? 'text-[#c62828]' : 'text-[#1E293B]'}`}>{c.device}</td>
                    <td className="px-2 py-1 text-center">
                      <input type="checkbox" checked={c.terminated} className="cursor-pointer"
                        onChange={() => setRows(prev => prev.map(r => r.id === c.id ? { ...r, terminated: !r.terminated } : r))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Input value={notes} onChange={e => setNotes(e.target.value)} className="h-8 text-[12px] bg-white" placeholder="비고 (선택)" />

      {dups !== null && dups.length > 0 && (
        <div className="flex items-center gap-2 text-[11px]">
          <Checkbox checked={force} onCheckedChange={v => setForce(!!v)} id="force-in" />
          <label htmlFor="force-in" className="text-[#c62828]">중복 {dups.length}건 무시하고 강제 저장</label>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button type="button" className="h-8 text-[12px]" disabled={busy || !rows.length} onClick={save}>{busy ? '저장 중…' : '입고 저장'}</Button>
        {msg && <span className="text-[11px] text-[#475569]">{msg}</span>}
      </div>
    </div>
  )
}

const DRIVER_OPTIONS = [...DRIVER_PRIORITY]

// 양품출고 패널 (담당기사 일괄)
function OutboundPanel({ onSaved }: { onSaved: () => void }) {
  const [date, setDate] = useState(kstToday())
  const [driver, setDriver] = useState('')
  const [ids, setIds] = useState<string[]>([])
  const [fileName, setFileName] = useState('')
  const [manual, setManual] = useState('')
  const [notes, setNotes] = useState('')
  const [force, setForce] = useState(false)
  const [dups, setDups] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const classified = useMemo(() => ids.map(id => ({ id, device: classifyTaxi(id) })), [ids])
  const invalid = classified.filter(c => c.device === '미분류').length

  function reset(newIds: string[]) { setIds(newIds); setMsg(''); setDups(null); setForce(false) }
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    setFileName(f.name)
    try {
      const { ids: parsed, detected } = await parseExcelFile(f)
      if (!detected) { setMsg('단말기ID 컬럼을 찾지 못했습니다.'); setIds([]); return }
      reset(parsed)
    } catch { setMsg('파일 읽기 실패'); setIds([]) }
  }
  function applyManual() { reset(manual.split(/[\n,\s]+/).map(normalizeTrcnId).filter(Boolean)); setFileName('') }

  async function save() {
    if (!ids.length) { setMsg('단말기ID가 없습니다.'); return }
    if (!driver.trim()) { setMsg('담당기사를 입력하세요.'); return }
    setBusy(true); setMsg('')
    try {
      if (dups === null) {
        const r = await fetch('/api/taxi/movements/check', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ direction: 'out', upload_date: date, trcn_ids: ids }),
        })
        const dl: string[] = (await r.json()).dups ?? []
        setDups(dl)
        if (dl.length && !force) { setMsg(`중복 ${dl.length}건. "중복 무시" 체크 후 다시 저장하세요.`); setBusy(false); return }
      }
      const r = await fetch('/api/taxi/movements', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction: 'out', upload_date: date, driver_name: driver,
          file_name: fileName || null, notes: notes || null, trcn_ids: ids, force }),
      })
      const d = await r.json()
      if (d.error) { setMsg(d.error); setBusy(false); return }
      let mm = `출고 완료: ${d.inserted}건 (${driver})`
      if (d.unclassified) mm += ` · 미분류 ${d.unclassified}건`
      if (d.dups) mm += ` · 중복 ${d.dups}건`
      if (d.removedFromBox) mm += ` · 박스에서 ${d.removedFromBox}개 제거`
      setMsg(mm)
      setIds([]); setFileName(''); setManual(''); setNotes(''); setDups(null); setForce(false)
      if (fileRef.current) fileRef.current.value = ''
      onSaved()
    } catch { setMsg('저장 실패') }
    setBusy(false)
  }

  return (
    <div className="space-y-3 p-3 bg-[#FAFAFA] rounded-lg border border-[#E2E8F0]">
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="text-[11px] text-[#64748B] block mb-0.5">출고 날짜</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="h-8 text-[12px] border border-[#E2E8F0] rounded px-2 bg-white" />
        </div>
        <div>
          <label className="text-[11px] text-[#64748B] block mb-0.5">담당기사 <span className="text-[#B32646]">*</span></label>
          <Select value={driver} onValueChange={v => v !== null && setDriver(v)}>
            <SelectTrigger className="h-8 text-[12px] w-32 bg-white"><SelectValue placeholder="기사 선택" /></SelectTrigger>
            <SelectContent>{DRIVER_OPTIONS.map(d => <SelectItem key={d} value={d} className="text-[12px]">{d}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 items-end">
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
        <Button type="button" variant="outline" className="h-8 text-[12px] gap-1.5" onClick={() => fileRef.current?.click()}>
          <Upload size={14} /> 엑셀
        </Button>
        <span className="text-[11px] text-[#64748B] truncate max-w-[140px] self-center">{fileName || '파일 없음'}</span>
      </div>
      <div className="flex gap-2">
        <textarea value={manual} onChange={e => setManual(e.target.value)} rows={2}
          className="flex-1 text-[12px] border border-[#E2E8F0] rounded px-2 py-1 bg-white" placeholder="직접 입력 (줄바꿈/쉼표): 182100001, ..." />
        <Button type="button" variant="outline" className="h-8 text-[12px] self-end" onClick={applyManual}>적용</Button>
      </div>

      {ids.length > 0 && (
        <div className="text-[11px] flex flex-wrap gap-3">
          <span className="text-[#16a34a]">유효 <b>{ids.length - invalid}</b></span>
          {invalid > 0 && <span className="text-[#c62828]">미분류 <b>{invalid}</b></span>}
          <span className="text-[#94A3B8]">전체 {ids.length}</span>
        </div>
      )}

      <Input value={notes} onChange={e => setNotes(e.target.value)} className="h-8 text-[12px] bg-white" placeholder="비고 (선택)" />

      {dups !== null && dups.length > 0 && (
        <div className="flex items-center gap-2 text-[11px]">
          <Checkbox checked={force} onCheckedChange={v => setForce(!!v)} id="force-out" />
          <label htmlFor="force-out" className="text-[#c62828]">중복 {dups.length}건 무시하고 강제 저장</label>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button type="button" className="h-8 text-[12px]" disabled={busy || !ids.length || !driver} onClick={save}>{busy ? '저장 중…' : '출고 저장'}</Button>
        {msg && <span className="text-[11px] text-[#475569]">{msg}</span>}
      </div>
    </div>
  )
}

// ── 탭3: 이력 조회 (+ 수정/삭제) ──────────────────────────────────────────────
function exportMovements(rows: TaxiMovement[], from: string, to: string) {
  const data = rows.map(r => ({
    이동날짜: r.upload_date, 방향: r.direction === 'out' ? '출고' : '입고',
    기종: r.device_type, TRCN_ID: r.trcn_id, 담당기사: r.driver_name ?? '',
    해지: r.is_terminated ? 'Y' : '', 수리완료: r.is_repair_done ? 'Y' : '', 파일명: r.file_name ?? '',
  }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), '이력')
  XLSX.writeFile(wb, `택시단말기이력_${from}_${to}.xlsx`)
}

function HistoryTab({ perms }: { perms: Perms }) {
  const [from, setFrom] = useState(daysAgo(30))
  const [to, setTo] = useState(kstToday())
  const [dir, setDir] = useState('전체')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<TaxiMovement[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState<TaxiMovement | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params: Record<string, string> = { from, to, limit: '5000' }
    if (dir === '출고') params.direction = 'out'
    if (dir === '입고') params.direction = 'in'
    setRows(await fetchMovements(params)); setLoading(false)
  }, [from, to, dir])
  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter(r => [r.trcn_id, r.device_type, r.driver_name ?? '', r.file_name ?? ''].some(v => String(v).toLowerCase().includes(q)))
  }, [rows, search])

  async function delOne(id: string) {
    if (!confirm('이 레코드를 삭제할까요?')) return
    setBusy(true)
    await fetch('/api/taxi/movements', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
    })
    setBusy(false); load()
  }

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-lg border border-[#e2e8f0] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-8 text-[12px] border border-[#E2E8F0] rounded px-2" />
          <span className="text-[#94A3B8]">~</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-8 text-[12px] border border-[#E2E8F0] rounded px-2" />
          <Select value={dir} onValueChange={v => v !== null && setDir(v)}>
            <SelectTrigger className="h-8 text-[12px] w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{['전체', '출고', '입고'].map(d => <SelectItem key={d} value={d} className="text-[12px]">{d}</SelectItem>)}</SelectContent>
          </Select>
          <Button type="button" variant="outline" className="h-8 text-[12px]" onClick={load}>조회</Button>
          <Input placeholder="검색 (ID/기종/기사)" value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-[12px] w-44" />
          <Button type="button" variant="outline" className="h-8 text-[12px]" disabled={!filtered.length} onClick={() => exportMovements(filtered, from, to)}>엑셀</Button>
          <span className="text-[11px] text-[#94A3B8] ml-auto">{filtered.length}건</span>
        </div>
      </div>

      {loading ? (
        <div className="text-[12px] text-[#94A3B8] py-8 text-center">불러오는 중…</div>
      ) : (
        <div className="bg-white rounded-lg border border-[#e2e8f0] p-4">
          <div className="overflow-x-auto rounded border border-[#E2E8F0]">
            <table className="w-full text-[11px]">
              <thead><tr className="bg-[#F8F9FA] text-[#64748B]">
                <th className="px-2 py-1.5 text-left font-semibold">날짜</th>
                <th className="px-2 py-1.5 text-left font-semibold">방향</th>
                <th className="px-2 py-1.5 text-left font-semibold">기종</th>
                <th className="px-2 py-1.5 text-left font-semibold">TRCN_ID</th>
                <th className="px-2 py-1.5 text-left font-semibold">담당기사</th>
                <th className="px-2 py-1.5 text-center font-semibold">해지</th>
                <th className="px-2 py-1.5 text-center font-semibold">수리완료</th>
                {perms.canWrite && <th className="px-2 py-1.5 text-center font-semibold">관리</th>}
              </tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={perms.canWrite ? 8 : 7} className="px-2 py-6 text-center text-[#94A3B8]">데이터 없음</td></tr>
                ) : filtered.slice(0, 1500).map(r => (
                  <tr key={r.id} className="border-t border-[#F1F5F9]">
                    <td className="px-2 py-1.5 text-[#475569]">{r.upload_date}</td>
                    <td className={`px-2 py-1.5 ${r.direction === 'out' ? 'text-[#16a34a]' : 'text-[#B32646]'}`}>{r.direction === 'out' ? '출고' : '입고'}</td>
                    <td className="px-2 py-1.5 text-[#1E293B]">{r.device_type}</td>
                    <td className="px-2 py-1.5 font-mono text-[#475569]">{r.trcn_id}</td>
                    <td className="px-2 py-1.5 text-[#64748B]">{r.driver_name ?? '-'}</td>
                    <td className="px-2 py-1.5 text-center">{r.is_terminated && <span className="text-[10px] font-bold text-[#c62828]">해지</span>}</td>
                    <td className="px-2 py-1.5 text-center">{r.is_repair_done && <span className="text-[10px] font-bold text-[#1565c0]">완료</span>}</td>
                    {perms.canWrite && (
                      <td className="px-2 py-1.5 text-center whitespace-nowrap">
                        <button type="button" title="수정" disabled={busy} onClick={() => setEdit(r)} className="p-0.5 rounded text-[#3B82F6] hover:bg-[#eff6ff]"><Pencil size={12} /></button>
                        <button type="button" title="삭제" disabled={busy} onClick={() => delOne(r.id)} className="px-1 rounded text-[#c62828] hover:bg-[#fef2f2] text-[13px] leading-none">×</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > 1500 && <div className="text-[10px] text-[#94A3B8] p-2 text-center">상위 1500건만 표시 (엑셀로 전체 내보내기)</div>}
          </div>
        </div>
      )}

      {edit && <EditModal rec={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
    </div>
  )
}

function EditModal({ rec, onClose, onSaved }: { rec: TaxiMovement; onClose: () => void; onSaved: () => void }) {
  const [trcn, setTrcn] = useState(rec.trcn_id)
  const [device, setDevice] = useState(rec.device_type)
  const [driver, setDriver] = useState(rec.driver_name ?? '')
  const [terminated, setTerminated] = useState(rec.is_terminated)
  const [repairDone, setRepairDone] = useState(rec.is_repair_done)
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    await fetch(`/api/taxi/movements/${rec.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trcn_id: trcn, device_type: device, driver_name: driver,
        is_terminated: terminated, is_repair_done: repairDone }),
    })
    setBusy(false); onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg p-4 w-[340px] space-y-3" onClick={e => e.stopPropagation()}>
        <div className="text-[13px] font-bold text-[#1E293B]">레코드 수정 ({rec.direction === 'out' ? '출고' : '입고'})</div>
        <div>
          <label className="text-[11px] text-[#64748B] block mb-0.5">TRCN_ID</label>
          <Input value={trcn} onChange={e => setTrcn(e.target.value)} className="h-8 text-[12px]" />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-[11px] text-[#64748B] block mb-0.5">기종</label>
            <Select value={device} onValueChange={v => v !== null && setDevice(v)}>
              <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
              <SelectContent>{TAXI_DEVICE_ORDER.filter(d => d !== '미분류').map(d => <SelectItem key={d} value={d} className="text-[12px]">{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {rec.direction === 'out' && (
            <div className="flex-1">
              <label className="text-[11px] text-[#64748B] block mb-0.5">담당기사</label>
              <Input value={driver} onChange={e => setDriver(e.target.value)} className="h-8 text-[12px]" />
            </div>
          )}
        </div>
        <div className="flex items-center gap-4 text-[12px]">
          {rec.direction === 'in' && (
            <>
              <label className="flex items-center gap-1.5"><Checkbox checked={terminated} onCheckedChange={v => setTerminated(!!v)} /> 해지</label>
              <label className="flex items-center gap-1.5"><Checkbox checked={repairDone} onCheckedChange={v => setRepairDone(!!v)} /> 수리완료(보관)</label>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" className="h-8 text-[12px]" onClick={onClose}>취소</Button>
          <Button type="button" className="h-8 text-[12px]" disabled={busy} onClick={save}>저장</Button>
        </div>
      </div>
    </div>
  )
}

// ── 탭4: 배송 이력 ────────────────────────────────────────────────────────────
function DeliveryTab({ perms }: { perms: Perms }) {
  const [from, setFrom] = useState(daysAgo(30))
  const [to, setTo] = useState(kstToday())
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<TaxiDelivery[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/taxi/deliveries?${new URLSearchParams({ from, to, limit: '5000' })}`)
    const d = await r.json()
    setRows(d.data ?? []); setLoading(false)
  }, [from, to])
  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter(r => [r.trcn_id, r.device_type, r.driver_name, r.dealer_name ?? ''].some(v => String(v).toLowerCase().includes(q)))
  }, [rows, search])

  async function cancel(id: string) {
    if (!confirm('이 배송 기록을 취소(삭제)할까요? 해당 단말기는 다시 기사 재고로 표시됩니다.')) return
    setBusy(true)
    await fetch('/api/taxi/deliveries', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
    })
    setBusy(false); load()
  }

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-lg border border-[#e2e8f0] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-8 text-[12px] border border-[#E2E8F0] rounded px-2" />
          <span className="text-[#94A3B8]">~</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-8 text-[12px] border border-[#E2E8F0] rounded px-2" />
          <Button type="button" variant="outline" className="h-8 text-[12px]" onClick={load}>조회</Button>
          <Input placeholder="검색 (ID/기종/기사/대리점)" value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-[12px] w-52" />
          <span className="text-[11px] text-[#94A3B8] ml-auto">{filtered.length}건</span>
        </div>
      </div>

      {loading ? (
        <div className="text-[12px] text-[#94A3B8] py-8 text-center">불러오는 중…</div>
      ) : (
        <div className="bg-white rounded-lg border border-[#e2e8f0] p-4">
          <div className="overflow-x-auto rounded border border-[#E2E8F0]">
            <table className="w-full text-[11px]">
              <thead><tr className="bg-[#F8F9FA] text-[#64748B]">
                <th className="px-2 py-1.5 text-left font-semibold">배송일</th>
                <th className="px-2 py-1.5 text-left font-semibold">기종</th>
                <th className="px-2 py-1.5 text-left font-semibold">TRCN_ID</th>
                <th className="px-2 py-1.5 text-left font-semibold">담당기사</th>
                <th className="px-2 py-1.5 text-left font-semibold">대리점</th>
                {perms.canWrite && <th className="px-2 py-1.5 text-center font-semibold">관리</th>}
              </tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={perms.canWrite ? 6 : 5} className="px-2 py-6 text-center text-[#94A3B8]">데이터 없음</td></tr>
                ) : filtered.slice(0, 1500).map(r => (
                  <tr key={r.id} className="border-t border-[#F1F5F9]">
                    <td className="px-2 py-1.5 text-[#475569]">{r.delivery_date}</td>
                    <td className="px-2 py-1.5 text-[#1E293B]">{r.device_type}</td>
                    <td className="px-2 py-1.5 font-mono text-[#475569]">{r.trcn_id}</td>
                    <td className="px-2 py-1.5 text-[#64748B]">{r.driver_name}</td>
                    <td className="px-2 py-1.5 text-[#94A3B8]">{r.dealer_name ?? '-'}</td>
                    {perms.canWrite && (
                      <td className="px-2 py-1.5 text-center">
                        <button type="button" title="배송 취소" disabled={busy} onClick={() => cancel(r.id)}
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[#c62828] hover:bg-[#fef2f2] text-[10px]">
                          <Ban size={11} /> 취소
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > 1500 && <div className="text-[10px] text-[#94A3B8] p-2 text-center">상위 1500건만 표시</div>}
          </div>
        </div>
      )}
    </div>
  )
}
