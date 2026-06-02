'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import type { SessionUser } from '@/lib/session'

const ROLE_LABEL: Record<string, string> = {
  admin: '관리자', materials: '자재파트',
  manager: '센터장/파트장', user: '사용자', guest: '게스트',
}

export default function MypageContent({ user }: { user: SessionUser }) {
  const router = useRouter()

  // ── 내 정보 수정 ────────────────────────────────────────────────────────
  const [name,     setName]     = useState(user.name)
  const [email,    setEmail]    = useState(user.email)
  const [phone,    setPhone]    = useState(user.phone ?? '')
  const [infoMsg,  setInfoMsg]  = useState('')
  const [infoErr,  setInfoErr]  = useState('')
  const [infoLoad, setInfoLoad] = useState(false)

  // ── 비밀번호 변경 ───────────────────────────────────────────────────────
  const [curPw,   setCurPw]   = useState('')
  const [newPw,   setNewPw]   = useState('')
  const [newPw2,  setNewPw2]  = useState('')
  const [pwMsg,   setPwMsg]   = useState('')
  const [pwErr,   setPwErr]   = useState('')
  const [pwLoad,  setPwLoad]  = useState(false)

  const handleInfoSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !email.trim()) {
      setInfoErr('이름과 이메일은 필수입니다.'); return
    }
    setInfoLoad(true); setInfoErr(''); setInfoMsg('')
    try {
      const res  = await fetch('/api/mypage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone }),
      })
      const data = await res.json()
      if (!res.ok) { setInfoErr(data.error); return }
      setInfoMsg('✅ 정보가 업데이트됐습니다!')
      router.refresh()
    } catch { setInfoErr('네트워크 오류가 발생했습니다.') }
    finally { setInfoLoad(false) }
  }

  const handlePwChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!curPw || !newPw || !newPw2) { setPwErr('모든 항목을 입력하세요.'); return }
    if (newPw !== newPw2)            { setPwErr('새 비밀번호가 일치하지 않습니다.'); return }
    if (newPw.length < 6)            { setPwErr('비밀번호는 6자 이상이어야 합니다.'); return }
    setPwLoad(true); setPwErr(''); setPwMsg('')
    try {
      const res  = await fetch('/api/mypage', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPw: curPw, newPw }),
      })
      const data = await res.json()
      if (!res.ok) { setPwErr(data.error); return }
      setPwMsg('✅ 비밀번호가 변경됐습니다!')
      setCurPw(''); setNewPw(''); setNewPw2('')
    } catch { setPwErr('네트워크 오류가 발생했습니다.') }
    finally { setPwLoad(false) }
  }

  const center = user.assigned_center ?? user.center

  return (
    <div className="max-w-lg space-y-4">
      <h2 className="text-xl font-bold text-[#1E293B]">👤 마이페이지</h2>

      {/* 계정 정보 요약 */}
      <div className="bg-[rgba(179, 38, 70,0.04)] border border-[rgba(179, 38, 70,0.15)] rounded-lg p-3 text-sm space-y-1">
        <div className="flex gap-4 flex-wrap">
          <span><span className="text-[#64748B]">아이디</span> <b className="text-[#1E293B]">{user.username}</b></span>
          <span><span className="text-[#64748B]">권한</span> <b className="text-[#B32646]">{ROLE_LABEL[user.role] ?? user.role}</b></span>
          <span><span className="text-[#64748B]">소속</span> <b className="text-[#1E293B]">{center}</b></span>
        </div>
      </div>

      <Card>
        <CardContent className="pt-5">
          <Tabs defaultValue="info">
            <TabsList className="grid w-full grid-cols-2 mb-5">
              <TabsTrigger value="info">📋 내 정보 수정</TabsTrigger>
              <TabsTrigger value="pw">🔑 비밀번호 변경</TabsTrigger>
            </TabsList>

            {/* ── 내 정보 탭 ── */}
            <TabsContent value="info">
              <form onSubmit={handleInfoSave} className="space-y-4">
                <div className="space-y-2">
                  <Label>이름 *</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="이름" />
                </div>
                <div className="space-y-2">
                  <Label>회사 이메일 *</Label>
                  <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="이메일" />
                </div>
                <div className="space-y-2">
                  <Label>연락처</Label>
                  <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="연락처 (선택)" />
                </div>
                {infoErr && <p className="text-sm text-red-600 bg-red-50 border border-red-200 p-2 rounded">{infoErr}</p>}
                {infoMsg && <p className="text-sm text-green-600 bg-green-50 border border-green-200 p-2 rounded">{infoMsg}</p>}
                <Button type="submit" className="w-full bg-[#B32646] hover:bg-[#B0003D] text-white" disabled={infoLoad}>
                  {infoLoad ? '저장 중...' : '저장'}
                </Button>
              </form>
            </TabsContent>

            {/* ── 비밀번호 탭 ── */}
            <TabsContent value="pw">
              <form onSubmit={handlePwChange} className="space-y-4">
                <div className="space-y-2">
                  <Label>현재 비밀번호</Label>
                  <Input type="password" value={curPw} onChange={e => setCurPw(e.target.value)} placeholder="현재 비밀번호" />
                </div>
                <div className="space-y-2">
                  <Label>새 비밀번호 (6자 이상)</Label>
                  <Input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="새 비밀번호" />
                </div>
                <div className="space-y-2">
                  <Label>새 비밀번호 확인</Label>
                  <Input type="password" value={newPw2} onChange={e => setNewPw2(e.target.value)} placeholder="새 비밀번호 확인" />
                </div>
                {pwErr && <p className="text-sm text-red-600 bg-red-50 border border-red-200 p-2 rounded">{pwErr}</p>}
                {pwMsg && <p className="text-sm text-green-600 bg-green-50 border border-green-200 p-2 rounded">{pwMsg}</p>}
                <Button type="submit" className="w-full bg-[#B32646] hover:bg-[#B0003D] text-white" disabled={pwLoad}>
                  {pwLoad ? '변경 중...' : '비밀번호 변경'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
