import Link from 'next/link'
import { getAllPosts, formatDate } from '@/lib/blog'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import BlogSearch from './BlogSearch'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Blog — Care tips, guides, and updates',
  description:
    'Practical guides, local care advice, and health insights for families in Greater Sudbury.',
}

export default function BlogPage() {
  const posts = getAllPosts()
  const featured = posts[0]
  const rest = posts.slice(1)

  return (
    <>
      <Navbar />
      <main className="pt-32 pb-24 bg-white min-h-screen">
        {/* Hero */}
        <div className="container-xl mb-16">
          <span className="label-tag mb-4 block">The Blog</span>
          <h1 className="section-title mb-4 max-w-xl">
            Insights &amp; <span className="gradient-text">Guides</span>
          </h1>
          <p className="text-lg text-gray-500 max-w-xl leading-relaxed">
            Practical advice on home care, caregiver wellbeing, and navigating support services in
            Northern Ontario.
          </p>
        </div>

        <div className="container-xl">
          <BlogSearch posts={[...posts]} />

          {/* Featured post */}
          {featured && (
            <div className="mb-12">
              <Link
                href={`/blog/${featured.slug}`}
                className="group block card overflow-hidden hover:shadow-card-hover transition-all duration-300"
              >
                <div className="grid lg:grid-cols-[1.4fr_1fr]">
                  <div className="p-10 lg:p-14 flex flex-col justify-center">
                    <div className="flex items-center gap-3 mb-5">
                      <span className="chip">{featured.category}</span>
                      <span className="text-xs text-gray-400">{featured.readingTime}</span>
                    </div>
                    <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-4 leading-tight group-hover:text-blue-600 transition-colors">
                      {featured.title}
                    </h2>
                    <p className="text-gray-500 mb-8 leading-relaxed">{featured.description}</p>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-400">
                        {featured.author} &nbsp;&bull;&nbsp; {formatDate(featured.date)}
                      </p>
                      <span className="flex items-center gap-2 text-blue-600 font-semibold text-sm group-hover:gap-4 transition-all duration-200">
                        Read article
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                      </span>
                    </div>
                  </div>
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 flex items-center justify-center p-10 min-h-[260px]">
                    <div className="w-24 h-24 rounded-3xl bg-blue-600/10 flex items-center justify-center">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          )}

          {/* More posts */}
          {rest.length > 0 && (
            <div>
              <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-6">More Articles</p>
              <div className="grid md:grid-cols-2 gap-5">
                {rest.map((post) => (
                  <Link
                    key={post.slug}
                    href={`/blog/${post.slug}`}
                    className="group card p-8 block"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <span className="chip">{post.category}</span>
                      <span className="text-xs text-gray-400">{post.readingTime}</span>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-blue-600 transition-colors leading-snug">
                      {post.title}
                    </h3>
                    <p className="text-gray-500 text-sm mb-4 line-clamp-2 leading-relaxed">{post.description}</p>
                    <p className="text-xs text-gray-400">
                      {post.author} &bull; {formatDate(post.date)}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {posts.length === 0 && (
            <div className="text-center py-24">
              <p className="text-gray-400">No posts yet. Check back soon.</p>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  )
}
