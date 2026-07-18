'use client'

import { useEffect, useState } from 'react'

interface Applicant {
  id: string
  name: string
  phone: string
  email: string
  city: string
  qualificationType: string
  experienceYears: number
  hasPoliceCheck: boolean
  hasFirstAid: boolean
  hasReliableTransport: boolean
  availability: string
  message: string
  screenResult: 'qualified' | 'review' | 'unqualified' | string
  status: 'new' | 'contacted' | 'interview_scheduled' | 'approved' | 'rejected' | string
  createdAt: string
}

const SCREEN_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  qualified:   { bg: '#E8F5EE', color: '#057A55', label: 'Qualified' },
  review:      { bg: '#FEF3C7', color: '#B45309', label: 'Needs review' },
  unqualified: { bg: '#FEE2E2', color: '#B91C1C', label: 'Unqualified' },
}

const STATUS_OPTIONS = ['new', 'contacted', 'interview_scheduled', 'approved', 'rejected']

export default function ApplicantsTable() {
  const [applicants, setApplicants] = useState<Applicant[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)

  function load() {
    setLoading(true)
    fetch('/api/admin/provider-applicants?limit=50')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error)
        } else {
          setApplicants(data.applicants || [])
          setTotal(data.total || 0)
        }
      })
      .catch(() => setError('Could not load applicants'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function updateStatus(id: string, status: string) {
    setUpdating(id)
    try {
      const res = await fetch('/api/admin/provider-applicants', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      if (res.ok) {
        setApplicants((prev) => prev.map((a) => (a.id === id ? { ...a, status, contacted: status !== 'new' } : a)))
      }
    } finally {
      setUpdating(null)
    }
  }

  if (loading) return <p style={{ fontSize: 13.5, color: '#9B9B9B' }}>Loading applicants…</p>
  if (error) return <p style={{ fontSize: 13.5, color: '#B45309' }}>{error}</p>
  if (applicants.length === 0) return <p style={{ fontSize: 13.5, color: '#9B9B9B' }}>No Provider applications yet.</p>

  const qualifiedCount = applicants.filter((a) => a.screenResult === 'qualified').length

  return (
    <div>
      <p style={{ fontSize: 12.5, color: '#9B9B9B', marginBottom: 14 }}>
        {total} total application{total === 1 ? '' : 's'} · {qualifiedCount} pre-qualified · showing latest {applicants.length}
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(10,10,10,0.1)' }}>
              {['Name', 'Phone', 'City', 'Qualification', 'Exp.', 'Screen', 'Status', 'Date', ''].map((h) => (
                <th key={h} style={{ padding: '8px 10px', fontWeight: 600, color: '#6B6B6B', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {applicants.map((a) => {
              const badge = SCREEN_BADGE[a.screenResult] || SCREEN_BADGE.review
              const isOpen = expanded === a.id
              return (
                <>
                  <tr key={a.id} style={{ borderBottom: isOpen ? 'none' : '1px solid rgba(10,10,10,0.05)' }}>
                    <td style={{ padding: '10px 10px', fontWeight: 600 }}>{a.name}</td>
                    <td style={{ padding: '10px 10px', color: '#6B6B6B' }}>
                      <a href={`tel:${a.phone}`} style={{ color: '#057A55' }}>{a.phone}</a>
                    </td>
                    <td style={{ padding: '10px 10px', color: '#6B6B6B' }}>{a.city || '—'}</td>
                    <td style={{ padding: '10px 10px', color: '#6B6B6B' }}>{a.qualificationType || '—'}</td>
                    <td style={{ padding: '10px 10px', color: '#6B6B6B' }}>{a.experienceYears ? `${a.experienceYears}y` : '—'}</td>
                    <td style={{ padding: '10px 10px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: badge.bg, color: badge.color }}>
                        {badge.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 10px' }}>
                      <select
                        value={a.status}
                        disabled={updating === a.id}
                        onChange={(e) => updateStatus(a.id, e.target.value)}
                        style={{ fontSize: 12, padding: '4px 8px', borderRadius: 8, border: '1px solid rgba(10,10,10,0.12)', background: '#fff' }}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>{s.replace('_', ' ')}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '10px 10px', color: '#9B9B9B' }}>
                      {new Date(a.createdAt).toLocaleDateString('en-CA')}
                    </td>
                    <td style={{ padding: '10px 10px' }}>
                      <button
                        onClick={() => setExpanded(isOpen ? null : a.id)}
                        style={{ fontSize: 11.5, color: '#057A55', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        {isOpen ? 'Hide' : 'Details'}
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${a.id}-detail`} style={{ borderBottom: '1px solid rgba(10,10,10,0.05)' }}>
                      <td colSpan={9} style={{ padding: '0 10px 14px', background: '#FAFAF8' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', fontSize: 12.5, color: '#6B6B6B', padding: '10px 0' }}>
                          <span>Email: {a.email || '—'}</span>
                          <span>Availability: {a.availability || '—'}</span>
                          <span>Police check: {a.hasPoliceCheck ? '✓ Yes' : '✕ No'}</span>
                          <span>First Aid/CPR: {a.hasFirstAid ? '✓ Yes' : '✕ No'}</span>
                          <span>Reliable transport: {a.hasReliableTransport ? '✓ Yes' : '✕ No'}</span>
                        </div>
                        {a.message && (
                          <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, paddingBottom: 4 }}>&ldquo;{a.message}&rdquo;</p>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
