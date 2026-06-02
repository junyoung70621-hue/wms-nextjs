import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'

export async function GET(req: Request) {
  const session = await getSession()
  if (!session.user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const center    = searchParams.get('center')
  const dateFrom  = searchParams.get('date_from')
  const dateTo    = searchParams.get('date_to')

  if (!center) return NextResponse.json({ error: 'center 필요' }, { status: 400 })

  let q = supabase.from('bus_terminal_history')
    .select('acted_at,action,ih_code,device_type,sub_type,from_employee,to_employee,from_status,to_status,extra_ih,acted_by_name')
    .eq('center', center)
    .order('acted_at', { ascending: false })
    .limit(2000)

  if (dateFrom) q = q.gte('acted_at', dateFrom)
  if (dateTo) {
    const nextDay = new Date(new Date(dateTo).getTime() + 86400000).toISOString().slice(0, 10)
    q = q.lte('acted_at', nextDay)
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}
