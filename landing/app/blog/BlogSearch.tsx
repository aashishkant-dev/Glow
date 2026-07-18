'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { BlogPost } from '@/lib/blog'
import { formatDate } from '@/lib/utils'

interface BlogSearchProps {
  posts: BlogPost[]
}

export default function BlogSearch({ posts }: BlogSearchProps) {
  const [query, setQuery] = useState('')

  const results = query
    ? posts.filter(
        (p) =>
          p.title.toLowerCase().includes(query.toLowerCase()) ||
          p.description.toLowerCase().includes(query.toLowerCase()) ||
          p.tags.some((t) => t.toLowerCase().includes(query.toLowerCase())) ||
          p.category.toLowerCase().includes(query.toLowerCase())
      )
    : []

  return (
    <div className="mb-10">
      <div className="relative max-w-md mb-6">
        <label htmlFor="blog-search" className="sr-only">Search articles</label>
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
        </div>
        <input
          id="blog-search"
          type="search"
          placeholder="Search articles..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-white border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all text-[15px]"
        />
      </div>

      {query && (
        results.length === 0 ? (
          <p className="text-gray-500 text-sm py-4">No articles found for &ldquo;{query}&rdquo;</p>
        ) : (
          <div>
            <p className="text-xs text-gray-400 mb-4">
              {results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
            </p>
            <div className="space-y-3">
              {results.map((post) => (
                <Link
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  className="block p-5 rounded-xl border border-gray-100 bg-gray-50 hover:border-blue-200 hover:bg-blue-50/50 transition-all"
                >
                  <p className="font-semibold text-gray-900 mb-1">{post.title}</p>
                  <p className="text-xs text-gray-400">
                    {post.category} &bull; {formatDate(post.date)} &bull; {post.readingTime}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  )
}
