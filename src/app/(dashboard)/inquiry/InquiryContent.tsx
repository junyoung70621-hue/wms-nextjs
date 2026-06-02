'use client'

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type Inquiry = {
  id: string
  title: string
  content: string
  status: 'pending' | 'answered'
  reply: string | null
  requester_name: string
  requester_email: string
  from_center: string
  created_at: string
  answered_at: string | null
  answered_by_name: string | null
}

function tsKst(ts: string) {
  if (!ts) return ''
  try {
    return new Date(new Date(ts).getTime() + 9 * 60 * 60 * 1000)
      .toISOString().slice(0, 16).replace('T', ' ')
  } catch { return ts.slice(0, 10) }
}

function InquiryCard({
  inq, isAdmin, onReplySubmit,
}: {
  inq: Inquiry
  isAdmin: boolean
  onReplySubmit: (id: string, reply: string) => Promise<void>
}) {
  const [open,       setOpen]       = useState(false)
  const [replyOpen,  setReplyOpen]  = useState(false)
  const [replyText,  setReplyText]  = useState(inq.reply ?? '')
  const [replyLoad,  setReplyLoad]  = useState(false)
  const [replyErr,   setReplyErr]   = useState('')

  const isPending = inq.status === 'pending'

  const handleReply = async () => {
    if (!replyText.trim()) { setReplyErr('답변 내용을 입력하세요.'); return }
    setReplyLoad(true); setReplyErr('')
    try { await onReplySubmit(inq.id, replyText); setReplyOpen(false) }
    catch (e: unknown) { setReplyErr((e as Error).message) }
    finally { setReplyLoad(false) }
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-[11px] font-bold flex-shrink-0 ${isPending ? 'text-[#B32646]' : 'text-[#0284C7]'}`}>
            {isPending ? '⏳ 미답변' : '✅ 답변완료'}
          </span>
          <span className="text-[13px] font-medium text-[#1E293B] truncate">{inq.title}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-3 text-[11px] text-[#94A3B8]">
          {isAdmin && <span>{inq.requester_name} ({inq.from_center})</span>}
          <span>{inq.created_at.slice(0, 10)}</span>
          <span>{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 bg-white border-t border-[rgba(0,0,0,0.06)] space-y-3">
          {/* 문의 내용 */}
          <div className="mt-3 p-4 bg-[#F8F9FA] rounded border-l-[3px] border-l-[#B32646] text-[13px] text-[#1E293B] whitespace-pre-wrap">
            {inq.content}
          </div>

          {/* 기존 답변 */}
          {inq.reply && (
            <div>
              <p className="text-[11px] font-semibold text-[#0284C7] mb-1">
                💬 답변 — {inq.answered_by_name} | {tsKst(inq.answered_at ?? '')}
              </p>
              <div className="p-4 bg-[#F0F9FF] rounded border-l-[3px] border-l-[#0284C7] text-[13px] text-[#1E293B] whitespace-pre-wrap">
                {inq.reply}
              </div>
            </div>
          )}

          {/* 관리자 답변 버튼 */}
          {isAdmin && (
            <div>
              <Button size="sm" variant="outline" onClick={() => setReplyOpen(o => !o)}>
                {replyOpen ? '▲ 닫기' : (inq.reply ? '✏️ 답변 수정' : '💬 답변 등록')}
              </Button>
              {replyOpen && (
                <div className="mt-2 space-y-2">
                  <textarea
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    rows={4}
                    className="w-full border rounded px-3 py-2 text-sm text-[#1E293B] bg-white focus:outline-none focus:border-[#B32646] resize-none"
                    placeholder="답변 내용을 입력하세요."
                  />
                  {replyErr && <p className="text-sm text-red-600">{replyErr}</p>}
                  <div className="flex gap-2">
                    <Button onClick={handleReply} disabled={replyLoad}
                      className="bg-[#B32646] hover:bg-[#B0003D] text-white" size="sm">
                      {replyLoad ? '등록 중...' : '답변 등록'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setReplyOpen(false)}>취소</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function InquiryContent({ isAdmin }: { isAdmin: boolean }) {
  const [data,    setData]    = useState<Inquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [title,   setTitle]   = useState('')
  const [content, setContent] = useState('')
  const [submitLoad, setSubmitLoad] = useState(false)
  const [submitMsg,  setSubmitMsg]  = useState('')
  const [submitErr,  setSubmitErr]  = useState('')

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/inquiry')
      const json = await res.json()
      setData(json.data ?? [])
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) {
      setSubmitErr('제목과 내용을 입력하세요.'); return
    }
    setSubmitLoad(true); setSubmitErr(''); setSubmitMsg('')
    try {
      const res = await fetch('/api/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content }),
      })
      const json = await res.json()
      if (!res.ok) { setSubmitErr(json.error); return }
      setSubmitMsg('✅ 문의가 접수되었습니다. 관리자 확인 후 답변드립니다.')
      setTitle(''); setContent(''); fetchData()
    } catch { setSubmitErr('네트워크 오류가 발생했습니다.') }
    finally { setSubmitLoad(false) }
  }

  const handleReplySubmit = async (id: string, reply: string) => {
    const res = await fetch('/api/inquiry/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, reply }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error)
    fetchData()
  }

  const pendingCount = data.filter(i => i.status === 'pending').length

  // 관리자 뷰
  if (isAdmin) {
    return (
      <div className="space-y-4 max-w-3xl">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-[#1E293B]">💬 전체 문의 목록</h2>
          <Button variant="outline" onClick={fetchData} disabled={loading}>🔄 새로고침</Button>
        </div>

        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending">미답변 ({pendingCount})</TabsTrigger>
            <TabsTrigger value="all">전체 ({data.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="pending" className="space-y-2 mt-3">
            {data.filter(i => i.status === 'pending').length === 0
              ? <p className="text-gray-400 text-sm text-center py-8">미답변 문의가 없습니다.</p>
              : data.filter(i => i.status === 'pending').map(inq => (
                <InquiryCard key={inq.id} inq={inq} isAdmin onReplySubmit={handleReplySubmit} />
              ))}
          </TabsContent>
          <TabsContent value="all" className="space-y-2 mt-3">
            {data.length === 0
              ? <p className="text-gray-400 text-sm text-center py-8">문의 내역이 없습니다.</p>
              : data.map(inq => (
                <InquiryCard key={inq.id} inq={inq} isAdmin onReplySubmit={handleReplySubmit} />
              ))}
          </TabsContent>
        </Tabs>
      </div>
    )
  }

  // 일반 사용자 뷰
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-[#1E293B]">💬 문의하기</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 문의 작성 */}
        <div className="space-y-3">
          <h3 className="font-semibold text-[#1E293B]">문의 작성</h3>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <Label>제목</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="문의 제목을 입력해주세요." />
            </div>
            <div className="space-y-1">
              <Label>내용</Label>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                rows={6}
                className="w-full border rounded px-3 py-2 text-sm text-[#1E293B] bg-white focus:outline-none focus:border-[#B32646] resize-none"
                placeholder="문의 내용을 상세히 입력해주세요."
              />
            </div>
            {submitErr && <p className="text-sm text-red-600 bg-red-50 border border-red-200 p-2 rounded">{submitErr}</p>}
            {submitMsg && <p className="text-sm text-green-600 bg-green-50 border border-green-200 p-2 rounded">{submitMsg}</p>}
            <Button type="submit" className="w-full bg-[#B32646] hover:bg-[#B0003D] text-white" disabled={submitLoad}>
              {submitLoad ? '제출 중...' : '📨 제출'}
            </Button>
          </form>
        </div>

        {/* 내 문의 내역 */}
        <div className="space-y-3">
          <h3 className="font-semibold text-[#1E293B]">내 문의 내역</h3>
          {loading ? (
            <p className="text-gray-400 text-sm">로딩 중...</p>
          ) : data.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">접수된 문의가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {data.map(inq => (
                <InquiryCard key={inq.id} inq={inq} isAdmin={false} onReplySubmit={handleReplySubmit} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
