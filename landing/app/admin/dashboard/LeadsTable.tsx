'use client'

import { useEffect, useState } from 'react'

interface Lead {
  id: string
  name: string
  phone: string
  email: string
  serviceType: string
  source: string
  contacted: boolean
  createdAt: string
}

export default function LeadsTable() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState<string | null>(null)

  async function toggleContacted(lead: Lead) {
    if (saving) return
    setSaving(lead.id)
    const next = !lead.contacted
    try {
      const res = await fetch(`/api/admin/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacted: next }),
      })
      if (!res.ok) throw new Error()
      setLeads((ls) => ls.map((l) => (l.id === lead.id ? { ...l, contacted: next } : l)))
    } catch {
      // leave state unchanged; row keeps old status
    } finally {
      setSaving(null)
    }
  }

  useEffect(() => {
    fetch('/api/admin/leads?limit=25')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error)
        } else {
          setLeads(data.leads || [])
          setTotal(data.total || 0)
        }
      })
      .catch(() => setError('Could not load leads'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p style={{ fontSize: 13.5, color: '#9B9B9B' }}>Loading leads…</p>
  if (error) return <p style={{ fontSize: 13.5, color: '#B45309' }}>{error}</p>
  if (leads.length === 0) return <p style={{ fontSize: 13.5, color: '#9B9B9B' }}>No leads captured yet.</p>

  return (
    <div>
      <p style={{ fontSize: 12.5, color: '#9B9B9B', marginBottom: 14 }}>
        {total} total lead{total === 1 ? '' : 's'} · showing latest {leads.length}
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(10,10,10,0.1)' }}>
              {['Name', 'Phone', 'Service', 'Source', 'Status', 'Date'].map((h) => (
                <th key={h} style={{ padding: '8px 10px', fontWeight: 600, color: '#6B6B6B', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id} style={{ borderBottom: '1px solid rgba(10,10,10,0.05)' }}>
                <td style={{ padding: '10px 10px', fontWeight: 600 }}>{l.name}</td>
                <td style={{ padding: '10px 10px', color: '#6B6B6B' }}>{l.phone}</td>
                <td style={{ padding: '10px 10px', color: '#6B6B6B' }}>{l.serviceType || '—'}</td>
                <td style={{ padding: '10px 10px', color: '#6B6B6B' }}>{l.source}</td>
                <td style={{ padding: '10px 10px' }}>
                  <button
                    onClick={() => toggleContacted(l)}
                    disabled={saving === l.id}
                    title={l.contacted ? 'Click to mark as new' : 'Click to mark contacted'}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '3px 9px',
                      borderRadius: 999,
                      border: 'none',
                      cursor: 'pointer',
                      opacity: saving === l.id ? 0.5 : 1,
                      background: l.contacted ? '#E8F5EE' : '#FEF3C7',
                      color: l.contacted ? '#057A55' : '#B45309',
                    }}
                  >
                    {l.contacted ? 'Contacted ✓' : 'New — mark contacted'}
                  </button>
                </td>
                <td style={{ padding: '10px 10px', color: '#9B9B9B' }}>
                  {new Date(l.createdAt).toLocaleDateString('en-CA')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
