'use client'
import React, { useState } from 'react'

export default function Newsletter() {
  const [email, setEmail] = useState('')
  const [done, setDone] = useState(false)
  return (
    <section className="py-16 bg-gray-50 border-t border-gray-100">
      <div className="container-xl">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Stay updated</h2>
          <p className="text-gray-500 mb-8">
            Care tips, Provider guides, and Glow news — delivered monthly.
          </p>
          {done ? (
            <p className="text-emerald-600 font-semibold">You&apos;re on the list. ✓</p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setDone(true)
              }}
              className="flex gap-3 max-w-md mx-auto"
            >
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-[15px] focus:outline-none focus:ring-2 focus:border-transparent bg-white" style={{ '--tw-ring-color': '#0EA56F' } as React.CSSProperties}
              />
              <button type="submit" className="btn-dark px-6 py-3 min-h-[48px]">
                Subscribe
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}
