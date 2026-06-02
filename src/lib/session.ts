import { getIronSession, SessionOptions } from 'iron-session'
import { cookies } from 'next/headers'

export interface SessionUser {
  id: string
  username: string
  name: string
  email: string
  phone: string | null
  role: string
  center: string
  assigned_center: string | null
}

export interface SessionData {
  user?: SessionUser
  loginAt?: number
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: 'wms-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 60 * 60 * 8,
  },
}

export async function getSession() {
  return await getIronSession<SessionData>(await cookies(), sessionOptions)
}
