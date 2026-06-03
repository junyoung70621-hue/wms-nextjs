# 사용내역 업로드 → 재고 차감 — 현황 & 남은 작업 (양식 교체)

> ⚠️ **결론 먼저: 차감 로직·API·업로드 UI는 이미 마이그레이션 완료됨.**
> 남은 작업은 **업로드 양식을 CSV → 스타일 XLSX로 교체**하는 것뿐.

- 원본(Streamlit): `wms_v2/utils/uploads.py` (`process_usage_upload`, `make_usage_template_buffer`), `wms_v2/pages/15_combined.py`
- 현재 Next.js: `src/app/api/usage/route.ts` (POST=차감), `src/app/(dashboard)/usage/UsageContent.tsx` (`UploadTab`)

---

## 1. 이미 구현되어 있는 것 ✅ (건드리지 말 것)

### 차감 로직 — `api/usage/route.ts` POST
원본 `process_usage_upload`와 **동등하게 이미 동작**:
- 매칭: `erp_code` 있으면 ERP코드로, 없으면 `item_name` (ilike) 로 조회 — **둘 다 `location == 대상센터` 한정**
- (보너스) `item_id` 직접 지정 경로도 있음 — 앱 재고현황에서 바로 선택 시 ID로 정확 매칭
- 재고검사: `현재수량 < 요청수량` → 실패(재고부족) 후 다음 행
- 차감: `warehouse.quantity -= qty`, `last_modified_by/at` 갱신
- 이력: `history` 에 `action_type:"out"`, `from_center`, before/after 스냅샷 insert
- 권한: guest 차단, 비admin은 본인 센터만, admin은 `center` override 가능
- 부분 성공 허용 — 행별 `{ok, error}` 결과 반환

### 업로드 UI — `UsageContent.tsx` `UploadTab`
양식 다운로드 → 파일 선택 → 미리보기 → "차감 확정" → 결과(성공/실패 건수) 흐름 **이미 있음**.

> 즉, 기능 자체는 정상 동작. 아래 2장만 바꾸면 원본과 동일해짐.

---

## 2. 남은 작업 = 양식 교체 (CSV → 스타일 XLSX) 🎯

현재 nextjs 양식이 원본과 다른 점:

| 항목 | 현재 nextjs | 원본 wms_v2 (목표) |
|------|-------------|--------------------|
| 파일 포맷 | **CSV** (`사용내역_양식.csv`) | **XLSX** (`{센터}_사용내역_양식.xlsx`) |
| 내용 | 하드코딩 빈 양식 + 예시 2행 (`TEMPLATE_CSV`) | **해당 센터 현재고(자재명·ERP코드)를 가나다순으로 미리 채움** |
| 사용자 입력 | 자재명부터 다 입력 | **사용수량만 입력** (나머지 프리필) |
| 컬럼명 | `자재명, ERP코드, 수량, 사유` | `자재명, ERP코드, 사용수량, 사용사유` |
| 서식 | 없음 | 헤더 진회색/흰글씨, **사용수량 헤더 주황·셀 노랑 음영**, 얇은 테두리, 열너비 지정 |
| 업로드 파싱 | `parseCsv` (CSV 텍스트) | **xlsx 파싱** 필요 |

### 2-1. 양식 다운로드 교체 (`downloadTemplate`)
1. 현재 선택 센터의 재고를 조회해 `자재명 / ERP코드` 를 **가나다순**으로 채움
   - 데이터 출처: 기존 재고 조회 API 재사용 (`/api/warehouse?center=...` 또는 `warehouse/stock`) — 이미 있는 것 활용
2. 빈 `사용수량`, `사용사유` 열 추가
3. **`exceljs`** (또는 nextjs에서 이미 쓰는 xlsx 라이브러리)로 스타일 적용:
   - 헤더: 배경 `2D2D2D`, 흰 글씨 bold
   - **사용수량 헤더: 배경 `F9A825`(주황) / 본문 셀: 배경 `FFF9C4`(노랑)** ← 입력칸 강조 의도
   - 전체 얇은 테두리(`AAAAAA`), 헤더 위아래 medium
   - 열너비: 자재명 35 / ERP코드 16 / 사용수량 12 / 사용사유 22
4. 파일명: `{센터명}_사용내역_양식.xlsx`

> 원본 `make_usage_template_buffer` (`utils/uploads.py` 40~89줄) 그대로 참고. 색상/너비 값 동일하게.

### 2-2. 업로드 파싱 교체 (`handleFile`)
- 현재 `reader.readAsText` + `parseCsv` → **xlsx 읽기**로 교체 (`accept=".csv"` → `.xlsx`)
- 헤더 매핑: `사용수량 → quantity`, `사용사유 → reason`, `자재명 → item_name`, `ERP코드 → erp_code`
- 행 필터: 자재명·ERP코드 중 하나라도 있고 **`사용수량 > 0`** 인 행만 → `rows`
- 그 후는 기존 `handleSubmit`(→ `POST /api/usage`) 그대로 사용

---

## 3. 컬럼 매핑 (원본 USAGE_COL_MAP)

```
자재명   → item_name
ERP코드  → erp_code
사용수량 → quantity   (현재 nextjs 양식은 "수량")
사용사유 → reason     (현재 nextjs 양식은 "사유")
```

> 컬럼명을 "사용수량/사용사유"로 바꾸면 원본과 일치. (api는 `quantity/reason` 키로 받으므로 프론트 파싱에서 매핑만 맞추면 됨 — **api 수정 불필요**)

---

## 4. 작업 지침 요약

1. **`api/usage/route.ts` 는 건드리지 말 것** — 차감 로직 이미 완료
2. `UsageContent.tsx` `UploadTab` 의 **양식 다운로드 + 파일 파싱 2곳만** 교체:
   - CSV 하드코딩 양식 → **센터 재고 프리필 + 스타일 XLSX** (2-1)
   - CSV 파싱 → **XLSX 파싱**, 헤더 `사용수량/사용사유` (2-2)
3. 색상·열너비·서식은 원본 `utils/uploads.py:make_usage_template_buffer` 값 그대로
4. 같은 Supabase — 데이터 이관 없음
