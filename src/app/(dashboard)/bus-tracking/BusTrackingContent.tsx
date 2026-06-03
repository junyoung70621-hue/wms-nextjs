'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import * as XLSX from 'xlsx'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { SessionUser } from '@/lib/session'
import {
  TRACKING_CENTERS, STATUS_LABEL, ACTIVE_STATUSES, ACTION_LABEL,
  classifyTerminal, tsKst,
  type Assignment, type AvailableTerminal, type TransferRequest, type HistoryRow,
} from '@/lib/busTracking'
import { extractFaultPair, findContentCol, type FaultPair } from '@/lib/faultSwap'

type CenterUser = { id: string; name: string; username: string; role: string }

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────

function Badge({ text, color }: { text: string; color?: string }) {
  return (
    <span className="inline-block text-[10px] font-bold rounded px-1.5 py-0.5"
      style={{ background: color ? `${color}20` : '#f1f5f9', color: color ?? '#64748B' }}>
      {text}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    holding: '#2e7d32', defective: '#c62828',
    center_defective: '#b45309', unassigned: '#64748B',
    exchanged: '#1565c0', returned: '#475569',
  }
  return <Badge text={STATUS_LABEL[status] ?? status} color={colors[status]} />
}

function DeviceSummary({ rows }: { rows: Assignment[] }) {
  const active = rows.filter(r => ['holding', 'defective'].includes(r.status))
  if (!active.length) return <p className="text-[12px] text-[#94A3B8]">단말기 없음</p>
  const counts: Record<string, number> = {}
  for (const r of active) {
    const key = `${r.device_type ?? '미분류'} ${r.sub_type ?? ''}`.trim()
    counts[key] = (counts[key] ?? 0) + 1
  }
  const total = active.length
  return (
    <div className="space-y-1">
      {Object.entries(counts).sort(([a],[b])=>a.localeCompare(b,'ko')).map(([k,v]) => (
        <div key={k} className="flex justify-between text-[12px]">
          <span className="text-[#475569]">{k}</span>
          <span className="font-bold text-[#1E293B]">{v}</span>
        </div>
      ))}
      <div className="flex justify-between text-[12px] border-t border-[rgba(0,0,0,0.08)] pt-1 mt-1">
        <span className="font-bold text-[#64748B]">합계</span>
        <span className="font-bold text-[#B32646]">{total}대</span>
      </div>
    </div>
  )
}

// ── 모달 공통 래퍼 ─────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-bold text-[#1E293B]">{title}</h3>
          <button onClick={onClose} className="text-[#94A3B8] hover:text-[#1E293B] text-lg">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── 모달: 새 배정 ──────────────────────────────────────────────────────────────
function AssignModal({
  center, canPickEmp, userId, userName,
  onClose, onDone,
}: {
  center: string; canPickEmp: boolean; userId: string; userName: string
  onClose: () => void; onDone: () => void
}) {
  const [users,     setUsers]     = useState<CenterUser[]>([])
  const [targetId,  setTargetId]  = useState<string>(canPickEmp ? '' : userId)
  const [targetName,setTargetName]= useState<string>(canPickEmp ? '' : userName)
  const [available, setAvailable] = useState<AvailableTerminal[]>([])
  const [selected,  setSelected]  = useState<Set<string>>(new Set())
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [msg,       setMsg]       = useState('')

  useEffect(() => {
    if (canPickEmp) {
      fetch(`/api/bus-tracking/users?center=${encodeURIComponent(center)}`)
        .then(r => r.json()).then(d => setUsers(d.data ?? []))
    }
    fetch(`/api/bus-tracking/terminals?center=${encodeURIComponent(center)}`)
      .then(r => r.json())
      .then(d => setAvailable(d.data ?? []))
      .finally(() => setLoading(false))
  }, [center, canPickEmp])

  const toggle = (ih: string) =>
    setSelected(prev => { const n = new Set(prev); if (n.has(ih)) n.delete(ih); else n.add(ih); return n })
  const toggleAll = () =>
    setSelected(prev => prev.size === available.length ? new Set() : new Set(available.map(t => t.ih_code)))

  const handleSave = async () => {
    if (!targetName) { setMsg('배정 직원을 선택하세요.'); return }
    if (!selected.size) { setMsg('단말기를 선택하세요.'); return }
    setSaving(true)
    const ihList = available.filter(t => selected.has(t.ih_code)).map(t => ({
      ih_code: t.ih_code, device_type: t.device_type, sub_type: t.sub_type,
    }))
    const res = await fetch('/api/bus-tracking/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ih_list: ihList, center, target_id: targetId, target_name: targetName }),
    })
    const d = await res.json()
    if (d.error) { setMsg(d.error); setSaving(false); return }
    onDone()
  }

  return (
    <Modal title="➕ 새 배정" onClose={onClose}>
      {canPickEmp && (
        <div className="mb-3">
          <label className="text-[11px] text-[#64748B] block mb-1">배정 직원</label>
          <Select value={targetId} onValueChange={v => {
            if (!v) return
            const u = users.find(u => u.id === v)
            setTargetId(v); setTargetName(u?.name ?? u?.username ?? '')
          }}>
            <SelectTrigger className="h-8 text-[12px]"><SelectValue placeholder="직원 선택" /></SelectTrigger>
            <SelectContent>
              {users.map(u => <SelectItem key={u.id} value={u.id} className="text-[12px]">{u.name || u.username}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      {!canPickEmp && <p className="text-[12px] text-[#64748B] mb-3">배정 직원: <strong>{userName}</strong></p>}

      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] text-[#64748B]">배정 가능 단말기 {available.length}건</label>
          <button onClick={toggleAll} className="text-[11px] text-[#B32646] underline">
            {selected.size === available.length ? '전체 해제' : '전체 선택'}
          </button>
        </div>
        {loading ? <p className="text-[12px] text-[#94A3B8]">로딩 중...</p> : available.length === 0
          ? <p className="text-[12px] text-[#94A3B8]">배정 가능한 단말기가 없습니다.</p>
          : (
            <div className="border rounded overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-[#F8F9FA] sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5 text-center w-8">✓</th>
                    <th className="px-2 py-1.5 text-left font-medium text-[#64748B]">IH</th>
                    <th className="px-2 py-1.5 text-left font-medium text-[#64748B]">기종</th>
                    <th className="px-2 py-1.5 text-left font-medium text-[#64748B]">출고일</th>
                  </tr>
                </thead>
                <tbody>
                  {available.map((t, i) => (
                    <tr key={t.ih_code} onClick={() => toggle(t.ih_code)}
                      className={`cursor-pointer ${selected.has(t.ih_code) ? 'bg-[rgba(179, 38, 70,0.06)]' : i%2===0?'bg-white':'bg-[#FAFAFA]'}`}>
                      <td className="px-2 py-1 text-center">
                        <input type="checkbox" readOnly checked={selected.has(t.ih_code)} className="accent-[#B32646]" />
                      </td>
                      <td className="px-2 py-1 font-mono text-[#1E293B]">{t.ih_code}</td>
                      <td className="px-2 py-1 text-[#475569]">{`${t.device_type} ${t.sub_type}`.trim() || '-'}</td>
                      <td className="px-2 py-1 text-[#94A3B8]">{t.upload_date?.slice(0,10) ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </div>
      {msg && <p className="text-[12px] text-red-500 mb-2">{msg}</p>}
      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving || !selected.size}
          className="flex-1 bg-[#B32646] hover:bg-[#a8003c] text-white text-[12px] h-8">
          {saving ? '저장 중...' : `✅ ${targetName || '?'}에게 ${selected.size}건 배정`}
        </Button>
        <Button variant="outline" onClick={onClose} className="text-[12px] h-8">취소</Button>
      </div>
    </Modal>
  )
}

// ── 모달: 불량 교체 ────────────────────────────────────────────────────────────
function SwapModal({ rec, onClose, onDone }: { rec: Assignment; onClose: () => void; onDone: () => void }) {
  const [defIh,   setDefIh]   = useState('')
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState('')
  const [typeOk,  setTypeOk]  = useState(false)

  const [expDtype, expStype] = useMemo(() => {
    if (rec.device_type) return [rec.device_type, rec.sub_type ?? '']
    const [d, s] = classifyTerminal(rec.ih_code)
    return d !== '미분류' ? [d, s] : ['', '']
  }, [rec])

  const checkType = (ih: string) => {
    if (!ih.trim() || ih.trim() === rec.ih_code) { setTypeOk(false); return }
    const [d, s] = classifyTerminal(ih.trim())
    setTypeOk(d === expDtype && s === expStype)
    setMsg(d === '미분류' ? 'IH 번호를 확인하세요.' :
      (d !== expDtype || s !== expStype) ? `기종 불일치: 설치 ${expDtype} ${expStype} ↔ 수거 ${d} ${s}` : '')
  }

  const handleSave = async () => {
    if (!typeOk) return
    setSaving(true)
    const res = await fetch('/api/bus-tracking/assignments/action', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'swap', holding_id: rec.id, defective_ih: defIh.trim(),
        center: rec.center, employee_id: rec.employee_id, employee_name: rec.employee_name,
        orig_ih: rec.ih_code, orig_status: rec.status,
        orig_dtype: rec.device_type, orig_stype: rec.sub_type,
      }),
    })
    const d = await res.json()
    if (d.error) { setMsg(d.error); setSaving(false); return }
    onDone()
  }

  return (
    <Modal title="🔄 불량 교체" onClose={onClose}>
      <p className="text-[12px] text-[#64748B] mb-1">설치할 단말기 IH: <strong className="font-mono">{rec.ih_code}</strong></p>
      {expDtype && <p className="text-[12px] text-[#64748B] mb-3">기종: <strong>{expDtype} {expStype}</strong></p>}
      <div className="mb-3">
        <label className="text-[11px] text-[#64748B] block mb-1">수거한 불량 IH 번호</label>
        <Input value={defIh} onChange={e => { setDefIh(e.target.value); checkType(e.target.value) }}
          placeholder="예: 100456" className="h-8 text-[12px]" />
        {defIh && typeOk && <p className="text-[11px] text-green-600 mt-1">기종 일치 ✅</p>}
        {msg && <p className="text-[11px] text-red-500 mt-1">{msg}</p>}
      </div>
      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving || !typeOk || defIh.trim() === rec.ih_code}
          className="flex-1 bg-[#B32646] hover:bg-[#a8003c] text-white text-[12px] h-8">
          {saving ? '처리 중...' : '교체 확정'}
        </Button>
        <Button variant="outline" onClick={onClose} className="text-[12px] h-8">취소</Button>
      </div>
    </Modal>
  )
}

// ── 모달: 직원 이동 ────────────────────────────────────────────────────────────
function TransferModal({
  ids, center, meta, onClose, onDone,
}: { ids: string[]; center: string; meta: Assignment[]; onClose: () => void; onDone: () => void }) {
  const [users,   setUsers]   = useState<CenterUser[]>([])
  const [targetId, setTgtId]  = useState<string>('')
  const [targetName, setTgtNm]= useState<string>('')
  const [saving,  setSaving]  = useState(false)
  useEffect(() => {
    fetch(`/api/bus-tracking/users?center=${encodeURIComponent(center)}`)
      .then(r => r.json()).then(d => setUsers(d.data ?? []))
  }, [center])

  const handleSave = async () => {
    if (!targetName) return
    setSaving(true)
    await fetch('/api/bus-tracking/assignments/action', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'transfer', ids, center, target_id: targetId, target_name: targetName,
        records_meta: meta,
      }),
    })
    onDone()
  }

  return (
    <Modal title="👤 직원 이동" onClose={onClose}>
      <p className="text-[12px] text-[#64748B] mb-3">선택 {ids.length}건을 이동합니다.</p>
      <Select value={targetId} onValueChange={v => {
        if (!v) return
        const u = users.find(u => u.id === v)
        setTgtId(v); setTgtNm(u?.name ?? u?.username ?? '')
      }}>
        <SelectTrigger className="h-8 text-[12px] mb-3"><SelectValue placeholder="이동할 직원" /></SelectTrigger>
        <SelectContent>
          {users.map(u => <SelectItem key={u.id} value={u.id} className="text-[12px]">{u.name || u.username}</SelectItem>)}
        </SelectContent>
      </Select>
      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving || !targetName}
          className="flex-1 bg-[#B32646] hover:bg-[#a8003c] text-white text-[12px] h-8">
          {saving ? '처리 중...' : '이동 확정'}
        </Button>
        <Button variant="outline" onClick={onClose} className="text-[12px] h-8">취소</Button>
      </div>
    </Modal>
  )
}

// ── 모달: 반납/배정취소 ────────────────────────────────────────────────────────
function ConfirmModal({
  title, desc, ids, action, meta, onClose, onDone,
}: {
  title: string; desc: string; ids: string[]; action: 'return' | 'delete'
  meta: Assignment[]; onClose: () => void; onDone: () => void
}) {
  const [saving, setSaving] = useState(false)
  const handleSave = async () => {
    setSaving(true)
    if (action === 'return') {
      await fetch('/api/bus-tracking/assignments/action', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'return', ids, records_meta: meta }),
      })
    } else {
      await fetch('/api/bus-tracking/assignments', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, records_meta: meta }),
      })
    }
    onDone()
  }
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-[12px] text-[#475569] mb-4">{desc}</p>
      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving}
          className="flex-1 bg-[#B32646] hover:bg-[#a8003c] text-white text-[12px] h-8">
          {saving ? '처리 중...' : '확정'}
        </Button>
        <Button variant="outline" onClick={onClose} className="text-[12px] h-8">취소</Button>
      </div>
    </Modal>
  )
}

// ── 모달: 레코드 수정 ──────────────────────────────────────────────────────────
function EditModal({
  rec, center, onClose, onDone,
}: { rec: Assignment; center: string; onClose: () => void; onDone: () => void }) {
  const [ih,       setIh]       = useState(rec.ih_code)
  const [dtype,    setDtype]    = useState(rec.device_type ?? '')
  const [stype,    setStype]    = useState(rec.sub_type ?? '')
  const [empId,    setEmpId]    = useState(rec.employee_id ?? '')
  const [empName,  setEmpName]  = useState(rec.employee_name)
  const [status,   setStatus]   = useState(rec.status)
  const [users,    setUsers]    = useState<CenterUser[]>([])
  const [saving,   setSaving]   = useState(false)

  useEffect(() => {
    fetch(`/api/bus-tracking/users?center=${encodeURIComponent(center)}`)
      .then(r => r.json()).then(d => setUsers(d.data ?? []))
  }, [center])

  const DEVICE_OPTS = ['', 'B800', 'B700', 'B710', 'B620', '한강버스', '미분류']
  const SUB_OPTS    = ['', '표출기', '통합단말기', '승하차', '운전자', '모뎀', '알 수 없음']
  const STATUS_OPTS = Object.keys(STATUS_LABEL)

  const handleSave = async () => {
    if (!ih.trim()) return
    setSaving(true)
    await fetch('/api/bus-tracking/assignments/action', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'edit', id: rec.id, ih_code: ih.trim(),
        device_type: dtype || null, sub_type: stype || null,
        employee_id: empId || null, employee_name: empName, status,
      }),
    })
    onDone()
  }

  return (
    <Modal title="✏️ 레코드 수정" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-[11px] text-[#64748B] block mb-1">IH 번호</label>
          <Input value={ih} onChange={e => setIh(e.target.value)} className="h-8 text-[12px]" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-[#64748B] block mb-1">기종</label>
            <Select value={dtype} onValueChange={v => v !== null && setDtype(v)}>
              <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
              <SelectContent>{DEVICE_OPTS.map(o => <SelectItem key={o} value={o} className="text-[12px]">{o || '(없음)'}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[11px] text-[#64748B] block mb-1">유형</label>
            <Select value={stype} onValueChange={v => v !== null && setStype(v)}>
              <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
              <SelectContent>{SUB_OPTS.map(o => <SelectItem key={o} value={o} className="text-[12px]">{o || '(없음)'}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <label className="text-[11px] text-[#64748B] block mb-1">배정 직원</label>
          <Select value={empId || '__none__'} onValueChange={v => {
            if (!v) return
            if (v === '__none__') { setEmpId(''); setEmpName('(미배정)'); return }
            const u = users.find(u => u.id === v)
            setEmpId(v); setEmpName(u?.name ?? u?.username ?? '')
          }}>
            <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__" className="text-[12px]">(미배정)</SelectItem>
              {users.map(u => <SelectItem key={u.id} value={u.id} className="text-[12px]">{u.name || u.username}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[11px] text-[#64748B] block mb-1">상태</label>
          <Select value={status} onValueChange={v => v !== null && setStatus(v)}>
            <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>{STATUS_OPTS.map(o => <SelectItem key={o} value={o} className="text-[12px]">{STATUS_LABEL[o]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <Button onClick={handleSave} disabled={saving || !ih.trim()}
          className="flex-1 bg-[#B32646] hover:bg-[#a8003c] text-white text-[12px] h-8">
          {saving ? '저장 중...' : '저장'}
        </Button>
        <Button variant="outline" onClick={onClose} className="text-[12px] h-8">취소</Button>
      </div>
    </Modal>
  )
}

// ── 탭 1: 배정 현황 ────────────────────────────────────────────────────────────
function TabAssignments({
  selCenter, user, canManage, canWrite, onRefresh,
}: {
  selCenter: string; user: SessionUser; canManage: boolean; canWrite: boolean; onRefresh: () => void
}) {
  const [rows,     setRows]    = useState<Assignment[]>([])
  const [loading,  setLoading] = useState(true)
  const [viewEmp,  setViewEmp] = useState<string>('__all__')
  const [users,    setUsers]   = useState<CenterUser[]>([])
  const [selected, setSelected]= useState<Set<string>>(new Set())
  const [modal,    setModal]   = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true); setSelected(new Set())
    const r = await fetch(`/api/bus-tracking/assignments?center=${encodeURIComponent(selCenter)}`)
    const d = await r.json()
    setRows(d.data ?? [])
    setLoading(false)
  }, [selCenter])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (canManage) {
      fetch(`/api/bus-tracking/users?center=${encodeURIComponent(selCenter)}`)
        .then(r => r.json()).then(d => setUsers(d.data ?? []))
    }
  }, [selCenter, canManage])

  const visibleRows = useMemo(() => {
    let base = rows.filter(r => ACTIVE_STATUSES.includes(r.status))
    if (!canManage) {
      base = base.filter(r =>
        r.employee_id === user.id || (!r.employee_id && r.employee_name === user.name)
      )
    } else if (viewEmp !== '__all__') {
      base = base.filter(r => r.employee_id === viewEmp)
    }
    return base
  }, [rows, canManage, viewEmp, user])

  const selRecs  = visibleRows.filter(r => selected.has(r.id))
  const selIds   = selRecs.map(r => r.id)
  const swapOk   = selIds.length === 1 && ['holding','defective'].includes(selRecs[0]?.status ?? '')
  const canEdit  = user.role === 'admin' || user.role === 'manager'

  const toggleRow = (id: string) =>
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const toggleAll = () =>
    setSelected(prev => prev.size === visibleRows.length ? new Set() : new Set(visibleRows.map(r => r.id)))

  const done = () => { setModal(null); fetchData(); onRefresh() }

  return (
    <div className="space-y-3">
      {/* 상단 버튼 + 직원 선택 */}
      <div className="bg-white rounded-lg border border-[#e2e8f0] p-3">
        <div className="flex flex-wrap items-center gap-2">
          {canWrite && (
            <Button onClick={() => setModal('assign')} className="bg-[#B32646] hover:bg-[#a8003c] text-white text-[12px] h-8">
              ➕ 새 배정
            </Button>
          )}
          {canManage && users.length > 0 && (
            <Select value={viewEmp} onValueChange={v => v !== null && setViewEmp(v)}>
              <SelectTrigger className="h-8 text-[12px] w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__" className="text-[12px]">(전체 보기)</SelectItem>
                {users.map(u => <SelectItem key={u.id} value={u.id} className="text-[12px]">{u.name || u.username}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" onClick={fetchData} className="text-[12px] h-8">🔄</Button>
        </div>
      </div>

      {/* 선택 액션 버튼 */}
      {selIds.length > 0 && (
        <div className="flex flex-wrap gap-2 bg-[rgba(179, 38, 70,0.04)] border border-[rgba(179, 38, 70,0.15)] rounded-lg p-2">
          <span className="text-[12px] font-bold text-[#B32646] self-center">{selIds.length}건 선택</span>
          <Button variant="outline" onClick={() => setModal('swap')} disabled={!swapOk} className="text-[12px] h-7">🔄 불량 교체</Button>
          <Button variant="outline" onClick={() => setModal('transfer')} className="text-[12px] h-7">👤 직원 이동</Button>
          <Button variant="outline" onClick={() => setModal('return')} className="text-[12px] h-7">↩️ 반납</Button>
          <Button variant="outline" onClick={() => setModal('cancel')} className="text-[12px] h-7">🗑️ 배정 취소</Button>
          {canEdit && (
            <Button variant="outline" onClick={() => setModal('edit')} disabled={selIds.length !== 1} className="text-[12px] h-7">✏️ 수정</Button>
          )}
        </div>
      )}

      {/* 2단 레이아웃 */}
      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-4">
        <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-lg p-3">
          <p className="text-[11px] font-bold text-[#64748B] mb-2">기종별 수량</p>
          <DeviceSummary rows={visibleRows} />
        </div>
        <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-lg overflow-hidden">
          {loading ? <p className="text-[12px] text-[#94A3B8] p-4 text-center">로딩 중...</p> : (
            <table className="w-full text-[12px]">
              <thead className="bg-[#F8F9FA]">
                <tr>
                  <th className="px-2 py-2 w-8 text-center">
                    <input type="checkbox" onChange={toggleAll} checked={selected.size === visibleRows.length && visibleRows.length > 0} className="accent-[#B32646]" />
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-[#64748B]">IH</th>
                  <th className="px-3 py-2 text-left font-medium text-[#64748B]">기종</th>
                  <th className="px-3 py-2 text-left font-medium text-[#64748B]">직원</th>
                  <th className="px-3 py-2 text-left font-medium text-[#64748B]">상태</th>
                  <th className="px-3 py-2 text-left font-medium text-[#64748B]">배정일시</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.length === 0
                  ? <tr><td colSpan={6} className="px-3 py-6 text-center text-[#94A3B8]">보유 단말기 없음</td></tr>
                  : visibleRows.map((r, i) => (
                    <tr key={r.id} onClick={() => toggleRow(r.id)}
                      className={`cursor-pointer ${selected.has(r.id) ? 'bg-[rgba(179, 38, 70,0.06)]' : i%2===0?'bg-white':'bg-[#FAFAFA]'}`}>
                      <td className="px-2 py-1.5 text-center">
                        <input type="checkbox" readOnly checked={selected.has(r.id)} className="accent-[#B32646]" />
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[#1E293B]">{r.ih_code}</td>
                      <td className="px-3 py-1.5 text-[#475569]">{`${r.device_type??''} ${r.sub_type??''}`.trim()||'-'}</td>
                      <td className="px-3 py-1.5 text-[#1E293B]">{r.employee_name}</td>
                      <td className="px-3 py-1.5"><StatusBadge status={r.status} /></td>
                      <td className="px-3 py-1.5 text-[#94A3B8]">{tsKst(r.assigned_at)}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 모달 */}
      {modal === 'assign' && (
        <AssignModal center={selCenter} canPickEmp={canManage || user.role === 'manager'}
          userId={user.id} userName={user.name} onClose={() => setModal(null)} onDone={done} />
      )}
      {modal === 'swap' && selRecs[0] && (
        <SwapModal rec={{ ...selRecs[0], center: selCenter }} onClose={() => setModal(null)} onDone={done} />
      )}
      {modal === 'transfer' && (
        <TransferModal ids={selIds} center={selCenter} meta={selRecs}
          onClose={() => setModal(null)} onDone={done} />
      )}
      {modal === 'return' && (
        <ConfirmModal title="↩️ 반납 처리" desc={`선택 ${selIds.length}건을 반납 처리합니다. 양품→반납완료, 불량→불량(센터보관)`}
          ids={selIds} action="return" meta={selRecs.map(r => ({ ...r, center: selCenter }))}
          onClose={() => setModal(null)} onDone={done} />
      )}
      {modal === 'cancel' && (
        <ConfirmModal title="🗑️ 배정 취소" desc={`선택 ${selIds.length}건 배정을 취소합니다. 양품은 센터 가용풀로 복귀됩니다.`}
          ids={selIds} action="delete" meta={selRecs.map(r => ({ ...r, center: selCenter }))}
          onClose={() => setModal(null)} onDone={done} />
      )}
      {modal === 'edit' && selRecs[0] && (
        <EditModal rec={{ ...selRecs[0], center: selCenter }} center={selCenter}
          onClose={() => setModal(null)} onDone={done} />
      )}
    </div>
  )
}

// ── 탭 2: 센터 보유현황 ────────────────────────────────────────────────────────
function TabCenter({ selCenter, canManage }: { selCenter: string; canManage: boolean }) {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [available,   setAvailable]   = useState<AvailableTerminal[]>([])
  const [loading,     setLoading]     = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [ar, tr] = await Promise.all([
      fetch(`/api/bus-tracking/assignments?center=${encodeURIComponent(selCenter)}`).then(r=>r.json()),
      fetch(`/api/bus-tracking/terminals?center=${encodeURIComponent(selCenter)}`).then(r=>r.json()),
    ])
    setAssignments(ar.data ?? [])
    setAvailable(tr.data ?? [])
    setLoading(false)
  }, [selCenter])

  useEffect(() => { fetchData() }, [fetchData])

  const activeRows = assignments.filter(r => ACTIVE_STATUSES.includes(r.status))

  // 피벗: 직원 × 기종유형
  const pivot = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    for (const r of activeRows) {
      const emp = r.employee_name || '(미배정)'
      const key = `${r.device_type??'미분류'} ${r.sub_type??''}`.trim()
      if (!map[emp]) map[emp] = {}
      map[emp][key] = (map[emp][key] ?? 0) + 1
    }
    for (const t of available) {
      const key = `${t.device_type||'미분류'} ${t.sub_type||''}`.trim()
      if (!map['센터 창고']) map['센터 창고'] = {}
      map['센터 창고'][key] = (map['센터 창고'][key] ?? 0) + 1
    }
    const allKeys = Array.from(new Set([
      ...activeRows.map(r => `${r.device_type??'미분류'} ${r.sub_type??''}`.trim()),
      ...available.map(t => `${t.device_type||'미분류'} ${t.sub_type||''}`.trim()),
    ])).sort()
    return { map, allKeys }
  }, [activeRows, available])

  if (loading) return <p className="text-[12px] text-[#94A3B8] py-4">로딩 중...</p>

  const empNames = Object.keys(pivot.map).filter(k => k !== '센터 창고').sort()
  const allEmps = [...empNames, ...(pivot.map['센터 창고'] ? ['센터 창고'] : []), '합계']

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-[13px] font-bold text-[#1E293B]">직원별 기종별 수량</h3>
        <Button variant="outline" onClick={fetchData} className="text-[12px] h-8">🔄 새로고침</Button>
      </div>

      {/* 피벗 테이블 */}
      {pivot.allKeys.length > 0 && (
        <div className="bg-white rounded-lg border border-[#e2e8f0] p-4 overflow-x-auto">
          <table className="text-[11px] border-collapse w-auto">
            <thead>
              <tr className="bg-[#F8F9FA]">
                <th className="border border-[rgba(0,0,0,0.1)] px-3 py-1.5 text-left font-bold text-[#64748B] whitespace-nowrap">직원명</th>
                {pivot.allKeys.map(k => (
                  <th key={k} className="border border-[rgba(0,0,0,0.1)] px-2 py-1.5 font-medium text-[#64748B] whitespace-nowrap">{k}</th>
                ))}
                <th className="border border-[rgba(0,0,0,0.1)] px-2 py-1.5 font-bold text-[#64748B] bg-[#FFF2CC]">합계</th>
              </tr>
            </thead>
            <tbody>
              {allEmps.map(emp => {
                if (emp === '합계') {
                  const totals = pivot.allKeys.map(k =>
                    Object.values(pivot.map).reduce((s, em) => s + (em[k] ?? 0), 0)
                  )
                  const grand = totals.reduce((s, v) => s + v, 0)
                  return (
                    <tr key="total" className="bg-[#D9E1F2] font-bold">
                      <td className="border border-[rgba(0,0,0,0.1)] px-3 py-1">▶ 기종별 합계</td>
                      {totals.map((v, i) => <td key={i} className="border border-[rgba(0,0,0,0.1)] px-2 py-1 text-center">{v || ''}</td>)}
                      <td className="border border-[rgba(0,0,0,0.1)] px-2 py-1 text-center bg-[#BDD7EE]">{grand}</td>
                    </tr>
                  )
                }
                const row = pivot.map[emp] ?? {}
                const total = Object.values(row).reduce((s, v) => s + v, 0)
                return (
                  <tr key={emp} className={emp === '센터 창고' ? 'bg-[#F0F9FF]' : ''}>
                    <td className="border border-[rgba(0,0,0,0.1)] px-3 py-1 whitespace-nowrap font-medium">{emp}</td>
                    {pivot.allKeys.map(k => (
                      <td key={k} className="border border-[rgba(0,0,0,0.1)] px-2 py-1 text-center">
                        {row[k] ? <span className="font-bold">{row[k]}</span> : <span className="text-[#CBD5E1]">-</span>}
                      </td>
                    ))}
                    <td className="border border-[rgba(0,0,0,0.1)] px-2 py-1 text-center font-bold bg-[#FFF2CC]">{total}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 전체 목록 */}
      <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-[#F8F9FA] border-b border-[rgba(0,0,0,0.08)]">
          <span className="text-[12px] font-bold text-[#1E293B]">센터 단말기 현황</span>
          <span className="text-[11px] text-[#94A3B8] ml-2">배정 {activeRows.length}대 · 미배정 {available.length}대</span>
        </div>
        <table className="w-full text-[12px]">
          <thead className="bg-[#F8F9FA]">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-[#64748B]">직원명</th>
              <th className="px-3 py-2 text-left font-medium text-[#64748B]">IH</th>
              <th className="px-3 py-2 text-left font-medium text-[#64748B]">기종</th>
              <th className="px-3 py-2 text-left font-medium text-[#64748B]">상태</th>
              <th className="px-3 py-2 text-left font-medium text-[#64748B]">배정일시</th>
            </tr>
          </thead>
          <tbody>
            {[...activeRows.map(r => ({ ...r, _avail: false })),
              ...available.map(t => ({ id: t.ih_code, ih_code: t.ih_code, device_type: t.device_type, sub_type: t.sub_type, employee_name: '─ 미배정 ─', status: 'unassigned', assigned_at: t.upload_date, center: selCenter, employee_id: null, returned_at: null, notes: null, assigned_by: null, _avail: true }))]
              .sort((a, b) => a.employee_name.localeCompare(b.employee_name, 'ko'))
              .map((r, i) => (
                <tr key={`${r.id}-${i}`} className={i%2===0?'bg-white':'bg-[#FAFAFA]'}>
                  <td className="px-3 py-1.5 text-[#1E293B]">{r.employee_name}</td>
                  <td className="px-3 py-1.5 font-mono text-[#475569]">{r.ih_code}</td>
                  <td className="px-3 py-1.5 text-[#64748B]">{`${r.device_type??''} ${r.sub_type??''}`.trim()||'-'}</td>
                  <td className="px-3 py-1.5"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-1.5 text-[#94A3B8]">{tsKst(r.assigned_at)}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>

      {/* 데이터 삭제 (admin/manager) */}
      {canManage && (
        <details className="border border-[rgba(0,0,0,0.1)] rounded-lg">
          <summary className="px-3 py-2 text-[12px] text-[#64748B] cursor-pointer hover:bg-[#F8F9FA]">
            🗑️ 센터 보유현황 데이터 삭제
          </summary>
          <div className="p-3 border-t border-[rgba(0,0,0,0.08)]">
            <p className="text-[11px] text-[#94A3B8] mb-2">
              bus_terminal_assignments 레코드를 삭제합니다. terminal_movements 데이터는 삭제되지 않습니다.
            </p>
            <DeleteSection selCenter={selCenter} onDone={fetchData} />
          </div>
        </details>
      )}
    </div>
  )
}

function DeleteSection({ selCenter, onDone }: { selCenter: string; onDone: () => void }) {
  const [rows,    setRows]    = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [selIds,  setSelIds]  = useState<Set<string>>(new Set())
  const [selAll,  setSelAll]  = useState(false)
  const [deleting,setDeleting]= useState(false)

  useEffect(() => {
    fetch(`/api/bus-tracking/assignments?center=${encodeURIComponent(selCenter)}`)
      .then(r => r.json()).then(d => { setRows(d.data ?? []); setLoading(false) })
  }, [selCenter])

  const toggle = (id: string) =>
    setSelIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const effectiveIds = selAll ? rows.map(r => r.id) : Array.from(selIds)

  const handleDelete = async () => {
    if (!effectiveIds.length) return
    setDeleting(true)
    await fetch('/api/bus-tracking/assignments', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: effectiveIds }),
    })
    setSelIds(new Set()); setSelAll(false)
    onDone()
    setRows(prev => prev.filter(r => !effectiveIds.includes(r.id)))
    setDeleting(false)
  }

  if (loading) return <p className="text-[12px] text-[#94A3B8]">로딩 중...</p>
  if (!rows.length) return <p className="text-[12px] text-[#94A3B8]">삭제할 데이터가 없습니다.</p>

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-[12px] text-[#475569]">
        <input type="checkbox" checked={selAll} onChange={e => { setSelAll(e.target.checked); setSelIds(new Set()) }} className="accent-[#B32646]" />
        전체 선택 ({rows.length}건)
      </label>
      <div className="border rounded overflow-hidden max-h-48 overflow-y-auto">
        <table className="w-full text-[11px]">
          <thead className="bg-[#F8F9FA] sticky top-0">
            <tr>
              <th className="px-2 py-1.5 w-8">✓</th>
              <th className="px-2 py-1.5 text-left text-[#64748B]">직원명</th>
              <th className="px-2 py-1.5 text-left text-[#64748B]">IH</th>
              <th className="px-2 py-1.5 text-left text-[#64748B]">기종</th>
              <th className="px-2 py-1.5 text-left text-[#64748B]">상태</th>
              <th className="px-2 py-1.5 text-left text-[#64748B]">배정일시</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} onClick={() => !selAll && toggle(r.id)}
                className={`cursor-pointer ${(selAll || selIds.has(r.id)) ? 'bg-red-50' : i%2===0?'bg-white':'bg-[#FAFAFA]'}`}>
                <td className="px-2 py-1 text-center">
                  <input type="checkbox" readOnly checked={selAll || selIds.has(r.id)} className="accent-red-500" />
                </td>
                <td className="px-2 py-1">{r.employee_name}</td>
                <td className="px-2 py-1 font-mono">{r.ih_code}</td>
                <td className="px-2 py-1 text-[#64748B]">{`${r.device_type??''} ${r.sub_type??''}`.trim()||'-'}</td>
                <td className="px-2 py-1"><StatusBadge status={r.status} /></td>
                <td className="px-2 py-1 text-[#94A3B8]">{tsKst(r.assigned_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {effectiveIds.length > 0 && (
        <div className="flex items-center gap-2">
          <p className="text-[12px] text-red-500 font-medium">선택 {effectiveIds.length}건 — 삭제 시 복구 불가</p>
          <Button onClick={handleDelete} disabled={deleting}
            className="bg-red-500 hover:bg-red-600 text-white text-[12px] h-7">
            {deleting ? '삭제 중...' : `🗑️ ${effectiveIds.length}건 삭제`}
          </Button>
        </div>
      )}
    </div>
  )
}

// ── 탭 3: 센터간이동 ───────────────────────────────────────────────────────────
function TabTransfer({ selCenter, user, canManage }: { selCenter: string; user: SessionUser; canManage: boolean }) {
  const [requests,     setRequests]  = useState<TransferRequest[]>([])
  const [available,    setAvailable] = useState<AvailableTerminal[]>([])
  const [assignments,  setAssignments]= useState<Assignment[]>([])
  const [selIhs,       setSelIhs]    = useState<Set<string>>(new Set())
  const [toCtr,        setToCtr]     = useState('')
  const [notes,        setNotes]     = useState('')
  const [loading,      setLoading]   = useState(true)
  const [submitting,   setSubmit]    = useState(false)
  const [msg,          setMsg]       = useState('')
  const [subTab,       setSubTab]    = useState<'request'|'status'>('request')

  const REGIONAL = ['강서센터', '강북센터', '강동센터', '강남센터']
  const isRegional = canManage || REGIONAL.includes(user.assigned_center ?? user.center)
  const srcCenter = canManage ? selCenter : (user.assigned_center ?? user.center)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [rr, tr, ar] = await Promise.all([
      fetch(`/api/bus-tracking/transfers?center=${encodeURIComponent(srcCenter)}`).then(r=>r.json()),
      fetch(`/api/bus-tracking/terminals?center=${encodeURIComponent(srcCenter)}`).then(r=>r.json()),
      fetch(`/api/bus-tracking/assignments?center=${encodeURIComponent(srcCenter)}`).then(r=>r.json()),
    ])
    setRequests(rr.data ?? [])
    setAvailable(tr.data ?? [])
    setAssignments(ar.data ?? [])
    setLoading(false)
  }, [srcCenter])

  useEffect(() => { fetchData() }, [fetchData])

  const destOptions = REGIONAL.filter(c => c !== srcCenter)

  // 이동 신청 가능 목록: assignments(active+unassigned) + 가용풀(assignments에 없는 것)
  const movable = useMemo(() => {
    const MOVABLE_STATUSES = [...ACTIVE_STATUSES, 'unassigned']
    const fromAssignments = assignments.filter(r => MOVABLE_STATUSES.includes(r.status))
    const assignedIhs = new Set(fromAssignments.map(r => r.ih_code))
    const fromPool = available.filter(t => !assignedIhs.has(t.ih_code)).map(t => ({
      id: t.ih_code, ih_code: t.ih_code,
      device_type: t.device_type, sub_type: t.sub_type,
      employee_name: '─ 미배정 ─', status: 'unassigned',
      assigned_at: t.upload_date, center: srcCenter,
      employee_id: null, returned_at: null, notes: null, assigned_by: null,
    } as Assignment))
    return [...fromAssignments, ...fromPool]
  }, [assignments, available, srcCenter])

  const toggleIh = (ih: string) =>
    setSelIhs(prev => { const n = new Set(prev); if (n.has(ih)) n.delete(ih); else n.add(ih); return n })

  const handleSubmit = async () => {
    if (!toCtr || selIhs.size === 0) { setMsg('목적 센터와 단말기를 선택하세요.'); return }
    setSubmit(true)
    const ihPayload = movable.filter(t => selIhs.has(t.ih_code)).map(t => ({
      ih_code: t.ih_code, device_type: t.device_type ?? undefined,
      sub_type: t.sub_type ?? undefined, employee_name: t.employee_name,
    }))
    const res = await fetch('/api/bus-tracking/transfers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_center: srcCenter, to_center: toCtr, ih_codes: ihPayload, notes }),
    })
    const d = await res.json()
    if (d.error) { setMsg(d.error); setSubmit(false); return }
    setSelIhs(new Set()); setNotes(''); setMsg('')
    fetchData(); setSubTab('status')
    setSubmit(false)
  }

  const handleAction = async (id: string, action: 'approve'|'reject') => {
    await fetch('/api/bus-tracking/transfers/action', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    })
    fetchData()
  }

  const handleDelete = async (id: string) => {
    await fetch('/api/bus-tracking/transfers/action', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    fetchData()
  }

  if (!isRegional) return <p className="text-[12px] text-[#94A3B8] py-4">이 탭은 강서·강북·강동·강남 센터에서만 사용할 수 있습니다.</p>

  const STATUS_KO: Record<string, string> = { pending: '대기중', approved: '승인', rejected: '거절' }
  const pendingIn = requests.filter(r => r.to_center === (canManage ? selCenter : srcCenter) && r.status === 'pending')

  return (
    <div className="space-y-3">
      <div className="flex gap-2 mb-2">
        {(['request','status'] as const).map(t => (
          <button key={t} onClick={() => setSubTab(t)}
            className={`text-[12px] px-3 py-1.5 rounded border transition-colors ${subTab === t ? 'bg-[#B32646] text-white border-[#B32646]' : 'border-[rgba(0,0,0,0.12)] text-[#64748B] hover:bg-[#F8F9FA]'}`}>
            {t === 'request' ? '📤 이동 신청' : `📋 이동 현황${pendingIn.length > 0 ? ` (대기 ${pendingIn.length})` : ''}`}
          </button>
        ))}
        <Button variant="outline" onClick={fetchData} className="text-[12px] h-8 ml-auto">🔄</Button>
      </div>

      {subTab === 'request' && (
        <div className="bg-white rounded-lg border border-[#e2e8f0] p-4 space-y-3">
          <p className="text-[11px] text-[#64748B]">본인 센터 단말기를 선택해 다른 센터로 이동 신청합니다.</p>
          <Select value={toCtr} onValueChange={v => v !== null && setToCtr(v)}>
            <SelectTrigger className="h-8 text-[12px] w-48"><SelectValue placeholder="목적 센터 선택" /></SelectTrigger>
            <SelectContent>{destOptions.map(c => <SelectItem key={c} value={c} className="text-[12px]">{c}</SelectItem>)}</SelectContent>
          </Select>
          {loading ? <p className="text-[12px] text-[#94A3B8]">로딩 중...</p> : (
            <div className="border rounded overflow-hidden max-h-72 overflow-y-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-[#F8F9FA] sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5 w-8">
                      <input type="checkbox" onChange={() =>
                        setSelIhs(prev => prev.size === movable.length ? new Set() : new Set(movable.map(t => t.ih_code)))
                      } className="accent-[#B32646]" />
                    </th>
                    <th className="px-3 py-1.5 text-left font-medium text-[#64748B]">보유직원</th>
                    <th className="px-3 py-1.5 text-left font-medium text-[#64748B]">IH</th>
                    <th className="px-3 py-1.5 text-left font-medium text-[#64748B]">기종</th>
                    <th className="px-3 py-1.5 text-left font-medium text-[#64748B]">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {movable.length === 0
                    ? <tr><td colSpan={5} className="px-3 py-4 text-center text-[#94A3B8]">이동 신청할 단말기 없음</td></tr>
                    : movable.map((t, i) => (
                      <tr key={t.ih_code} onClick={() => toggleIh(t.ih_code)}
                        className={`cursor-pointer ${selIhs.has(t.ih_code)?'bg-[rgba(179, 38, 70,0.06)]':i%2===0?'bg-white':'bg-[#FAFAFA]'}`}>
                        <td className="px-2 py-1 text-center">
                          <input type="checkbox" readOnly checked={selIhs.has(t.ih_code)} className="accent-[#B32646]" />
                        </td>
                        <td className="px-3 py-1 text-[#475569]">{t.employee_name}</td>
                        <td className="px-3 py-1 font-mono">{t.ih_code}</td>
                        <td className="px-3 py-1 text-[#64748B]">{`${t.device_type??''} ${t.sub_type??''}`.trim()||'-'}</td>
                        <td className="px-3 py-1"><StatusBadge status={t.status} /></td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          )}
          <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="비고 (선택)" className="h-8 text-[12px]" />
          {msg && <p className="text-[12px] text-red-500">{msg}</p>}
          {selIhs.size > 0 && toCtr && (
            <p className="text-[12px] text-[#64748B]">선택 <strong>{selIhs.size}건</strong> → {toCtr}</p>
          )}
          <Button onClick={handleSubmit} disabled={submitting || selIhs.size === 0 || !toCtr}
            className="bg-[#B32646] hover:bg-[#a8003c] text-white text-[12px] h-8">
            {submitting ? '신청 중...' : '📤 이동 신청'}
          </Button>
        </div>
      )}

      {subTab === 'status' && (
        <div className="space-y-4">
          {pendingIn.length > 0 && (
            <div>
              <p className="text-[12px] font-bold text-[#1E293B] mb-2">📥 받은 신청 (대기중)</p>
              {pendingIn.map(req => (
                <div key={req.id} className="border border-[rgba(0,0,0,0.1)] rounded-lg p-3 mb-2 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[12px] font-bold">{req.from_center} → {req.to_center}</span>
                      <span className="text-[11px] text-[#64748B] ml-2">{(req.ih_codes??[]).length}대 · {req.requested_by_name} · {tsKst(req.requested_at)}</span>
                      {req.notes && <p className="text-[11px] text-[#94A3B8]">비고: {req.notes}</p>}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button onClick={() => handleAction(req.id, 'approve')} className="bg-[#2e7d32] hover:bg-[#1b5e20] text-white text-[11px] h-7">✅ 승인</Button>
                      <Button variant="outline" onClick={() => handleAction(req.id, 'reject')} className="text-[11px] h-7 text-red-500">❌ 거절</Button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="text-[11px] w-full">
                      <thead className="bg-[#F8F9FA]">
                        <tr>
                          <th className="px-2 py-1 text-left text-[#64748B]">IH</th>
                          <th className="px-2 py-1 text-left text-[#64748B]">기종</th>
                          <th className="px-2 py-1 text-left text-[#64748B]">보유직원</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(req.ih_codes ?? []).map((item, i) => (
                          <tr key={i} className={i%2===0?'bg-white':'bg-[#FAFAFA]'}>
                            <td className="px-2 py-0.5 font-mono">{item.ih_code}</td>
                            <td className="px-2 py-0.5 text-[#64748B]">{`${item.device_type??''} ${item.sub_type??''}`.trim()||'-'}</td>
                            <td className="px-2 py-0.5 text-[#94A3B8]">{item.employee_name||'-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="bg-white rounded-lg border border-[#e2e8f0] p-4 overflow-x-auto">
            <p className="text-[12px] font-bold text-[#1E293B] mb-2">📋 이동 신청 이력</p>
            {requests.length === 0
              ? <p className="text-[12px] text-[#94A3B8]">이동 신청 내역이 없습니다.</p>
              : (
                <table className="w-full text-[12px]">
                  <thead className="bg-[#F8F9FA]">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-[#64748B]">출발</th>
                      <th className="px-3 py-2 text-left font-medium text-[#64748B]">목적</th>
                      <th className="px-3 py-2 text-center font-medium text-[#64748B]">대수</th>
                      <th className="px-3 py-2 text-left font-medium text-[#64748B]">신청자</th>
                      <th className="px-3 py-2 text-left font-medium text-[#64748B]">신청일시</th>
                      <th className="px-3 py-2 text-left font-medium text-[#64748B]">상태</th>
                      {user.role === 'admin' && <th className="px-3 py-2 w-10" />}
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((r, i) => (
                      <tr key={r.id} className={i%2===0?'bg-white':'bg-[#FAFAFA]'}>
                        <td className="px-3 py-1.5">{r.from_center}</td>
                        <td className="px-3 py-1.5">{r.to_center}</td>
                        <td className="px-3 py-1.5 text-center">{(r.ih_codes??[]).length}</td>
                        <td className="px-3 py-1.5 text-[#64748B]">{r.requested_by_name}</td>
                        <td className="px-3 py-1.5 text-[#94A3B8]">{tsKst(r.requested_at)}</td>
                        <td className="px-3 py-1.5">
                          <Badge text={STATUS_KO[r.status]??r.status}
                            color={r.status==='approved'?'#2e7d32':r.status==='rejected'?'#c62828':'#b45309'} />
                        </td>
                        {user.role === 'admin' && (
                          <td className="px-3 py-1.5">
                            <button onClick={() => handleDelete(r.id)} className="text-[10px] text-[#94A3B8] hover:text-red-500">🗑️</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
          </div>
        </div>
      )}
    </div>
  )
}

// ── 탭 4: 변경이력 ─────────────────────────────────────────────────────────────
function TabHistory({ selCenter }: { selCenter: string }) {
  const [rows,    setRows]    = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [queried, setQueried] = useState(false)
  const today = new Date(Date.now() + 9*3600000).toISOString().slice(0,10)
  const month30 = new Date(Date.now() + 9*3600000 - 30*86400000).toISOString().slice(0,10)
  const [dateFrom, setDateFrom] = useState(month30)
  const [dateTo,   setDateTo]   = useState(today)
  const [action,   setAction]   = useState('전체')
  const [search,   setSearch]   = useState('')

  const fetch_data = async () => {
    setLoading(true); setQueried(true)
    const p = new URLSearchParams({ center: selCenter, date_from: dateFrom, date_to: dateTo })
    const r = await fetch(`/api/bus-tracking/history?${p}`)
    const d = await r.json()
    setRows(d.data ?? [])
    setLoading(false)
  }

  const filtered = useMemo(() => {
    let data = rows
    if (action !== '전체') {
      const rev: Record<string, string> = {}
      for (const [k, v] of Object.entries(ACTION_LABEL)) rev[v] = k
      data = data.filter(r => r.action === rev[action])
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      data = data.filter(r =>
        r.ih_code?.toLowerCase().includes(q) ||
        (r.extra_ih ?? '').toLowerCase().includes(q) ||
        (r.from_employee ?? '').toLowerCase().includes(q) ||
        (r.to_employee ?? '').toLowerCase().includes(q) ||
        (r.acted_by_name ?? '').toLowerCase().includes(q)
      )
    }
    return data
  }, [rows, action, search])

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-lg border border-[#e2e8f0] p-3 flex flex-wrap gap-2 items-end">
        <div>
          <label className="text-[11px] text-[#64748B] block mb-1">시작일</label>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 text-[12px] w-36" />
        </div>
        <div>
          <label className="text-[11px] text-[#64748B] block mb-1">종료일</label>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 text-[12px] w-36" />
        </div>
        <div>
          <label className="text-[11px] text-[#64748B] block mb-1">액션</label>
          <Select value={action} onValueChange={v => v !== null && setAction(v)}>
            <SelectTrigger className="h-8 text-[12px] w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {['전체', ...Object.values(ACTION_LABEL)].map(a => <SelectItem key={a} value={a} className="text-[12px]">{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="IH · 직원명 · 처리자" className="h-8 text-[12px] w-44" />
        <Button onClick={fetch_data} className="bg-[#B32646] hover:bg-[#a8003c] text-white text-[12px] h-8">조회</Button>
      </div>

      {!queried
        ? <p className="text-[12px] text-[#94A3B8] py-4">조회 버튼을 눌러 이력을 확인하세요.</p>
        : loading ? <p className="text-[12px] text-[#94A3B8] py-4">로딩 중...</p>
        : (
          <div className="bg-white rounded-lg border border-[#e2e8f0] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-[#64748B]">총 {filtered.length}건{search ? ` (검색: '${search}')` : ''}</p>
              <Button variant="outline" onClick={() => {
                const exportData = filtered.map(r => {
                  const ihDisplay = r.action === 'swap' && r.extra_ih ? `${r.ih_code} → ${r.extra_ih}` : r.ih_code
                  const empDisplay = r.action === 'assign' ? (r.to_employee ?? '')
                    : r.action === 'transfer' ? `${r.from_employee??''} → ${r.to_employee??''}`
                    : (r.from_employee ?? r.to_employee ?? '')
                  const statusDisplay = r.from_status && r.to_status
                    ? `${STATUS_LABEL[r.from_status]??r.from_status} → ${STATUS_LABEL[r.to_status]??r.to_status}`
                    : STATUS_LABEL[r.to_status??r.from_status??''] ?? ''
                  return { '시각': tsKst(r.acted_at), '액션': ACTION_LABEL[r.action]??r.action, '단말기(설치→수거)': ihDisplay, '기종': `${r.device_type??''} ${r.sub_type??''}`.trim()||'-', '직원': empDisplay||'-', '상태변경': statusDisplay, '처리자': r.acted_by_name||'-' }
                })
                const ws = XLSX.utils.json_to_sheet(exportData)
                const wb = XLSX.utils.book_new()
                XLSX.utils.book_append_sheet(wb, ws, '변경이력')
                XLSX.writeFile(wb, `단말기이력_${selCenter}_${dateFrom}_${dateTo}.xlsx`)
              }} className="text-[12px] h-8">📥 엑셀 다운로드</Button>
            </div>
            <div className="rounded-lg border border-[#e2e8f0] overflow-hidden overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-[#F8F9FA]">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-[#64748B] whitespace-nowrap">시각</th>
                    <th className="px-3 py-2 text-left font-medium text-[#64748B]">액션</th>
                    <th className="px-3 py-2 text-left font-medium text-[#64748B]">단말기(설치→수거)</th>
                    <th className="px-3 py-2 text-left font-medium text-[#64748B]">기종</th>
                    <th className="px-3 py-2 text-left font-medium text-[#64748B]">직원</th>
                    <th className="px-3 py-2 text-left font-medium text-[#64748B]">상태변경</th>
                    <th className="px-3 py-2 text-left font-medium text-[#64748B]">처리자</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0
                    ? <tr><td colSpan={7} className="px-3 py-4 text-center text-[#94A3B8]">조회된 이력 없음</td></tr>
                    : filtered.map((r, i) => {
                      const ihDisplay = r.action === 'swap' && r.extra_ih
                        ? `${r.ih_code} → ${r.extra_ih}` : r.ih_code
                      const empDisplay = r.action === 'assign' ? (r.to_employee ?? '')
                        : r.action === 'transfer'
                          ? `${r.from_employee??''} → ${r.to_employee??''}`
                          : (r.from_employee ?? r.to_employee ?? '')
                      const statusDisplay = r.from_status && r.to_status
                        ? `${STATUS_LABEL[r.from_status]??r.from_status} → ${STATUS_LABEL[r.to_status]??r.to_status}`
                        : STATUS_LABEL[r.to_status??r.from_status??''] ?? ''
                      return (
                        <tr key={i} className={i%2===0?'bg-white':'bg-[#FAFAFA]'}>
                          <td className="px-3 py-1.5 text-[#94A3B8] whitespace-nowrap">{tsKst(r.acted_at)}</td>
                          <td className="px-3 py-1.5"><Badge text={ACTION_LABEL[r.action]??r.action} color="#B32646" /></td>
                          <td className="px-3 py-1.5 font-mono text-[#1E293B]">{ihDisplay}</td>
                          <td className="px-3 py-1.5 text-[#64748B]">{`${r.device_type??''} ${r.sub_type??''}`.trim()||'-'}</td>
                          <td className="px-3 py-1.5 text-[#475569]">{empDisplay||'-'}</td>
                          <td className="px-3 py-1.5 text-[#94A3B8] text-[11px]">{statusDisplay}</td>
                          <td className="px-3 py-1.5 text-[#94A3B8]">{r.acted_by_name||'-'}</td>
                        </tr>
                      )
                    })
                  }
                </tbody>
              </table>
            </div>
          </div>
        )
      }
    </div>
  )
}

// ── 탭 5: 초기 등록 ────────────────────────────────────────────────────────────
function TabInit({ selCenter, userId, canManage }: {
  selCenter: string; userId: string; canManage: boolean
}) {
  type ParsedRow = { ih: string; name: string; center: string; dtype: string; stype: string }
  const fileRef   = useRef<HTMLInputElement>(null)
  const [cols,    setCols]    = useState<string[]>([])
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([])
  const [ihCol,   setIhCol]   = useState('')
  const [nameCol, setNameCol] = useState('')
  const [ctrCol,  setCtrCol]  = useState('')
  const [useNameCol, setUseNameCol] = useState(true)
  const [useCtrCol,  setUseCtrCol]  = useState(false)
  const [parsed,  setParsed]  = useState<ParsedRow[]>([])
  const [regDate, setRegDate] = useState(new Date(Date.now()+9*3600000).toISOString().slice(0,10))
  const [doClear, setDoClear] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState('')
  const [users,   setUsers]   = useState<CenterUser[]>([])

  const IH_KWS   = ['ih', 'trcn', '단말기', '번호', 'ih번호', 'serial']
  const NAME_KWS = ['직원', '이름', '성명', '담당자', 'name']
  const CTR_KWS  = ['센터', 'center']
  const findCol  = (columns: string[], kws: string[]) =>
    columns.find(c => kws.some(k => c.toLowerCase().replace(/[\s_]/g,'').includes(k))) ?? ''

  useEffect(() => {
    fetch(`/api/bus-tracking/users?center=${encodeURIComponent(selCenter)}`)
      .then(r => r.json()).then(d => setUsers(d.data ?? []))
  }, [selCenter])

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const data = new Uint8Array(ev.target!.result as ArrayBuffer)
      const wb   = XLSX.read(data, { type: 'array' })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })
      if (!rows.length) { setMsg('데이터를 읽지 못했습니다.'); return }
      const columns = Object.keys(rows[0])
      setCols(columns); setRawRows(rows); setParsed([]); setMsg('')
      setIhCol(findCol(columns, IH_KWS))
      setNameCol(findCol(columns, NAME_KWS))
      const detCtr = findCol(columns, CTR_KWS)
      setCtrCol(detCtr)
      setUseCtrCol(canManage && !!detCtr)
      setUseNameCol(true)
    }
    reader.readAsArrayBuffer(file)
  }

  const downloadTemplate = () => {
    const headers = canManage ? ['IH번호', '직원명', '센터'] : ['IH번호', '직원명']
    const examples = canManage
      ? [['100123','홍길동','강서센터'],['560001234','김철수','강북센터'],['155100001','','강동센터']]
      : [['100123','홍길동'],['560001234','김철수'],['155100001','']]
    const ws = XLSX.utils.aoa_to_sheet([headers, ...examples])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '초기등록양식')
    XLSX.writeFile(wb, '단말기_초기등록_양식.xlsx')
  }

  const buildPreview = () => {
    if (!rawRows.length || !ihCol) { setMsg('IH번호 컬럼을 선택하세요.'); return }
    const result: ParsedRow[] = []
    for (const row of rawRows) {
      const ih = String(row[ihCol] ?? '').trim()
      if (!ih) continue
      const name = useNameCol && nameCol ? String(row[nameCol] ?? '').trim() : ''
      const ctr  = (canManage && useCtrCol && ctrCol)
        ? String(row[ctrCol] ?? selCenter).trim() || selCenter
        : selCenter
      if (!TRACKING_CENTERS.includes(ctr)) continue
      const [dtype, stype] = classifyTerminal(ih)
      result.push({ ih, name, center: ctr, dtype: dtype !== '미분류' ? dtype : '', stype: dtype !== '미분류' ? stype : '' })
    }
    setParsed(result)
    const userNames = new Set(users.map(u => u.name))
    const unmatched = [...new Set(result.filter(r => r.name && !userNames.has(r.name)).map(r => r.name))]
    setMsg(unmatched.length ? `⚠️ 계정 미매칭 ${unmatched.length}명: ${unmatched.join(', ')} — 이름 그대로 등록됩니다.` : '')
  }

  const handleSave = async () => {
    if (!parsed.length) return
    setSaving(true)
    const userMap: Record<string, string> = {}
    for (const u of users) userMap[u.name] = u.id
    const now     = new Date(regDate + 'T09:00:00+09:00').toISOString()
    const records = parsed.map(r => ({
      ih_code: r.ih, device_type: r.dtype || null, sub_type: r.stype || null,
      center: r.center,
      employee_id:   r.name ? (userMap[r.name] ?? null) : null,
      employee_name: r.name || '(미배정)',
      assigned_at: now, assigned_by: userId,
      status: r.name ? 'holding' : 'unassigned',
    }))
    const clearCenters = doClear ? [...new Set(parsed.map(r => r.center))] : []
    const res = await fetch('/api/bus-tracking/assignments/action', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'bulk_register', records, clear_centers: clearCenters }),
    })
    const d = await res.json()
    if (d.error) { setMsg(d.error); setSaving(false); return }
    setMsg(`✅ ${d.count}건 등록 완료!`)
    setParsed([]); setRawRows([]); setCols([])
    if (fileRef.current) fileRef.current.value = ''
    setSaving(false)
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-white rounded-lg border border-[#e2e8f0] p-4 space-y-4">
        <div className="flex items-start gap-3">
          <p className="text-[12px] text-[#64748B] flex-1">
            엑셀 파일(IH번호 + 직원명 컬럼)을 업로드하면 일괄 등록합니다.{' '}
            {canManage ? '관리자는 센터 컬럼도 사용 가능합니다.' : `업로드 시 [${selCenter}]에 귀속됩니다.`}
          </p>
          <Button variant="outline" onClick={downloadTemplate} className="text-[12px] h-8 flex-shrink-0">📥 양식 다운로드</Button>
        </div>

        <div>
          <label className="text-[11px] text-[#64748B] block mb-1">등록 기준일</label>
          <Input type="date" value={regDate} onChange={e => setRegDate(e.target.value)} className="h-8 text-[12px] w-40" />
        </div>

        <div>
          <label className="text-[11px] text-[#64748B] block mb-1">엑셀 파일 (.xlsx / .xls)</label>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile}
            className="text-[12px] text-[#475569] file:mr-3 file:py-1 file:px-3 file:rounded file:border file:border-[rgba(0,0,0,0.12)] file:text-[12px] file:bg-white file:text-[#475569] hover:file:bg-[#F8F9FA]" />
        </div>
      </div>

      {cols.length > 0 && (
        <div className="border border-[rgba(0,0,0,0.1)] rounded-lg p-3 space-y-3 bg-[#F8F9FA]">
          <p className="text-[11px] font-bold text-[#64748B]">컬럼 선택</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-[#64748B] block mb-1">IH번호 컬럼 *</label>
              <Select value={ihCol} onValueChange={v => v !== null && setIhCol(v)}>
                <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
                <SelectContent>{cols.map(c => <SelectItem key={c} value={c} className="text-[12px]">{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-[11px] text-[#64748B] mb-1">
                <input type="checkbox" checked={useNameCol} onChange={e => setUseNameCol(e.target.checked)} className="accent-[#B32646]" />
                직원명 컬럼
              </label>
              <Select value={useNameCol ? (nameCol || cols[0]) : '__none__'}
                onValueChange={v => { if (!v) return; setNameCol(v === '__none__' ? '' : v); setUseNameCol(v !== '__none__') }}>
                <SelectTrigger className="h-8 text-[12px]" disabled={!useNameCol}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="text-[12px]">(직원명 없음 — 센터로 등록)</SelectItem>
                  {cols.map(c => <SelectItem key={c} value={c} className="text-[12px]">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {canManage && (
              <div className="col-span-2 space-y-1">
                <label className="flex items-center gap-1.5 text-[11px] text-[#64748B]">
                  <input type="checkbox" checked={useCtrCol} onChange={e => setUseCtrCol(e.target.checked)} className="accent-[#B32646]" />
                  센터 컬럼 사용 (허용: {TRACKING_CENTERS.join(', ')})
                </label>
                {useCtrCol && (
                  <Select value={ctrCol} onValueChange={v => v !== null && setCtrCol(v)}>
                    <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{cols.map(c => <SelectItem key={c} value={c} className="text-[12px]">{c}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                {!useCtrCol && <p className="text-[11px] text-[#94A3B8]">센터 컬럼 없음 — 전체 행을 [{selCenter}]으로 등록합니다.</p>}
              </div>
            )}
          </div>
          <Button variant="outline" onClick={buildPreview} className="text-[12px] h-8">미리보기</Button>
        </div>
      )}

      {msg && (
        <p className={`text-[12px] ${msg.startsWith('✅')?'text-green-600':msg.startsWith('⚠️')?'text-amber-600':'text-red-500'}`}>{msg}</p>
      )}

      {parsed.length > 0 && (
        <>
          <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-[#F8F9FA] text-[11px] text-[#64748B] flex gap-4">
              <span>등록 대상 <strong>{parsed.length}</strong>건</span>
              <span>분류 성공 <strong className="text-green-600">{parsed.filter(r=>r.dtype).length}</strong>건</span>
              <span>미분류 <strong className="text-orange-500">{parsed.filter(r=>!r.dtype).length}</strong>건</span>
            </div>
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-[#F8F9FA] sticky top-0">
                  <tr>
                    {canManage && <th className="px-3 py-1.5 text-left font-medium text-[#64748B]">센터</th>}
                    <th className="px-3 py-1.5 text-left font-medium text-[#64748B]">IH</th>
                    <th className="px-3 py-1.5 text-left font-medium text-[#64748B]">직원명</th>
                    <th className="px-3 py-1.5 text-left font-medium text-[#64748B]">기종</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.map((r, i) => (
                    <tr key={i} className={i%2===0?'bg-white':'bg-[#FAFAFA]'}>
                      {canManage && <td className="px-3 py-1 text-[#64748B]">{r.center}</td>}
                      <td className="px-3 py-1 font-mono">{r.ih}</td>
                      <td className="px-3 py-1">{r.name || <span className="text-[#94A3B8]">(미배정)</span>}</td>
                      <td className="px-3 py-1">{r.dtype ? <span className="text-[#475569]">{r.dtype} {r.stype}</span> : <span className="text-orange-400">미분류</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <label className="flex items-center gap-2 text-[12px] text-[#475569]">
            <input type="checkbox" checked={doClear} onChange={e => setDoClear(e.target.checked)} className="accent-[#B32646]" />
            <span>
              완전초기화 — 대상 센터({[...new Set(parsed.map(r=>r.center))].join(', ')}) 기존 데이터 <b className="text-[#B32646]">전체 삭제</b> 후 등록
              <span className="text-[#94A3B8]"> (불량·반납·미배정 포함 / 변경이력은 보존)</span>
            </span>
          </label>
          <Button onClick={handleSave} disabled={saving}
            className="bg-[#B32646] hover:bg-[#a8003c] text-white text-[12px] h-8">
            {saving ? '저장 중...' : `✅ ${parsed.length}건 초기 등록 저장`}
          </Button>
        </>
      )}
    </div>
  )
}

// ── 탭: 장애목록 자동교체 ──────────────────────────────────────────────────────
type FaultMatch = { id: string; ih_code: string; center: string; employee_id: string | null; employee_name: string | null; status: string }
type FaultPreview = FaultPair & { oldDevice: string; newDevice: string; deviceMatch: boolean; matches: FaultMatch[] }

function TabFaultSwap({ onRefresh }: { onRefresh: () => void }) {
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<FaultPreview[]>([])
  const [sel, setSel] = useState<Record<number, boolean>>({})
  const [pick, setPick] = useState<Record<number, number>>({})
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name); setMsg(''); setRows([]); setSel({}); setPick({}); setLoading(true)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
      const col = findContentCol((aoa[0] as unknown[]) ?? [])
      const pairs: FaultPair[] = []
      for (let r = 1; r < aoa.length; r++) {
        const p = extractFaultPair(String((aoa[r] as unknown[])?.[col] ?? ''), r + 1)
        if (p) pairs.push(p)
      }
      if (!pairs.length) { setMsg('교체 IH쌍을 찾지 못했습니다. (처리내용/AL열을 확인하세요)'); setLoading(false); return }
      const res = await fetch('/api/bus-tracking/fault-swap', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', pairs }),
      })
      const d = await res.json()
      if (d.error) { setMsg(d.error); setLoading(false); return }
      const pv: FaultPreview[] = d.data ?? []
      setRows(pv)
      const s: Record<number, boolean> = {}
      pv.forEach((row, i) => { if (row.matches.length >= 1) s[i] = true })
      setSel(s)
    } catch { setMsg('파일 읽기 실패') }
    setLoading(false)
  }

  async function apply() {
    const items = rows.flatMap((row, i) => {
      if (!sel[i]) return []
      const m = row.matches[pick[i] ?? 0]
      if (!m) return []
      return [{
        recordId: m.id, oldIh: row.oldIh, newIh: row.newIh,
        center: m.center, employee_id: m.employee_id, employee_name: m.employee_name, oldStatus: m.status,
      }]
    })
    if (!items.length) { setMsg('적용할(매칭된) 항목이 없습니다.'); return }
    setBusy(true); setMsg('')
    try {
      const res = await fetch('/api/bus-tracking/fault-swap', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply', items }),
      })
      const d = await res.json()
      if (d.error) { setMsg(d.error); setBusy(false); return }
      setMsg(`✅ 자동 교체 완료: ${d.applied}건${d.errors?.length ? ` (실패 ${d.errors.length})` : ''}`)
      setRows([]); setSel({}); setPick({}); setFileName('')
      if (fileRef.current) fileRef.current.value = ''
      onRefresh()
    } catch { setMsg('적용 실패') }
    setBusy(false)
  }

  const matchedCount = rows.filter(r => r.matches.length >= 1).length
  const selectedCount = Object.entries(sel).filter(([, v]) => v).length

  return (
    <div className="space-y-3">
      <div className="bg-[#FAFAFA] border border-[#E2E8F0] rounded-lg p-3 space-y-2">
        <div className="text-[12px] font-bold text-[#1E293B]">📥 단말기장애목록 업로드 → 자동 교체</div>
        <p className="text-[11px] text-[#64748B] leading-relaxed">
          장애목록의 <b>처리내용(AL열)</b>에서 <b>「교체 (불량IH → 신규IH)」</b>를 자동 추출합니다.
          불량 IH를 <b>보유 중인 직원/센터</b>를 찾아, 그 보유분을 <b>신규 IH</b>로 교체(불량은 교체완료 처리)합니다.
          아래 미리보기에서 확인 후 적용하세요.
        </p>
        <input ref={fileRef} type="file" accept=".xls,.xlsx" onChange={handleFile} className="hidden" />
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" className="h-8 text-[12px]" onClick={() => fileRef.current?.click()}>
            파일 선택
          </Button>
          <span className="text-[11px] text-[#64748B] truncate max-w-[260px]">{fileName || '선택된 파일 없음'}</span>
          {loading && <span className="text-[11px] text-[#94A3B8]">분석 중…</span>}
        </div>
      </div>

      {rows.length > 0 && (
        <>
          <div className="text-[11px] flex flex-wrap gap-3">
            <span className="text-[#1565c0]">교체 추출 <b>{rows.length}</b></span>
            <span className="text-[#2e7d32]">보유자 매칭 <b>{matchedCount}</b></span>
            <span className="text-[#c62828]">미발견 <b>{rows.length - matchedCount}</b></span>
            <span className="text-[#94A3B8]">선택 {selectedCount}</span>
          </div>
          <div className="overflow-x-auto border border-[#E2E8F0] rounded-lg">
            <table className="w-full text-[11px]">
              <thead className="bg-[#F8F9FA]">
                <tr className="text-[#64748B]">
                  <th className="px-2 py-1.5 w-8"></th>
                  <th className="px-2 py-1.5 text-left">불량 IH → 신규 IH</th>
                  <th className="px-2 py-1.5 text-left">기종</th>
                  <th className="px-2 py-1.5 text-left">보유자(센터·직원·상태)</th>
                  <th className="px-2 py-1.5 text-left">처리내용</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const has = row.matches.length >= 1
                  const m = row.matches[pick[i] ?? 0]
                  return (
                    <tr key={i} className={`border-t border-[#E2E8F0] ${!has ? 'bg-[#fff7f7]' : ''}`}>
                      <td className="px-2 py-1.5 text-center">
                        <input type="checkbox" disabled={!has}
                          checked={!!sel[i]} onChange={e => setSel(s => ({ ...s, [i]: e.target.checked }))} />
                      </td>
                      <td className="px-2 py-1.5 font-mono whitespace-nowrap">
                        <span className="text-[#c62828]">{row.oldIh}</span>
                        <span className="text-[#94A3B8]"> → </span>
                        <span className="text-[#2e7d32]">{row.newIh}</span>
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-[#475569]">
                        {row.newDevice || '미분류'}
                        {!row.deviceMatch && (row.oldDevice || row.newDevice) && (
                          <span className="ml-1 text-[#b45309]" title={`불량 ${row.oldDevice || '미분류'} / 신규 ${row.newDevice || '미분류'}`}>⚠</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {!has ? (
                          <span className="text-[#c62828]">❌ 보유자 미발견</span>
                        ) : row.matches.length === 1 ? (
                          <span className="text-[#475569]">
                            {m.center} · {m.employee_name || '센터보관'} · {STATUS_LABEL[m.status] ?? m.status}
                          </span>
                        ) : (
                          <select className="text-[11px] border border-[#E2E8F0] rounded px-1 py-0.5 bg-white"
                            value={pick[i] ?? 0} onChange={e => setPick(pk => ({ ...pk, [i]: Number(e.target.value) }))}>
                            {row.matches.map((mm, mi) => (
                              <option key={mi} value={mi}>
                                {mm.center} · {mm.employee_name || '센터보관'} · {STATUS_LABEL[mm.status] ?? mm.status}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-[#94A3B8] max-w-[280px] truncate" title={row.raw}>{row.raw}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" disabled={busy || !selectedCount} onClick={apply}
              className="h-8 text-[12px] bg-[#B32646] hover:bg-[#a8003c] text-white">
              {busy ? '교체 중…' : `선택 ${selectedCount}건 자동 교체`}
            </Button>
            {msg && <span className="text-[11px] text-[#475569]">{msg}</span>}
          </div>
        </>
      )}
      {rows.length === 0 && msg && <div className="text-[11px] text-[#c62828]">{msg}</div>}
    </div>
  )
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────────
export default function BusTrackingContent({ user }: { user: SessionUser }) {
  const userCenter = user.assigned_center ?? user.center
  const canManage  = user.role === 'admin' || user.role === 'materials'
  const canWrite   = user.role !== 'guest'
  const canInit    = canManage || user.role === 'manager'

  const [selCenter, setSelCenter] = useState(
    canManage ? TRACKING_CENTERS[0] :
    TRACKING_CENTERS.includes(userCenter) ? userCenter : ''
  )
  const [refreshKey, setRefreshKey] = useState(0)

  if (!canManage && !TRACKING_CENTERS.includes(userCenter)) {
    return <p className="text-[#94A3B8] text-[13px]">이 페이지는 강서·강북·강동·강남·자재센터 소속 직원만 이용할 수 있습니다.</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-[16px] font-bold text-[#1E293B]">📟 센터 단말현황(버스)</h2>
          <p className="text-[11px] text-[#94A3B8] mt-0.5">자재센터에서 출고된 단말기를 직원별로 배정하고 반납을 추적합니다.</p>
        </div>
        {canManage && (
          <Select value={selCenter} onValueChange={v => v !== null && setSelCenter(v)}>
            <SelectTrigger className="h-8 text-[12px] w-32 ml-auto"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TRACKING_CENTERS.map(c => <SelectItem key={c} value={c} className="text-[12px]">{c}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {!canManage && <span className="text-[12px] text-[#64748B] ml-auto font-medium">{selCenter}</span>}
      </div>

      <Tabs defaultValue="assignments">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="assignments" className="text-[12px]">📋 배정 현황</TabsTrigger>
          <TabsTrigger value="center"      className="text-[12px]">🏢 센터 보유현황</TabsTrigger>
          <TabsTrigger value="transfer"    className="text-[12px]">🚛 센터간이동</TabsTrigger>
          <TabsTrigger value="history"     className="text-[12px]">📜 변경이력</TabsTrigger>
          {canInit && <TabsTrigger value="faultswap" className="text-[12px]">🔄 장애목록 자동교체</TabsTrigger>}
          {canInit && <TabsTrigger value="init" className="text-[12px]">📤 초기 등록</TabsTrigger>}
        </TabsList>
        <TabsContent value="assignments" className="mt-4">
          <TabAssignments key={`assign-${selCenter}-${refreshKey}`}
            selCenter={selCenter} user={user} canManage={canManage} canWrite={canWrite}
            onRefresh={() => setRefreshKey(k => k+1)} />
        </TabsContent>
        <TabsContent value="center" className="mt-4">
          <TabCenter key={`center-${selCenter}-${refreshKey}`} selCenter={selCenter} canManage={canManage} />
        </TabsContent>
        <TabsContent value="transfer" className="mt-4">
          <TabTransfer key={`transfer-${selCenter}-${refreshKey}`} selCenter={selCenter} user={user} canManage={canManage} />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <TabHistory key={`hist-${selCenter}`} selCenter={selCenter} />
        </TabsContent>
        {canInit && (
          <TabsContent value="faultswap" className="mt-4">
            <TabFaultSwap key={`faultswap-${refreshKey}`} onRefresh={() => setRefreshKey(k => k + 1)} />
          </TabsContent>
        )}
        {canInit && (
          <TabsContent value="init" className="mt-4">
            <TabInit key={`init-${selCenter}`} selCenter={selCenter}
              userId={user.id} canManage={canManage} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
