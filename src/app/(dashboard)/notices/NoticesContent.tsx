'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'

const ATTACH_BUCKET = 'notice-attachments'
const MAX_ATTACH = 10
const MAX_FILE_MB = 20

type Notice = {
  id: string
  title: string
  content: string
  is_active: boolean
  created_at: string
  attachments: { name: string; url: string }[]
  users: { name: string } | null
}

function tsKst(ts: string) {
  if (!ts) return ''
  try {
    const kst = new Date(new Date(ts).getTime() + 9 * 60 * 60 * 1000)
    return kst.toISOString().slice(0, 16).replace('T', ' ')
  } catch { return ts.slice(0, 10) }
}

export default function NoticesContent({ isAdmin }: { isAdmin: boolean }) {
  const [notices, setNotices]   = useState<Notice[]>([])
  const [readIds, setReadIds]   = useState<Set<string>>(new Set())
  const [loading, setLoading]   = useState(true)
  const [openId,  setOpenId]    = useState<string | null>(null)

  // 관리자 작성 폼
  const [showForm,    setShowForm]    = useState(false)
  const [editTarget,  setEditTarget]  = useState<Notice | null>(null)
  const [formTitle,   setFormTitle]   = useState('')
  const [formContent, setFormContent] = useState('')
  const [formActive,  setFormActive]  = useState(true)
  const [formLoading, setFormLoading] = useState(false)
  const [formError,   setFormError]   = useState('')
  const [formAttachments, setFormAttachments] = useState<{ name: string; url: string }[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchNotices = async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/notices')
      const json = await res.json()
      setNotices(json.notices ?? [])
      setReadIds(new Set(json.readIds ?? []))
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchNotices() }, [])

  const markRead = async (id: string) => {
    if (readIds.has(id)) return
    await fetch('/api/notices/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noticeId: id }),
    })
    setReadIds(prev => new Set([...prev, id]))
  }

  const handleToggle = (id: string) => {
    if (openId === id) {
      setOpenId(null)
    } else {
      setOpenId(id)
      markRead(id)
    }
  }

  const openCreateForm = () => {
    setEditTarget(null); setFormTitle(''); setFormContent('')
    setFormActive(true); setFormError(''); setFormAttachments([]); setShowForm(true)
  }

  const openEditForm = (n: Notice) => {
    setEditTarget(n); setFormTitle(n.title); setFormContent(n.content)
    setFormActive(n.is_active); setFormError(''); setFormAttachments(n.attachments ?? []); setShowForm(true)
  }

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // 같은 파일 재선택 허용
    if (files.length === 0) return
    if (formAttachments.length + files.length > MAX_ATTACH) {
      setFormError(`첨부파일은 최대 ${MAX_ATTACH}개까지 가능합니다.`); return
    }
    for (const f of files) {
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        setFormError(`"${f.name}" 파일이 너무 큽니다 (최대 ${MAX_FILE_MB}MB).`); return
      }
    }

    setFormLoading(true); setFormError('')
    try {
      const uploaded: { name: string; url: string }[] = []
      for (const f of files) {
        const ext  = f.name.includes('.') ? '.' + f.name.split('.').pop() : ''
        const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
        const { error: upErr } = await supabase.storage
          .from(ATTACH_BUCKET)
          .upload(path, f, { cacheControl: '3600', upsert: false, contentType: f.type || undefined })
        if (upErr) { setFormError(`업로드 실패: ${upErr.message}`); return }
        const { data } = supabase.storage.from(ATTACH_BUCKET).getPublicUrl(path)
        uploaded.push({ name: f.name, url: data.publicUrl })
      }
      setFormAttachments(prev => [...prev, ...uploaded])
    } finally { setFormLoading(false) }
  }

  const removeAttachment = (idx: number) =>
    setFormAttachments(prev => prev.filter((_, i) => i !== idx))

  const handleFormSave = async () => {
    if (!formTitle.trim()) { setFormError('제목을 입력하세요.'); return }
    setFormLoading(true); setFormError('')
    try {
      const method = editTarget ? 'PATCH' : 'POST'
      const body   = editTarget
        ? { id: editTarget.id, title: formTitle, content: formContent, is_active: formActive, attachments: formAttachments }
        : { title: formTitle, content: formContent, attachments: formAttachments }
      const res = await fetch('/api/notices', {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { setFormError(json.error); return }
      setShowForm(false); fetchNotices()
    } finally { setFormLoading(false) }
  }

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`"${title}" 공지를 삭제합니까?`)) return
    await fetch('/api/notices', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    fetchNotices()
  }

  const unreadCount = notices.filter(n => !readIds.has(n.id) && n.is_active).length

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-[#1E293B]">
          📢 공지사항
          {unreadCount > 0 && (
            <span className="ml-2 text-sm bg-[#B32646] text-white rounded-full px-2 py-0.5">
              {unreadCount}
            </span>
          )}
        </h2>
        {isAdmin && (
          <Button onClick={openCreateForm} className="bg-[#B32646] hover:bg-[#B0003D] text-white">
            ✏️ 공지 작성
          </Button>
        )}
      </div>

      {/* 관리자 작성/수정 폼 */}
      {isAdmin && showForm && (
        <div className="bg-white rounded-lg border border-[#e2e8f0] p-4 space-y-3">
          <h3 className="font-semibold text-[#1E293B]">
            {editTarget ? '공지 수정' : '새 공지 작성'}
          </h3>
          <div className="space-y-1">
            <Label>제목 *</Label>
            <Input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="제목" />
          </div>
          <div className="space-y-1">
            <Label>내용</Label>
            <textarea
              value={formContent}
              onChange={e => setFormContent(e.target.value)}
              rows={5}
              className="w-full border rounded px-3 py-2 text-sm text-[#1E293B] bg-white focus:outline-none focus:border-[#B32646] resize-none"
              placeholder="공지 내용을 입력하세요."
            />
          </div>
          {/* 첨부파일 */}
          <div className="space-y-2">
            <Label>첨부파일</Label>
            {formAttachments.length > 0 && (
              <div className="space-y-1">
                {formAttachments.map((att, i) => (
                  <div key={i} className="flex items-center gap-2 text-[13px] bg-[#F8F9FA] rounded px-3 py-1.5">
                    <span className="truncate text-[#1E293B] flex-1">📎 {att.name}</span>
                    <button type="button" onClick={() => removeAttachment(i)}
                      className="text-red-500 hover:text-red-600 text-xs flex-shrink-0">삭제</button>
                  </div>
                ))}
              </div>
            )}
            <input ref={fileInputRef} type="file" multiple className="hidden"
              onChange={handleFilePick} />
            <Button type="button" variant="outline" size="sm" disabled={formLoading}
              onClick={() => fileInputRef.current?.click()}>
              📎 파일 추가
            </Button>
            <p className="text-[11px] text-[#94A3B8]">최대 {MAX_ATTACH}개 · 개당 {MAX_FILE_MB}MB</p>
          </div>

          {editTarget && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={formActive}
                onChange={e => setFormActive(e.target.checked)} />
              활성 상태
            </label>
          )}
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex gap-2">
            <Button onClick={handleFormSave} disabled={formLoading}
              className="bg-[#B32646] hover:bg-[#B0003D] text-white">
              {formLoading ? '저장 중...' : '💾 저장'}
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>취소</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32 text-gray-400 border rounded">
          로딩 중...
        </div>
      ) : notices.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-gray-400 border rounded">
          등록된 공지사항이 없습니다.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-[#e2e8f0] p-4">
          <div className="space-y-2">
          {notices.map(n => {
            const isRead   = readIds.has(n.id)
            const isOpen   = openId === n.id
            const author   = typeof n.users === 'object' && n.users ? n.users.name : '관리자'
            const inactive = !n.is_active

            return (
              <div key={n.id} className="border rounded-lg overflow-hidden">
                {/* 헤더 */}
                <button
                  onClick={() => handleToggle(n.id)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {!isRead && <span className="w-2 h-2 rounded-full bg-[#B32646] flex-shrink-0" />}
                    <span className={`text-[13px] font-medium truncate ${inactive ? 'text-gray-400' : 'text-[#1E293B]'}`}>
                      {n.title}{inactive && <span className="ml-1 text-[11px] text-gray-400">[비활성]</span>}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-3 text-[11px] text-[#94A3B8]">
                    <span>{author}</span>
                    <span>{tsKst(n.created_at)}</span>
                    <span>{isOpen ? '▲' : '▼'}</span>
                  </div>
                </button>

                {/* 본문 */}
                {isOpen && (
                  <div className="px-4 pb-4 bg-white border-t border-[rgba(0,0,0,0.06)]">
                    <div
                      className="mt-3 p-4 bg-[#F8F9FA] rounded border-l-[3px] border-l-[#B32646] text-[13px] text-[#1E293B] whitespace-pre-wrap"
                    >
                      {n.content}
                    </div>

                    {/* 첨부파일 */}
                    {n.attachments?.length > 0 && (
                      <div className="mt-3 space-y-1">
                        <p className="text-[12px] font-semibold text-[#64748B]">📎 첨부파일</p>
                        {n.attachments.map((att, i) => (
                          <a key={i} href={att.url} target="_blank" rel="noopener noreferrer"
                            className="block text-[12px] text-blue-600 hover:underline">
                            📥 {att.name}
                          </a>
                        ))}
                      </div>
                    )}

                    {/* 관리자 버튼 */}
                    {isAdmin && (
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" variant="outline" onClick={() => openEditForm(n)}>
                          ✏️ 수정
                        </Button>
                        <Button size="sm" variant="outline"
                          className="text-red-500 hover:text-red-600"
                          onClick={() => handleDelete(n.id, n.title)}>
                          🗑️ 삭제
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          </div>
        </div>
      )}
    </div>
  )
}
