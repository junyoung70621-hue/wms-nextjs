'use client'

import { useState, useEffect } from 'react'
import type { SessionUser } from '@/lib/session'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import PageTransition from './PageTransition'

export default function SidebarShell({
  user,
  title,
  children,
}: {
  user: SessionUser
  title: string
  children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (localStorage.getItem('sidebar-collapsed') === 'true') setCollapsed(true)
  }, [])

  const toggle = () =>
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem('sidebar-collapsed', String(next))
      return next
    })

  return (
    <>
      <TopBar user={user} title={title} collapsed={collapsed} onToggle={toggle} />
      <Sidebar user={user} collapsed={collapsed} />
      <main
        className={`mt-[58px] min-h-[calc(100vh-58px)] p-6 transition-all duration-200 ${
          collapsed ? 'ml-0' : 'ml-[220px]'
        }`}
      >
        <PageTransition>{children}</PageTransition>
      </main>
    </>
  )
}
