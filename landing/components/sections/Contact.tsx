'use client'
import React, { useState } from 'react'
import { trackEvent } from '@/lib/gtag'

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'https://api.glow.app'

const SERVICES = [
  'Personal Care',
  'Companionship',
  'Dementia Care',
  'Post-Surgery',
  'Respite Care',
  'Mobility Assistance',
  'Medication Reminders',
  'Meal Preparation',
  'Other',
]

type Status = 'idle' | 'sending' | 'done' | 'error'

export default function Contact() {
  const [form, setForm] = useState({ name: '', phone: '', email: '', serviceType: '', message: '' })
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (status === 'sending') return
    setStatus('sending')
    setError('')
    try {
      const res = await fetch(`${API_BASE}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, source: 'landing-contact' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Something went wrong.')
      }
      setStatus('done')
      trackEvent('lead_submit', { service_type: form.serviceType || 'unspecified' })
    } catch (err: unknown) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Please try calling us instead.')
    }
  }

  return (
    <section id="contact" className="py-20 bg-brand-greenDeep scroll-mt-20">
      <div className="container-xl">
        <div className="grid md:grid-cols-2 gap-10 lg:gap-16 items-center">
          {/* Left: pitch + direct contact */}
          <div className="text-white">
            <span className="inline-block px-3 py-1 rounded-full bg-white/10 text-white/80 text-xs font-semibold mb-4">
              Get in touch
            </span>
            <h2 className="text-3xl md:text-4xl font-bold mb-4 leading-tight">
              Talk to a real person about care for your family
            </h2>
            <p className="text-white/70 text-[15px] leading-relaxed mb-8 max-w-md">
              Tell us what you need and we&apos;ll connect you with verified, police-checked Providers
              in Greater Sudbury you can browse and choose from — usually the same day. No agency fees, $25/hr flat.
            </p>
            <div className="space-y-4">
              <a
                href="tel:+16476209243"
                onClick={() => trackEvent('call_click', { location: 'contact_section' })}
                className="flex items-center gap-3 text-white group"
              >
                <span className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition">📞</span>
                <span className="font-semibold">+1 (647) 620-9243</span>
              </a>
              <a href="mailto:support@glow.app" className="flex items-center gap-3 text-white group">
                <span className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition">✉️</span>
                <span className="font-semibold">support@glow.app</span>
              </a>
              <div className="flex items-center gap-3 text-white/70">
                <span className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">📍</span>
                <span>Serving all of Greater Sudbury, ON</span>
              </div>
              <div className="flex items-center gap-3 text-white/70">
                <span className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">⏱️</span>
                <span>We reply within 2 hours, 7 days a week</span>
              </div>
            </div>
          </div>

          {/* Right: lead form card */}
          <div className="bg-white rounded-3xl p-7 md:p-8 shadow-card-hover">
            {status === 'done' ? (
              <div className="text-center py-10">
                <div className="text-5xl mb-4">✅</div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Thanks, {form.name.split(' ')[0] || 'there'}!</h3>
                <p className="text-gray-500 text-[15px]">
                  We&apos;ve got your request and will reach out shortly to set up care.
                </p>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <h3 className="text-xl font-bold text-gray-900 mb-1">Request care</h3>
                <p className="text-gray-500 text-sm mb-4">We&apos;ll call you back, usually the same day.</p>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Your name *</label>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type of care</label>
                  <select
                    value={form.serviceType} onChange={set('serviceType')}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-[15px] bg-white focus:outline-none focus:ring-2 focus:ring-brand-green focus:border-transparent"
                  >
                    <option value="">Select (optional)</option>
                    {SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tell us more</label>
                  <textarea
                    value={form.message} onChange={set('message')} rows={3}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-[15px] resize-none focus:outline-none focus:ring-2 focus:ring-brand-green focus:border-transparent"
                    placeholder="When do you need care, and for whom?"
                  />
                </div>

                {status === 'error' && (
                  <p className="text-red-600 text-sm">{error}</p>
                )}

                <button
                  type="submit" disabled={status === 'sending'}
                  className="w-full py-4 rounded-xl bg-brand-green text-white font-bold text-[15px] hover:bg-brand-greenDark transition disabled:opacity-60 min-h-[52px]"
                >
                  {status === 'sending' ? 'Sending…' : 'Request a callback →'}
                </button>
                <p className="text-center text-xs text-gray-400">
                  No obligation · Your info stays private · Locally owned in Greater Sudbury
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
