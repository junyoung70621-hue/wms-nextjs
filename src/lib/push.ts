import webpush from 'web-push'
import { supabase } from './supabase'

let configured: boolean | null = null
function ensure(): boolean {
  if (configured !== null) return configured
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@atecmobility.com'
  if (!pub || !priv) { configured = false; return false }
  webpush.setVapidDetails(subject, pub, priv)
  configured = true
  return true
}

export type PushPayload = { title: string; body: string; url?: string; tag?: string }

type SubRow = { id: string; endpoint: string; p256dh: string; auth: string }

// 지정 사용자들의 모든 기기로 푸시 발송 (만료 구독은 정리)
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (!ensure()) return
  const ids = [...new Set(userIds.filter(Boolean))]
  if (!ids.length) return

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', ids)
  if (!subs?.length) return

  const body = JSON.stringify(payload)
  const dead: string[] = []
  await Promise.all((subs as SubRow[]).map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
      )
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) dead.push(s.id) // 만료/해지된 구독
    }
  }))
  if (dead.length) await supabase.from('push_subscriptions').delete().in('id', dead)
}

// 역할 기준 발송 (예: 승인자 admin/materials)
export async function sendPushToRoles(roles: string[], payload: PushPayload): Promise<void> {
  const { data } = await supabase.from('users').select('id').in('role', roles).eq('is_approved', true)
  await sendPushToUsers((data ?? []).map((u: { id: string }) => u.id), payload)
}

// 센터 기준 발송 (assigned_center 우선, 없으면 center)
export async function sendPushToCenters(centers: string[], payload: PushPayload): Promise<void> {
  const { data } = await supabase.from('users').select('id, center, assigned_center').eq('is_approved', true)
  const ids = (data ?? [])
    .filter((u: { center: string; assigned_center: string | null }) => centers.includes(u.assigned_center ?? u.center))
    .map((u: { id: string }) => u.id)
  await sendPushToUsers(ids, payload)
}

// 전체(승인된 사용자) 발송
export async function sendPushToAll(payload: PushPayload): Promise<void> {
  const { data } = await supabase.from('users').select('id').eq('is_approved', true)
  await sendPushToUsers((data ?? []).map((u: { id: string }) => u.id), payload)
}

// 호출부에서 await 없이 안전하게 쓰기 위한 fire-and-forget 래퍼
export function firePush(p: Promise<void>): void {
  p.catch(() => { /* 푸시 실패는 본 요청을 막지 않음 */ })
}
