import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { getViewableCenters } from '@/constants/centers'
import { GUEST_VIEWER } from '@/lib/guestViewer'

// 둘러보기 모드: 익명은 게스트 뷰어(자재센터)로 제한 조회. 열람 범위는 역할별 서버에서 강제.
export async function GET(request: Request) {
  const session = await getSession()
  const u = session.user ?? GUEST_VIEWER
  const viewable = getViewableCenters(u.role, u.assigned_center ?? u.center)

  const { searchParams } = new URL(request.url)
  const location = searchParams.get('center')

  let query = supabase
    .from('warehouse')
    .select(
      'id, item_name, quantity, rack_no, shelf, box_no, ' +
      'category_large, category_mid, category_small, ' +
      'location, erp_name, erp_code, notes'
    )
    .order('item_name')

  if (location && location !== '전체') {
    if (!viewable.includes(location)) {
      return NextResponse.json({ error: '열람 권한이 없는 센터입니다.' }, { status: 403 })
    }
    query = query.eq('location', location)
  } else {
    query = query.in('location', viewable)
  }

  // 전역 검색(상단 검색창): 자재명·ERP코드/명·분류 부분일치
  const q = searchParams.get('q')?.trim()
  if (q) {
    const like = `%${q.replace(/[%_,()]/g, '')}%`
    query = query
      .or(['item_name', 'erp_code', 'erp_name', 'category_mid', 'category_small'].map(c => `${c}.ilike.${like}`).join(','))
      .limit(300)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}
