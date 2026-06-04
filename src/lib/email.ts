// 공통 메일 헬퍼 — 에이텍모빌리티 자재관리 (A-Core 딥레드 톤)
// Gmail 등은 <style>/외부 CSS 를 무시하므로 전부 인라인 스타일.
import nodemailer from 'nodemailer'

const FROM = `에이텍모빌리티 자재관리 <${process.env.GMAIL_ADDRESS}>`
const BRAND = '#B32646'

function transporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_ADDRESS, pass: process.env.GMAIL_APP_PASSWORD },
  })
}

// 상태 색상 토큰
export const MAIL_COLOR = {
  brand: BRAND,
  success: '#16A34A',
  pending: '#E65100',
  danger:  '#C62828',
  text:    '#334155',
  dark:    '#1E293B',
  muted:   '#94A3B8',
}

export type Cell = string | { text: string; color?: string; right?: boolean; bold?: boolean }

// 정보/품목 표
export function infoTable(headers: string[], rows: Cell[][]): string {
  const th = headers.map(h =>
    `<th style="padding:9px 14px; text-align:left; font-weight:700; font-size:12px; color:${BRAND}; white-space:nowrap;">${h}</th>`
  ).join('')
  const body = rows.map((r, ri) =>
    `<tr style="background:${ri % 2 === 0 ? '#ffffff' : '#fafbfc'};">` + r.map(c => {
      const cell = typeof c === 'string' ? { text: c } : c
      const style = `padding:8px 14px; font-size:13px; color:${cell.color ?? '#334155'};`
        + (cell.right ? 'text-align:right;' : '')
        + (cell.bold ? 'font-weight:700;' : '')
        + 'border-top:1px solid #eef1f5; word-break:break-word; overflow-wrap:anywhere;'
      return `<td style="${style}">${cell.text}</td>`
    }).join('') + '</tr>'
  ).join('')
  return `<table cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse; width:100%; margin:14px 0; border:1px solid #e7eaf0; border-radius:8px; overflow:hidden;">`
    + `<thead><tr style="background:#FBE9EE;">${th}</tr></thead><tbody>${body}</tbody></table>`
}

// 비고 배너
export function noteBanner(text: string): string {
  return `<div style="margin:14px 0; padding:11px 14px; background:#FFF8E1; border-left:4px solid #F59E0B; border-radius:6px; font-size:13px; color:#8a6d00;"><b>비고</b>&nbsp;&nbsp;${text}</div>`
}

// 경고 문구
export function warnText(text: string): string {
  return `<p style="margin:12px 0 0; color:${MAIL_COLOR.danger}; font-weight:700; font-size:13px;">⚠️ ${text}</p>`
}

// 강조 코드(임시 비밀번호 등)
export function bigCode(text: string): string {
  return `<div style="margin:16px 0; padding:16px; text-align:center; background:#FBE9EE; border:1px dashed ${BRAND}; border-radius:10px;">`
    + `<span style="font-size:24px; font-weight:800; letter-spacing:3px; color:${BRAND}; font-family:Consolas,monospace;">${text}</span></div>`
}

// 본문을 줄바꿈 보존 박스로
export function textBlock(text: string): string {
  const safe = String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
  return `<div style="margin:8px 0 4px; padding:12px 14px; background:#f8f9fb; border:1px solid #eef1f5; border-radius:8px; font-size:13px; color:#334155; line-height:1.7;">${safe}</div>`
}

// 공통 레이아웃 (헤더 워드마크 + 본문 + 푸터)
export function emailLayout(opts: { title: string; greetingName?: string; bodyHtml: string }): string {
  const greet = opts.greetingName
    ? `<p style="margin:0 0 12px; font-size:14px; color:#1E293B;">안녕하세요, <b>${opts.greetingName}</b>님.</p>`
    : `<p style="margin:0 0 12px; font-size:14px; color:#1E293B;">안녕하세요.</p>`
  return `
  <div style="margin:0; padding:24px 12px; background:#f4f5f7; font-family:'Malgun Gothic','Apple SD Gothic Neo',Arial,sans-serif;">
    <div style="max-width:600px; margin:0 auto; background:#ffffff; border:1px solid #e7eaf0; border-radius:14px; overflow:hidden;">
      <div style="height:4px; background:${BRAND};"></div>
      <div style="padding:20px 28px 14px; border-bottom:1px solid #eef1f5;">
        <div style="font-size:19px; font-weight:800; letter-spacing:-0.3px;">
          <span style="color:${BRAND};">ATEC</span> <span style="color:#1E293B;">에이텍모빌리티</span>
        </div>
        <div style="margin-top:3px; font-size:11px; color:#94A3B8; letter-spacing:1.5px;">자재관리 시스템</div>
      </div>
      <div style="padding:22px 28px 6px; color:#334155; font-size:14px; line-height:1.6;">
        <div style="font-size:16px; font-weight:700; color:#1E293B; margin-bottom:14px;">${opts.title}</div>
        ${greet}
        ${opts.bodyHtml}
      </div>
      <div style="padding:16px 28px 22px; border-top:1px solid #eef1f5; margin-top:16px;">
        <p style="margin:0; color:#94A3B8; font-size:12px;">본 메일은 에이텍모빌리티 자재관리 시스템에서 자동 발송되었습니다.</p>
      </div>
    </div>
  </div>`
}

export async function sendMail(
  to: string | string[],
  subject: string,
  bodyHtml: string,
  attachments?: { filename: string; content: Buffer }[],
): Promise<void> {
  const recipients = Array.isArray(to) ? to.filter(Boolean) : (to ? [to] : [])
  if (!recipients.length) return
  await transporter().sendMail({
    from: FROM,
    to: recipients.join(','),
    subject,
    html: bodyHtml,
    attachments,
  })
}
