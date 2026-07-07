import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// 둘러보기 모드: 재고 목록은 익명 읽기 허용 (개인정보 없음, 쓰기 라우트는 별도로 세션 필수)
export async function GET(request: Request) {
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
    query = query.eq('location', location)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}
