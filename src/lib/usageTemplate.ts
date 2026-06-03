// 사용내역 업로드 양식 (스타일 XLSX, 센터 재고 프리필)
// wms_v2 utils/uploads.py:make_usage_template_buffer 포팅 — 색상/너비 값 동일
import ExcelJS from 'exceljs'

export interface StockLite { item_name: string; erp_code: string | null }

const FONT = '맑은 고딕'
const thinAAA = { style: 'thin' as const, color: { argb: 'FFAAAAAA' } }
const medAAA = { style: 'medium' as const, color: { argb: 'FFAAAAAA' } }

// 현재 센터 재고(자재명·ERP코드)를 가나다순 프리필 → 사용수량만 입력하는 양식
export async function downloadUsageTemplate(center: string, stock: StockLite[]) {
  const rows = [...stock]
    .map(s => ({ item_name: s.item_name ?? '', erp_code: s.erp_code ?? '' }))
    .filter(s => s.item_name || s.erp_code)
    .sort((a, b) => a.item_name.localeCompare(b.item_name, 'ko'))

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('사용내역양식')

  // 열너비: 자재명 35 / ERP코드 16 / 사용수량 12 / 사용사유 22
  ws.getColumn(1).width = 35
  ws.getColumn(2).width = 16
  ws.getColumn(3).width = 12
  ws.getColumn(4).width = 22

  // 헤더
  const headers = ['자재명', 'ERP코드', '사용수량', '사용사유']
  headers.forEach((h, i) => {
    const cell = ws.getCell(1, i + 1)
    cell.value = h
    const isQty = i === 2
    cell.font = { name: FONT, bold: true, size: 11, color: { argb: 'FFFFFFFF' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.fill = {
      type: 'pattern', pattern: 'solid',
      // 사용수량 헤더만 주황(F9A825), 나머지 진회색(2D2D2D)
      fgColor: { argb: isQty ? 'FFF9A825' : 'FF2D2D2D' },
    }
    cell.border = { top: medAAA, bottom: medAAA, left: thinAAA, right: thinAAA }
  })
  ws.getRow(1).height = 22

  // 본문 (자재명·ERP코드 프리필, 사용수량/사용사유 공란)
  rows.forEach((r, idx) => {
    const rowNo = idx + 2
    const vals = [r.item_name, r.erp_code, '', '']
    vals.forEach((v, i) => {
      const cell = ws.getCell(rowNo, i + 1)
      cell.value = v
      cell.font = { name: FONT, size: 10 }
      cell.alignment = { vertical: 'middle', horizontal: i === 2 ? 'center' : 'left' }
      cell.border = { top: thinAAA, bottom: thinAAA, left: thinAAA, right: thinAAA }
      // 사용수량 입력칸: 노랑 음영(FFF9C4)
      if (i === 2) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9C4' } }
      }
    })
  })

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${center}_사용내역_양식.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
