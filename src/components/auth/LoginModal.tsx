'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CENTERS } from '@/constants/centers'

export type AuthTab = 'login' | 'register' | 'find'

export default function LoginModal({
  defaultTab = 'login',
  onClose,
}: {
  defaultTab?: AuthTab
  onClose: () => void
}) {
  // 로그인
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  // 회원가입
  const [reg, setReg] = useState({
    username: '', password: '', password2: '',
    name: '', email: '', phone: '', center: '',
  })
  const [regError, setRegError] = useState('')
  const [regSuccess, setRegSuccess] = useState(false)
  const [regLoading, setRegLoading] = useState(false)

  // 아이디 찾기
  const [findName, setFindName] = useState('')
  const [findEmail, setFindEmail] = useState('')
  const [findError, setFindError] = useState('')
  const [findResult, setFindResult] = useState('')
  const [findLoading, setFindLoading] = useState(false)

  // 비밀번호 찾기
  const [resetEmail, setResetEmail] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetSuccess, setResetSuccess] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  // 저장된 아이디 불러오기
  useEffect(() => {
    const saved = localStorage.getItem('wms_saved_id')
    if (saved) {
      setUsername(saved)
      setRememberMe(true)
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) {
      setLoginError('아이디와 비밀번호를 입력하세요.')
      return
    }
    setLoginLoading(true)
    setLoginError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setLoginError(data.error || '로그인에 실패했습니다.')
        return
      }
      if (rememberMe) {
        localStorage.setItem('wms_saved_id', username)
      } else {
        localStorage.removeItem('wms_saved_id')
      }
      // 세션 쿠키가 생겼으니 풀 리로드 → 서버가 실제 화면 렌더
      window.location.reload()
    } catch {
      setLoginError('네트워크 오류가 발생했습니다.')
    } finally {
      setLoginLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegError('')
    if (!reg.username || !reg.password || !reg.password2 || !reg.name || !reg.email || !reg.center) {
      setRegError('* 표시 항목은 필수입니다.')
      return
    }
    if (reg.password !== reg.password2) {
      setRegError('비밀번호가 일치하지 않습니다.')
      return
    }
    if (reg.password.length < 6) {
      setRegError('비밀번호는 6자 이상이어야 합니다.')
      return
    }
    setRegLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reg),
      })
      const data = await res.json()
      if (!res.ok) {
        setRegError(data.error || '회원가입에 실패했습니다.')
        return
      }
      setRegSuccess(true)
    } catch {
      setRegError('네트워크 오류가 발생했습니다.')
    } finally {
      setRegLoading(false)
    }
  }

  const handleFindId = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!findName || !findEmail) {
      setFindError('이름과 이메일을 입력하세요.')
      return
    }
    setFindLoading(true)
    setFindError('')
    setFindResult('')
    try {
      const res = await fetch('/api/auth/find-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: findName, email: findEmail }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFindError(data.error || '처리에 실패했습니다.')
        return
      }
      setFindResult(data.username)
    } catch {
      setFindError('네트워크 오류가 발생했습니다.')
    } finally {
      setFindLoading(false)
    }
  }

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetEmail) {
      setResetError('이메일을 입력하세요.')
      return
    }
    setResetLoading(true)
    setResetError('')
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail }),
      })
      const data = await res.json()
      if (!res.ok) {
        setResetError(data.error || '처리에 실패했습니다.')
        return
      }
      setResetSuccess(true)
    } catch {
      setResetError('네트워크 오류가 발생했습니다.')
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-white rounded-xl shadow-xl modal-pop"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="relative px-6 pt-6 pb-2 text-center">
          <button
            onClick={onClose}
            aria-label="닫기"
            className="absolute right-4 top-4 p-1 rounded text-[#64748B] hover:bg-[rgba(0,0,0,0.06)] hover:text-[#1E293B] transition-colors"
          >
            <X size={18} strokeWidth={2} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/atec_logo_full.png"
            alt="에이텍모빌리티"
            className="mx-auto h-8 w-auto"
          />
          <p className="text-gray-500 text-sm font-medium mt-2">
            자재관리 시스템 — 로그인 또는 회원가입 후 이용할 수 있습니다
          </p>
        </div>

        <div className="px-6 pb-6 pt-2">
          <Tabs defaultValue={defaultTab}>
            <TabsList className="grid w-full grid-cols-3 mb-5">
              <TabsTrigger value="login" className="data-active:bg-[#B32646] data-active:text-white">🔑 로그인</TabsTrigger>
              <TabsTrigger value="register" className="data-active:bg-[#B32646] data-active:text-white">✏️ 회원가입</TabsTrigger>
              <TabsTrigger value="find" className="data-active:bg-[#B32646] data-active:text-white">🔓 찾기</TabsTrigger>
            </TabsList>

            {/* ── 로그인 탭 ── */}
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-id">아이디</Label>
                  <Input
                    id="login-id"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="아이디 입력"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-pw">비밀번호</Label>
                  <Input
                    id="login-pw"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="비밀번호 입력"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="remember"
                    checked={rememberMe}
                    onCheckedChange={v => setRememberMe(!!v)}
                  />
                  <Label
                    htmlFor="remember"
                    className="text-sm font-normal cursor-pointer"
                  >
                    아이디 저장
                  </Label>
                </div>
                {loginError && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 p-2 rounded">
                    {loginError}
                  </p>
                )}
                <Button
                  type="submit"
                  className="w-full bg-[#B32646] hover:bg-[#B0003D] text-white"
                  disabled={loginLoading}
                >
                  {loginLoading ? '로그인 중...' : '로그인'}
                </Button>
              </form>
            </TabsContent>

            {/* ── 회원가입 탭 ── */}
            <TabsContent value="register">
              {regSuccess ? (
                <div className="text-center py-8 space-y-2">
                  <p className="text-green-600 font-semibold text-lg">
                    ✅ 회원가입 신청 완료
                  </p>
                  <p className="text-sm text-gray-500">
                    관리자 승인 후 로그인하세요.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleRegister} className="space-y-3">
                  <div className="space-y-1">
                    <Label>아이디 *</Label>
                    <Input
                      value={reg.username}
                      onChange={e => setReg({ ...reg, username: e.target.value })}
                      placeholder="아이디"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>비밀번호 * (6자 이상)</Label>
                    <Input
                      type="password"
                      value={reg.password}
                      onChange={e => setReg({ ...reg, password: e.target.value })}
                      placeholder="비밀번호"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>비밀번호 확인 *</Label>
                    <Input
                      type="password"
                      value={reg.password2}
                      onChange={e => setReg({ ...reg, password2: e.target.value })}
                      placeholder="비밀번호 확인"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>이름 *</Label>
                    <Input
                      value={reg.name}
                      onChange={e => setReg({ ...reg, name: e.target.value })}
                      placeholder="이름"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>회사 이메일 *</Label>
                    <Input
                      type="email"
                      value={reg.email}
                      onChange={e => setReg({ ...reg, email: e.target.value })}
                      placeholder="이메일"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>연락처</Label>
                    <Input
                      value={reg.phone}
                      onChange={e => setReg({ ...reg, phone: e.target.value })}
                      placeholder="연락처 (선택)"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>소속 센터 *</Label>
                    <Select
                      value={reg.center}
                      onValueChange={v => v !== null && setReg({ ...reg, center: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="센터 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {CENTERS.map(c => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {regError && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 p-2 rounded">
                      {regError}
                    </p>
                  )}
                  <Button
                    type="submit"
                    className="w-full bg-[#B32646] hover:bg-[#B0003D] text-white"
                    disabled={regLoading}
                  >
                    {regLoading ? '신청 중...' : '회원가입 신청'}
                  </Button>
                </form>
              )}
            </TabsContent>

            {/* ── 아이디/비밀번호 찾기 탭 ── */}
            <TabsContent value="find">
              <div className="space-y-6">
                {/* 아이디 찾기 */}
                <form onSubmit={handleFindId} className="space-y-3">
                  <p className="text-[13px] font-bold text-[#1E293B]">아이디 찾기</p>
                  <p className="text-sm text-gray-500">
                    가입 시 등록한 이름과 회사 이메일이 일치하면 아이디를 알려드립니다.
                  </p>
                  <div className="space-y-1">
                    <Label>이름</Label>
                    <Input
                      value={findName}
                      onChange={e => setFindName(e.target.value)}
                      placeholder="이름 입력"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>회사 이메일</Label>
                    <Input
                      type="email"
                      value={findEmail}
                      onChange={e => setFindEmail(e.target.value)}
                      placeholder="이메일 입력"
                    />
                  </div>
                  {findError && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 p-2 rounded">
                      {findError}
                    </p>
                  )}
                  {findResult && (
                    <p className="text-sm text-green-700 bg-green-50 border border-green-200 p-2 rounded">
                      회원님의 아이디는 <span className="font-bold font-mono">{findResult}</span> 입니다.
                    </p>
                  )}
                  <Button
                    type="submit"
                    className="w-full bg-[#B32646] hover:bg-[#B0003D] text-white"
                    disabled={findLoading}
                  >
                    {findLoading ? '조회 중...' : '아이디 찾기'}
                  </Button>
                </form>

                <div className="border-t border-[#e2e8f0]" />

                {/* 비밀번호 찾기 */}
                {resetSuccess ? (
                  <div className="text-center py-4 space-y-2">
                    <p className="text-green-600 font-semibold text-lg">
                      ✅ 임시 비밀번호 발송 완료
                    </p>
                    <p className="text-sm text-gray-500">
                      {resetEmail}로 임시 비밀번호를 발송했습니다.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleReset} className="space-y-3">
                    <p className="text-[13px] font-bold text-[#1E293B]">비밀번호 찾기</p>
                    <p className="text-sm text-gray-500">
                      가입 시 등록한 회사 이메일로 임시 비밀번호를 발송합니다.
                    </p>
                    <div className="space-y-1">
                      <Label>회사 이메일</Label>
                      <Input
                        type="email"
                        value={resetEmail}
                        onChange={e => setResetEmail(e.target.value)}
                        placeholder="이메일 입력"
                      />
                    </div>
                    {resetError && (
                      <p className="text-sm text-red-600 bg-red-50 border border-red-200 p-2 rounded">
                        {resetError}
                      </p>
                    )}
                    <Button
                      type="submit"
                      className="w-full bg-[#B32646] hover:bg-[#B0003D] text-white"
                      disabled={resetLoading}
                    >
                      {resetLoading ? '발송 중...' : '임시 비밀번호 발송'}
                    </Button>
                  </form>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
