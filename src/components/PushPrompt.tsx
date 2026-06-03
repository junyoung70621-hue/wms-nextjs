'use client'

import { useEffect, useState } from 'react'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

async function ensureSubscribed(reg: ServiceWorkerRegistration, vapid: string) {
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
    })
  }
  await fetch('/api/push/subscribe', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON(), userAgent: navigator.userAgent }),
  })
}

export default function PushPrompt() {
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return
    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapid) return
    let cancelled = false
    ;(async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js')
        if (Notification.permission === 'granted') {
          await ensureSubscribed(reg, vapid)
        } else if (Notification.permission === 'default') {
          if (!cancelled && sessionStorage.getItem('push-prompt-dismissed') !== '1') setShow(true)
        }
      } catch { /* noop */ }
    })()
    return () => { cancelled = true }
  }, [])

  async function enable() {
    setBusy(true)
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { setShow(false); return }
      const reg = await navigator.serviceWorker.ready
      await ensureSubscribed(reg, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string)
      setShow(false)
    } catch { /* noop */ } finally { setBusy(false) }
  }

  if (!show) return null
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[#f3c6d1] bg-[#FEF3F6] px-3 py-2 text-[12px] text-[#7a2738]">
      <span className="font-semibold">🔔 푸시 알림을 켜면 새 요청·승인·출고 알림을 받을 수 있어요.</span>
      <div className="ml-auto flex gap-1.5">
        <button onClick={enable} disabled={busy}
          className="h-7 px-3 rounded-md bg-[#B32646] text-white text-[12px] font-semibold disabled:opacity-60">
          {busy ? '설정 중…' : '알림 켜기'}
        </button>
        <button onClick={() => { sessionStorage.setItem('push-prompt-dismissed', '1'); setShow(false) }}
          className="h-7 px-2 rounded-md border border-[#e2c2cc] text-[#7a2738] text-[12px]">나중에</button>
      </div>
    </div>
  )
}
