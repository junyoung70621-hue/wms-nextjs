'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
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

export default function LoginPage() {
  const router = useRouter()

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

  // 비밀번호 찾기
  const [resetEmail, setResetEmail] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetSuccess, setResetSuccess] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  // 자동 로그아웃 안내
  const [idleNotice, setIdleNotice] = useState(false)

  // 저장된 아이디 불러오기 + 자동 로그아웃 여부 확인
  useEffect(() => {
    const saved = localStorage.getItem('wms_saved_id')
    if (saved) {
      setUsername(saved)
      setRememberMe(true)
    }
    if (new URLSearchParams(window.location.search).get('reason') === 'idle') {
      setIdleNotice(true)
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
      // 알림 클릭 등으로 ?next=가 있으면 그 페이지로, 없으면 대시보드
      const next = new URLSearchParams(window.location.search).get('next')
      const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'
      router.push(dest)
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
    <div className="min-h-screen bg-[#f8f9ff] flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* 헤더 */}
        <div className="text-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/atec_logo_full.png"
            alt="에이텍모빌리티"
            className="mx-auto h-10 w-auto"
          />
          <p className="text-gray-500 text-lg font-medium mt-3">자재관리 시스템</p>
        </div>

        {idleNotice && (
          <div className="mb-4 rounded-md border border-[#f3c6d1] bg-[#fbe9ee] px-4 py-3 text-center text-[13px] font-medium text-[#b32646]">
            장시간 활동이 없어 자동 로그아웃되었습니다. 다시 로그인해 주세요.
          </div>
        )}

        <Card>
          <CardContent className="pt-6">
            <Tabs defaultValue="login">
              <TabsList className="grid w-full grid-cols-3 mb-6">
                <TabsTrigger value="login" className="data-active:bg-[#B32646] data-active:text-white">🔑 로그인</TabsTrigger>
                <TabsTrigger value="register" className="data-active:bg-[#B32646] data-active:text-white">✏️ 회원가입</TabsTrigger>
                <TabsTrigger value="reset" className="data-active:bg-[#B32646] data-active:text-white">🔓 찾기</TabsTrigger>
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

              {/* ── 비밀번호 찾기 탭 ── */}
              <TabsContent value="reset">
                {resetSuccess ? (
                  <div className="text-center py-8 space-y-2">
                    <p className="text-green-600 font-semibold text-lg">
                      ✅ 임시 비밀번호 발송 완료
                    </p>
                    <p className="text-sm text-gray-500">
                      {resetEmail}로 임시 비밀번호를 발송했습니다.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleReset} className="space-y-4">
                    <p className="text-sm text-gray-500">
                      가입 시 등록한 회사 이메일로 임시 비밀번호를 발송합니다.
                    </p>
                    <div className="space-y-2">
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
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-gray-400 mt-4">
          © 에이텍모빌리티 자재관리 시스템
        </p>
      </div>
    </div>
  )
}
