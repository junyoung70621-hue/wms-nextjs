'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { CENTERS } from '@/constants/centers'
import type { SessionUser } from '@/lib/session'

// ── 타입 ──────────────────────────────────────────────────────────────────────
type UserRow = {
  id: string
  username: string
  name: string
  email: string
  phone: string | null
  center: string
  assigned_center: string | null
  role: string
  is_approved: boolean
  created_at: string
}

const ROLES = ['admin', 'materials', 'manager', 'user', 'guest']
const ROLE_LABEL: Record<string, string> = {
  admin: 'ADMIN', materials: 'MATERIALS', manager: 'MANAGER', user: 'USER', guest: 'GUEST',
}
const ROLE_COLOR: Record<string, string> = {
  admin: '#D3004F', materials: '#7c3aed', manager: '#1565c0', user: '#2e7d32', guest: '#64748B',
}

function tsKst(ts: string) {
  if (!ts) return ''
  try {
    return new Date(new Date(ts).getTime() + 9 * 3600 * 1000)
      .toISOString().slice(0, 10)
  } catch { return ts.slice(0, 10) }
}

// ── 유저 행 ───────────────────────────────────────────────────────────────────
function UserRow({
  u, myId, onSave, onDelete,
}: {
  u: UserRow
  myId: string
  onSave: (id: string, patch: Record<string, unknown>) => Promise<void>
  onDelete: (id: string, name: string) => Promise<void>
}) {
  const [open,   setOpen]   = useState(false)
  const [role,   setRole]   = useState(u.role)
  const [center, setCenter] = useState(u.center)
  const [aCenter, setACenter] = useState(u.assigned_center ?? '')
  const [newPw,  setNewPw]  = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const isSelf = u.id === myId

  const handleApprove = async () => {
    setSaving(true)
    try { await onSave(u.id, { is_approved: true, role: 'user' }) }
    finally { setSaving(false) }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const patch: Record<string, unknown> = { role, center, assigned_center: aCenter || null }
      if (newPw.trim()) patch.reset_password = newPw.trim()
      await onSave(u.id, patch)
      setNewPw('')
      setOpen(false)
    } finally { setSaving(false) }
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-7 h-7 flex-shrink-0 rounded flex items-center justify-center text-[11px] font-bold text-white"
            style={{ background: ROLE_COLOR[u.role] ?? '#555' }}
          >
            {u.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <span className="text-[13px] font-semibold text-[#1E293B]">{u.name}</span>
            <span className="text-[11px] text-[#64748B] ml-2">@{u.username}</span>
            <div className="text-[11px] text-[#94A3B8] mt-0.5">
              {u.center}{u.assigned_center ? ` → ${u.assigned_center}` : ''} · {tsKst(u.created_at)} 가입
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {!u.is_approved && (
            <span className="text-[10px] font-bold text-white bg-[#f57c00] rounded px-1.5 py-0.5">
              미승인
            </span>
          )}
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
            style={{ color: ROLE_COLOR[u.role] ?? '#555', background: (ROLE_COLOR[u.role] ?? '#555') + '18' }}
          >
            {ROLE_LABEL[u.role] ?? u.role}
          </span>
          <span className="text-[#94A3B8]">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="px-4 py-4 bg-[#F8F9FA] border-t border-[rgba(0,0,0,0.06)] space-y-4">
          {/* 계정 정보 */}
          <div className="grid grid-cols-2 gap-2 text-[12px] text-[#475569]">
            <div><span className="text-[#94A3B8]">이메일:</span> {u.email}</div>
            <div><span className="text-[#94A3B8]">전화:</span> {u.phone ?? '-'}</div>
          </div>

          {/* 미승인 빠른 승인 */}
          {!u.is_approved && (
            <div className="flex items-center gap-2 p-3 bg-[#fff8e1] border border-[#f57c00] rounded-lg">
              <span className="text-[12px] text-[#f57c00] font-medium flex-1">
                승인 대기 중인 계정입니다.
              </span>
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={saving}
                className="bg-[#2e7d32] hover:bg-[#1b5e20] text-white text-[11px]"
              >
                {saving ? '처리중...' : '승인'}
              </Button>
            </div>
          )}

          {/* 역할 / 센터 변경 */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[11px] text-[#64748B] mb-1 block">역할</label>
              <Select value={role} onValueChange={v => v !== null && setRole(v)} disabled={isSelf}>
                <SelectTrigger className="h-8 text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => (
                    <SelectItem key={r} value={r} className="text-[12px]">
                      {ROLE_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] text-[#64748B] mb-1 block">소속 센터</label>
              <Select value={center} onValueChange={v => v !== null && setCenter(v)}>
                <SelectTrigger className="h-8 text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CENTERS.map(c => (
                    <SelectItem key={c} value={c} className="text-[12px]">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] text-[#64748B] mb-1 block">지정 센터 (선택)</label>
              <Select value={aCenter} onValueChange={v => v !== null && setACenter(v)}>
                <SelectTrigger className="h-8 text-[12px]">
                  <SelectValue placeholder="없음" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="" className="text-[12px]">없음</SelectItem>
                  {CENTERS.map(c => (
                    <SelectItem key={c} value={c} className="text-[12px]">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 비밀번호 초기화 */}
          <div>
            <label className="text-[11px] text-[#64748B] mb-1 block">
              비밀번호 초기화 (입력 시 변경)
            </label>
            <Input
              type="password"
              placeholder="새 비밀번호 (6자 이상)"
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              className="h-8 text-[12px] max-w-xs"
            />
          </div>

          {/* 저장 / 삭제 */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || isSelf}
              className="bg-[#D3004F] hover:bg-[#a8003c] text-white text-[11px]"
            >
              {saving ? '저장 중...' : '저장'}
            </Button>
            {isSelf ? (
              <span className="text-[11px] text-[#94A3B8]">본인 계정은 수정/삭제 불가</span>
            ) : (
              <>
                {!confirmDel ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmDel(true)}
                    className="text-red-500 border-red-200 text-[11px]"
                  >
                    삭제
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      onClick={() => onDelete(u.id, u.name)}
                      className="bg-red-600 hover:bg-red-700 text-white text-[11px]"
                    >
                      정말 삭제
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDel(false)}
                      className="text-[11px]"
                    >
                      취소
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── 자재 추가 폼 ──────────────────────────────────────────────────────────────
function AddItemForm({ onAdded }: { onAdded: () => void }) {
  const blank = {
    item_name: '', quantity: '0', location: '',
    rack_no: '', shelf: '', box_no: '',
    category_large: '', category_mid: '', category_small: '',
    erp_name: '', erp_code: '', notes: '',
  }
  const [form,   setForm]   = useState(blank)
  const [saving, setSaving] = useState(false)
  const [msg,    setMsg]    = useState('')

  const set = (k: keyof typeof blank) => (v: string) =>
    setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.item_name.trim() || !form.location) {
      setMsg('품명과 센터는 필수입니다.')
      return
    }
    setSaving(true)
    setMsg('')
    try {
      const res = await fetch('/api/admin/warehouse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, quantity: Number(form.quantity) }),
      })
      const d = await res.json()
      if (d.error) { setMsg(d.error); return }
      setMsg('추가 완료!')
      setForm(blank)
      onAdded()
    } catch { setMsg('오류 발생') }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] text-[#64748B] mb-1 block">품명 *</label>
          <Input value={form.item_name} onChange={e => set('item_name')(e.target.value)}
            placeholder="품명 입력" className="h-8 text-[12px]" />
        </div>
        <div>
          <label className="text-[11px] text-[#64748B] mb-1 block">수량 *</label>
          <Input type="number" min="0" value={form.quantity}
            onChange={e => set('quantity')(e.target.value)}
            className="h-8 text-[12px]" />
        </div>
        <div>
          <label className="text-[11px] text-[#64748B] mb-1 block">센터 *</label>
          <Select value={form.location} onValueChange={v => v !== null && set('location')(v)}>
            <SelectTrigger className="h-8 text-[12px]"><SelectValue placeholder="센터 선택" /></SelectTrigger>
            <SelectContent>
              {CENTERS.map(c => <SelectItem key={c} value={c} className="text-[12px]">{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[11px] text-[#64748B] mb-1 block">랙 번호</label>
          <Input value={form.rack_no} onChange={e => set('rack_no')(e.target.value)}
            placeholder="예: A-01" className="h-8 text-[12px]" />
        </div>
        <div>
          <label className="text-[11px] text-[#64748B] mb-1 block">선반</label>
          <Input value={form.shelf} onChange={e => set('shelf')(e.target.value)}
            className="h-8 text-[12px]" />
        </div>
        <div>
          <label className="text-[11px] text-[#64748B] mb-1 block">박스 번호</label>
          <Input value={form.box_no} onChange={e => set('box_no')(e.target.value)}
            className="h-8 text-[12px]" />
        </div>
        <div>
          <label className="text-[11px] text-[#64748B] mb-1 block">대분류</label>
          <Input value={form.category_large} onChange={e => set('category_large')(e.target.value)}
            className="h-8 text-[12px]" />
        </div>
        <div>
          <label className="text-[11px] text-[#64748B] mb-1 block">중분류</label>
          <Input value={form.category_mid} onChange={e => set('category_mid')(e.target.value)}
            className="h-8 text-[12px]" />
        </div>
        <div>
          <label className="text-[11px] text-[#64748B] mb-1 block">소분류</label>
          <Input value={form.category_small} onChange={e => set('category_small')(e.target.value)}
            className="h-8 text-[12px]" />
        </div>
        <div>
          <label className="text-[11px] text-[#64748B] mb-1 block">ERP 품명</label>
          <Input value={form.erp_name} onChange={e => set('erp_name')(e.target.value)}
            className="h-8 text-[12px]" />
        </div>
        <div>
          <label className="text-[11px] text-[#64748B] mb-1 block">ERP 코드</label>
          <Input value={form.erp_code} onChange={e => set('erp_code')(e.target.value)}
            className="h-8 text-[12px]" />
        </div>
        <div>
          <label className="text-[11px] text-[#64748B] mb-1 block">비고</label>
          <Input value={form.notes} onChange={e => set('notes')(e.target.value)}
            className="h-8 text-[12px]" />
        </div>
      </div>

      {msg && (
        <p className={`text-[12px] ${msg.includes('완료') ? 'text-green-600' : 'text-red-500'}`}>
          {msg}
        </p>
      )}

      <Button
        onClick={handleSubmit}
        disabled={saving}
        className="bg-[#D3004F] hover:bg-[#a8003c] text-white text-[12px]"
      >
        {saving ? '추가 중...' : '자재 추가'}
      </Button>
    </div>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export default function AdminContent({ user }: { user: SessionUser }) {
  const [users,       setUsers]       = useState<UserRow[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [filterRole,  setFilterRole]  = useState('all')
  const [filterApprv, setFilterApprv] = useState('all')
  const [search,      setSearch]      = useState('')

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/users')
      const d = await res.json()
      if (d.error) { setError(d.error); return }
      setUsers(d.data)
    } catch { setError('로드 실패') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadUsers() }, [loadUsers])

  const handleSave = async (id: string, patch: Record<string, unknown>) => {
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    })
    const d = await res.json()
    if (d.error) { alert(d.error); return }
    await loadUsers()
  }

  const handleDelete = async (id: string, name: string) => {
    const res = await fetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    const d = await res.json()
    if (d.error) { alert(d.error); return }
    alert(`${name} 계정이 삭제되었습니다.`)
    await loadUsers()
  }

  const filtered = users.filter(u => {
    if (filterRole !== 'all' && u.role !== filterRole) return false
    if (filterApprv === 'pending' && u.is_approved) return false
    if (filterApprv === 'approved' && !u.is_approved) return false
    if (search) {
      const q = search.toLowerCase()
      if (
        !u.name.toLowerCase().includes(q) &&
        !u.username.toLowerCase().includes(q) &&
        !u.email.toLowerCase().includes(q) &&
        !u.center.toLowerCase().includes(q)
      ) return false
    }
    return true
  })

  const pendingCount = users.filter(u => !u.is_approved).length

  return (
    <Tabs defaultValue="users">
      <TabsList className="mb-4">
        <TabsTrigger value="users">
          유저 관리
          {pendingCount > 0 && (
            <span className="ml-1.5 bg-[#f57c00] text-white text-[10px] font-bold rounded px-1.5 py-0.5">
              {pendingCount}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="add-item">자재 추가</TabsTrigger>
      </TabsList>

      {/* ── 유저 관리 탭 ── */}
      <TabsContent value="users" className="space-y-3">
        {/* 필터 */}
        <div className="flex flex-wrap gap-2 items-center">
          <Input
            placeholder="이름 / 아이디 / 이메일 검색"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 text-[12px] w-52"
          />
          <Select value={filterRole} onValueChange={v => v !== null && setFilterRole(v)}>
            <SelectTrigger className="h-8 text-[12px] w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-[12px]">전체 역할</SelectItem>
              {ROLES.map(r => (
                <SelectItem key={r} value={r} className="text-[12px]">{ROLE_LABEL[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterApprv} onValueChange={v => v !== null && setFilterApprv(v)}>
            <SelectTrigger className="h-8 text-[12px] w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all"      className="text-[12px]">전체</SelectItem>
              <SelectItem value="pending"  className="text-[12px]">미승인만</SelectItem>
              <SelectItem value="approved" className="text-[12px]">승인됨만</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-[11px] text-[#94A3B8] ml-auto">
            {filtered.length} / {users.length}명
          </span>
        </div>

        {loading ? (
          <div className="text-[12px] text-[#94A3B8] py-8 text-center">불러오는 중...</div>
        ) : error ? (
          <div className="text-red-500 text-[12px]">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="text-[12px] text-[#94A3B8] py-8 text-center">해당 조건의 유저 없음</div>
        ) : (
          <div className="space-y-2">
            {filtered.map(u => (
              <UserRow
                key={u.id}
                u={u}
                myId={user.id}
                onSave={handleSave}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </TabsContent>

      {/* ── 자재 추가 탭 ── */}
      <TabsContent value="add-item">
        <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] p-4">
          <h3 className="text-[13px] font-semibold text-[#1E293B] mb-4">신규 자재 등록</h3>
          <AddItemForm onAdded={() => {}} />
        </div>
      </TabsContent>
    </Tabs>
  )
}
