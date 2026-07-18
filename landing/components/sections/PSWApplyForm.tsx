'use client'
import React, { useState } from 'react'
import { trackEvent } from '@/lib/gtag'

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'https://api.glow.app'

const QUALIFICATIONS = [
  'Provider Certificate',
  'Provider Diploma',
  'Healthcare Aide (HCA)',
  'Nursing Student',
  'Other',
  'None yet',
]

const AVAILABILITY = [
  'Weekdays',
  'Evenings & weekends',
  'Overnights',
  'Flexible / Anytime',
]

type Status = 'idle' | 'sending' | 'done' | 'error'

const initialForm = {
  name: '',
  phone: '',
  email: '',
  city: '',
  qualificationType: '',
  experienceYears: '',
  hasPoliceCheck: false,
  hasFirstAid: false,
  hasReliableTransport: false,
  availability: '',
  message: '',
}

export default function ProviderApplyForm({ onClose }: { onClose?: () => void }) {
  const [form, setForm] = useState(initialForm)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')

  const set =
    (k: keyof typeof initialForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value
      setForm((f) => ({ ...f, [k]: value }))
    }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (status === 'sending') return
    setStatus('sending')
    setError('')
    try {
      const res = await fetch(`${API_BASE}/provider-applicants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          experienceYears: form.experienceYears ? Number(form.experienceYears) : 0,
          source: 'landing-provider-apply',
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Something went wrong.')
      }
      setStatus('done')
      trackEvent('provider_apply_submit')
    } catch (err: unknown) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Please try calling us instead.')
    }
  }

  if (status === 'done') {
    return (
      <div className="bg-white rounded-3xl p-7 md:p-8 text-center" style={{ maxWidth: 480 }}>
        <div className="text-5xl mb-4">✅</div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">Thanks, {form.name.split(' ')[0] || 'there'}!</h3>
        <p className="text-gray-500 text-[15px]">
          We&apos;ve got your application and will review it shortly. If it looks like a good fit we&apos;ll
          call or text you to set up next steps — police check &amp; ID verification, then you&apos;re
          live and bookable.
        </p>
        {onClose && (
          <button
            onClick={onClose}
            className="mt-6 px-5 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm hover:bg-gray-200 transition"
          >
            Close
          </button>
        )}
      </div>
    )
  }

  return (
    <form
      onSubmit={submit}
      className="bg-white rounded-3xl p-7 md:p-8 shadow-card-hover space-y-4"
      style={{ maxWidth: 480 }}
    >
      <div>
        <h3 className="text-xl font-bold text-gray-900 mb-1">Apply as a Provider</h3>
        <p className="text-gray-500 text-sm">2 minutes. We review every application personally.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Full name *</label>
        <input
          required value={form.name} onChange={set('name')}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand-green focus:border-transparent"
          placeholder="Jane Doe"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
          <input
            required type="tel" value={form.phone} onChange={set('phone')}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand-green focus:border-transparent"
            placeholder="(705) 555-0000"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email" value={form.email} onChange={set('email')}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand-green focus:border-transparent"
            placeholder="optional"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">City / area *</label>
        <input
          required value={form.city} onChange={set('city')}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand-green focus:border-transparent"
          placeholder="e.g. Sudbury, Val Caron, Chelmsford"
        />
        <p className="text-xs text-gray-400 mt-1">We currently serve Greater Sudbury (15km radius).</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Qualification</label>
          <select
            value={form.qualificationType} onChange={set('qualificationType')}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-[15px] bg-white focus:outline-none focus:ring-2 focus:ring-brand-green focus:border-transparent"
          >
            <option value="">Select</option>
            {QUALIFICATIONS.map((q) => <option key={q} value={q}>{q}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Years experience</label>
          <input
            type="number" min={0} max={60} value={form.experienceYears} onChange={set('experienceYears')}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand-green focus:border-transparent"
            placeholder="0"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Availability</label>
        <select
          value={form.availability} onChange={set('availability')}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-[15px] bg-white focus:outline-none focus:ring-2 focus:ring-brand-green focus:border-transparent"
        >
          <option value="">Select</option>
          {AVAILABILITY.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* Screening questions — these feed the auto-screen bucket on the backend. */}
      <div className="space-y-2.5 pt-1">
        <CheckRow
          checked={form.hasPoliceCheck}
          onChange={set('hasPoliceCheck')}
          label="I have a current vulnerable sector police check (within 6 months)"
        />
        <CheckRow
          checked={form.hasFirstAid}
          onChange={set('hasFirstAid')}
          label="I'm First Aid / CPR certified"
        />
        <CheckRow
          checked={form.hasReliableTransport}
          onChange={set('hasReliableTransport')}
          label="I have reliable transportation across Greater Sudbury"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Tell us about yourself</label>
        <textarea
          value={form.message} onChange={set('message')} rows={3}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-[15px] resize-none focus:outline-none focus:ring-2 focus:ring-brand-green focus:border-transparent"
          placeholder="Your care experience, specialties, why Glow…"
        />
      </div>

      {status === 'error' && <p className="text-red-600 text-sm">{error}</p>}

      <button
        type="submit" disabled={status === 'sending'}
        className="w-full py-4 rounded-xl bg-brand-green text-white font-bold text-[15px] hover:bg-brand-greenDark transition disabled:opacity-60 min-h-[52px]"
      >
        {status === 'sending' ? 'Submitting…' : 'Submit application →'}
      </button>
      <p className="text-center text-xs text-gray-400">
        No obligation · A real person reviews every application
      </p>
    </form>
  )
}

function CheckRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  label: string
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 w-4 h-4 rounded border-gray-300 text-brand-green focus:ring-brand-green flex-shrink-0"
      />
      <span className="text-sm text-gray-600 leading-snug">{label}</span>
    </label>
  )
}
