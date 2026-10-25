import React from 'react'
import { Outlet } from 'react-router-dom'
import { Navbar } from './Navbar'
import { ToastContainer } from './ToastContainer'
import { AuthModal } from './AuthModal'
import { UserManagementModal } from './UserManagementModal'
import { useApp } from '../context/AppContext'

export function Layout() {
  const { toasts } = useApp()

  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--background)', color: 'var(--foreground)' }}
    >
      {/* Background mesh gradient */}
      <div
        className="pointer-events-none fixed inset-0 -z-10 opacity-40"
        style={{ background: 'var(--gradient-mesh)' }}
        aria-hidden="true"
      />

      <Navbar />

      <main className="mx-auto max-w-6xl px-4 pb-20 pt-8">
        <Outlet />
      </main>

      {/* Auth & User Management Modals */}
      <AuthModal />
      <UserManagementModal />

      {/* Cloud & Incident Toast Container */}
      <ToastContainer toasts={toasts} />
    </div>
  )
}
