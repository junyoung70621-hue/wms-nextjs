# 메일 폼(HTML 템플릿) 복원 — Streamlit → Next.js 인수인계

> 증상: nextjs에서 보낸 메일이 **표·서식 없이 `<p>` 텍스트만** 나옴.
> 원본 wms_v2는 **공통 헤더/표/배너/푸터가 있는 스타일 HTML**.
> 추가로 **일부 메일은 nextjs에 아예 누락**되어 있음(아래 3장).

- 원본: `wms_v2/utils/mail.py` (787줄, 함수별 HTML 템플릿)
- 현재 nextjs: 공통 헬퍼 없이 **각 api/route.ts 안에서 `nodemailer.createTransport` + 맨몸 `html:` 문자열**

---

## 0. 핵심 방향

1. **공통 메일 헬퍼를 새로 만들기** → `src/lib/email.ts`
   - 지금은 라우트마다 `createTransport`를 중복 생성 + 인라인 `<p>`. → 공통 `sendMail()` + 스타일 빌더로 통일
2. 메일은 **인라인 CSS만** 먹음 (Gmail은 `<style>`·외부CSS 무시) → 원본도 전부 인라인. 그대로 인라인으로.
3. 누락된 회원 관련 메일(3장)은 **새로 추가**하면서 같은 템플릿 적용

---

## 1. 원본 디자인 어휘 (그대로 재현) 🎯

`wms_v2/utils/mail.py` 전 템플릿이 공유하는 요소:

| 요소 | 스타일 (인라인) |
|------|----------------|
| 제목 접두 | `[에이텍모빌리티 자재관리] …` |
| 인사 | `<p>안녕하세요, <b>{name}</b>님.</p>` |
| **정보 표** | `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse; margin:12px 0; font-size:14px;">` |
| 표 헤더행 | `<tr style="background:#e8edf5; color:#1a237e;">` + `<th style="padding:6px 14px;">` |
| 표 본문셀 | `<td style="padding:5px 14px;">` (숫자열은 `text-align:right`) |
| 강조 숫자(임시PW 등) | `<p style="font-size:20px;font-weight:bold;color:#1a73e8;">…</p>` |
| 상태 색 | 승인/재고있음 `#2e7d32`·녹색 / 대기 `#e65100` / 부족·거절 `red` |
| **비고 배너** | `<div style="margin-top:14px; padding:10px 14px; background:#fffbe6; border-left:4px solid #f59e0b; font-size:13px;"><b>비고:</b> …</div>` |
| 경고 문구 | `<p style="color:red; font-weight:bold;">⚠️ …</p>` |
| **푸터** | `<hr><p style="color:gray; font-size:12px;">에이텍모빌리티 자재관리 자동발송 메일입니다.</p>` |

> 색상 토큰: 표머리 배경 `#e8edf5` / 글씨 `#1a237e`, 강조 파랑 `#1a73e8`, 성공 `#2e7d32`, 대기 `#e65100`, 배너 배경 `#fffbe6`·바 `#f59e0b`, 푸터 `gray`.

---

## 2. 만들 공통 헬퍼 — `src/lib/email.ts` (제안)

```ts
import nodemailer from 'nodemailer'

const FROM = `에이텍모빌리티 자재관리 <${process.env.GMAIL_ADDRESS}>`

function transporter() {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: process.env.GMAIL_ADDRESS, pass: process.env.GMAIL_APP_PASSWORD },
  })
}

// 공통 래퍼: 인사 + 본문 + 푸터 (원본 모든 메일 공통 골격)
export function emailLayout(opts: { greetingName?: string; bodyHtml: string }) {
  const greet = opts.greetingName
    ? `<p>안녕하세요, <b>${opts.greetingName}</b>님.</p>` : `<p>안녕하세요.</p>`
  return `
    <div style="font-family:Malgun Gothic,Apple SD Gothic Neo,sans-serif; color:#222; font-size:14px;">
      ${greet}
      ${opts.bodyHtml}
      <hr>
      <p style="color:gray; font-size:12px;">에이텍모빌리티 자재관리 자동발송 메일입니다.</p>
    </div>`
}

// 정보 표 빌더: rows = [[라벨, 값(또는 {text,color})], ...]
export function infoTable(headers: string[], rows: (string | {text: string; color?: string; right?: boolean})[][]) {
  const th = headers.map(h => `<th style="padding:6px 14px;">${h}</th>`).join('')
  const body = rows.map(r => '<tr>' + r.map(c => {
    const cell = typeof c === 'string' ? { text: c } : c
    const style = `padding:5px 14px;${cell.color ? `color:${cell.color};` : ''}${cell.right ? 'text-align:right;' : ''}`
    return `<td style="${style}">${cell.text}</td>`
  }).join('') + '</tr>').join('')
  return `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse; margin:12px 0; font-size:14px;">
    <thead><tr style="background:#e8edf5; color:#1a237e;">${th}</tr></thead><tbody>${body}</tbody></table>`
}

export function noteBanner(text: string) {
  return `<div style="margin-top:14px; padding:10px 14px; background:#fffbe6; border-left:4px solid #f59e0b; font-size:13px;"><b>비고:</b> ${text}</div>`
}

export async function sendMail(to: string | string[], subject: string, bodyHtml: string, attachments?: {filename: string; content: Buffer}[]) {
  await transporter().sendMail({
    from: FROM, to: Array.isArray(to) ? to.join(',') : to,
    subject, html: bodyHtml, attachments,
  })
}
```

> 첨부(구매요청 엑셀 등)는 nodemailer `attachments: [{filename, content: Buffer}]` 사용 — 원본의 RFC2231 한글 파일명은 nodemailer가 자동 처리.

---

## 3. 메일별 현황 매핑 (원본 함수 → nextjs 위치 → 상태)

| 원본 `mail.py` 함수 | 발송 시점 | nextjs 위치 | 현재 상태 |
|---|---|---|---|
| `send_temp_password` | 임시PW 발급 | `api/auth/reset-password` | ⚠️ 맨몸 `<p>` — **스타일 적용 필요** |
| `send_register_complete` | 회원가입 접수(신청자) | `api/auth/register` | ❌ **누락 — 메일 발송 자체 없음** |
| `send_register_notify_admin` | 회원가입 접수(관리자 알림) | `api/auth/register` | ❌ **누락** |
| `send_register_approved` | 관리자 승인(신청자) | `api/admin/users` (PATCH, is_approved=true) | ❌ **누락 — 승인 시 메일 안 감** |
| `send_material_request` | 자재요청 접수(자재파트·관리자) | `api/material-requests` POST | ⚠️ 확인/스타일 적용 |
| `send_material_request_approved_to_center` | 자재요청 승인(센터 전원) | `api/material-requests/action` | ⚠️ 맨몸 — 스타일 적용 |
| `send_material_request_reply` | 승인/거절/보류 회신(신청자) | `api/material-requests/action` | ⚠️ 맨몸 — 스타일 적용 |
| `send_material_request_cancelled` | 자재요청 취소(자재파트·관리자) | `api/material-requests/action` | ⚠️ 확인 필요 |
| `send_purchase_request` | 구매요청 접수 | `api/purchase-requests` POST | ⚠️ 맨몸 — 스타일 적용 |
| `send_purchase_request_submitted` | 구매요청 접수확인(신청자) | `api/purchase-requests` POST | ⚠️ 맨몸 |
| 구매요청 처리/취소 | 결과 회신 | `api/purchase-requests/status` | ⚠️ 맨몸 |
| 문의 등록/답변 | 문의 | `api/inquiry`, `api/inquiry/reply` | ⚠️ 맨몸 `<p>` |

> ❌ **(중요) 회원가입 완료·관리자 알림·승인 메일 3종은 nextjs에 아예 없음.** 사용자가 "승인메일이 텍스트로 온다"고 느낀 건, 승인메일이 누락됐거나 다른 맨몸 메일과 혼동된 것일 수 있음 → **새로 추가 + 스타일 적용** 둘 다 필요.

---

## 4. 적용 예시 (회원가입 승인 메일)

```ts
// api/admin/users PATCH 에서 is_approved 가 false→true 로 바뀔 때
import { sendMail, emailLayout, infoTable } from '@/lib/email'

if (is_approved === true /* 그리고 직전 값이 false였다면 */) {
  const body = emailLayout({
    greetingName: target.name,
    bodyHtml: `
      <p>에이텍모빌리티 자재관리 시스템 회원가입이 <b style="color:#2e7d32;">승인</b>되었습니다.</p>
      ${infoTable(['항목','내용'], [
        ['이름', { text: `<b>${target.name}</b>` }],
        ['소속 센터', target.assigned_center ?? target.center ?? '미지정'],
      ])}
      <p>지금 바로 로그인하여 서비스를 이용하실 수 있습니다.</p>`,
  })
  await sendMail(target.email, '[에이텍모빌리티 자재관리] 회원가입이 승인되었습니다', body)
}
```

→ 원본 `send_register_approved` (`mail.py` 92~111줄)와 동일한 결과.

---

## 5. 작업 지침 요약

1. `src/lib/email.ts` 공통 헬퍼 생성 (`sendMail`/`emailLayout`/`infoTable`/`noteBanner`) — 2장
2. **누락 3종 추가**: 회원가입 완료·관리자 알림(`api/auth/register`), 승인(`api/admin/users`) — 4장 예시 패턴
3. 기존 맨몸 메일 라우트들의 `html:` 을 헬퍼 기반으로 교체 (reset-password, material-requests, purchase-requests, inquiry)
4. 색상/표/배너/푸터 토큰은 **1장 표 그대로** — 원본 `utils/mail.py` 해당 함수 참고
5. 자재요청·구매요청은 **품목 표**(자재명/ERP/수량/상태)와 **재고부족 경고·비고 배너**까지 재현 (원본 `send_material_request` 147~214줄 참고)
6. SMTP 설정·환경변수(`GMAIL_ADDRESS`/`GMAIL_APP_PASSWORD`)는 기존 그대로
