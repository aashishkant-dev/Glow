'use client'

import { useRouter } from 'next/navigation'

export default function LogoutButton() {
  const router = useRouter()

  async function logout() {
    await fetch('/api/admin/login', { method: 'DELETE' })
    router.push('/admin/login')
    router.refresh()
  }

  return (
    <button
      onClick={logout}
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: '#6B6B6B',
        background: '#fff',
        border: '1px solid rgba(10,10,10,0.12)',
        borderRadius: 10,
        padding: '8px 16px',
        cursor: 'pointer',
      }}
    >
      Sign out
    </button>
  )
}
