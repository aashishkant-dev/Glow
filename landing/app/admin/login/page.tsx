'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') || '/admin/dashboard'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Login failed')
        setLoading(false)
        return
      }
      router.push(next)
      router.refresh()
    } catch {
      setError('Network error. Try again.')
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F4F1EA',
        padding: 24,
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: '100%',
          maxWidth: 380,
          background: '#fff',
          borderRadius: 16,
          padding: 36,
          boxShadow: '0 8px 30px rgba(10,10,10,0.08)',
          border: '1px solid rgba(10,10,10,0.08)',
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6, color: '#0A0A0A' }}>
          Glow Analytics
        </h1>
        <p style={{ fontSize: 13.5, color: '#6B6B6B', marginBottom: 24 }}>
          Admin sign-in for the SEO &amp; leads dashboard.
        </p>

        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
          Username
        </label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          autoFocus
          style={inputStyle}
        />

        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, margin: '16px 0 6px' }}>
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={inputStyle}
        />

        {error && (
          <p style={{ color: '#B91C1C', fontSize: 13, marginTop: 14 }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: 22,
            width: '100%',
            height: 46,
            borderRadius: 10,
            border: 'none',
            background: '#057A55',
            color: '#fff',
            fontWeight: 700,
            fontSize: 14.5,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 44,
  borderRadius: 10,
  border: '1px solid rgba(10,10,10,0.15)',
  padding: '0 14px',
  fontSize: 14,
  outline: 'none',
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
