import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPostBySlug, getAllPosts, getRelatedPosts, formatDate } from '@/lib/blog'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import { MDXRemote } from './MDXRemote'
import type { Metadata } from 'next'

interface PageProps {
  params: { slug: string }
}

export async function generateStaticParams() {
  const posts = getAllPosts()
  return posts.map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const post = getPostBySlug(params.slug)
  if (!post) return {}

  return {
    title: post.title,
    description: post.description,
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      publishedTime: post.date,
      authors: [post.author],
    },
  }
}

export default function BlogPostPage({ params }: PageProps) {
  const post = getPostBySlug(params.slug)
  if (!post) notFound()

  const related = getRelatedPosts(post.slug, post.category)

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    author: { '@type': 'Person', name: post.author },
    publisher: {
      '@type': 'Organization',
      name: 'Glow',
      url: 'https://ca.glow.app',
    },
    datePublished: post.date,
    dateModified: post.date,
  }

  return (
    <>
      <Navbar />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <main className="pt-32 pb-24 lg:pb-32 bg-white min-h-screen">
        <article className="container-md" aria-label={post.title}>
          {/* Back link */}
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors mb-12 cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to Blog
          </Link>

          {/* Post header */}
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-5">
              <span className="chip">{post.category}</span>
              <span className="text-xs text-gray-400">{post.readingTime}</span>
            </div>
            <h1 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-5 leading-tight tracking-tight">
              {post.title}
            </h1>
            <p className="text-xl text-gray-500 mb-8 leading-relaxed">{post.description}</p>
            <div className="flex items-center gap-4 pt-6 border-t border-gray-100">
              <div className="w-11 h-11 rounded-2xl bg-blue-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-sm">{post.author[0]}</span>
              </div>
              <div>
                <p className="font-semibold text-gray-900">{post.author}</p>
                <p className="text-sm text-gray-400">{formatDate(post.date)}</p>
              </div>
            </div>
          </div>

          <div className="w-full h-px bg-gray-100 mb-12" />

          {/* Article content */}
          <div className="prose prose-lg max-w-none prose-headings:font-bold prose-headings:text-gray-900 prose-p:text-gray-600 prose-p:leading-relaxed prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline prose-strong:text-gray-900 prose-blockquote:border-blue-600 prose-blockquote:text-gray-600 prose-code:text-blue-600 prose-code:bg-blue-50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm">
            <MDXRemote source={post.content} />
          </div>

          {/* Tags */}
          {post.tags.length > 0 && (
            <div className="mt-14 pt-8 border-t border-gray-100">
              <div className="flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <span key={tag} className="chip">{tag}</span>
                ))}
              </div>
            </div>
          )}
        </article>

        {/* Related posts */}
        {related.length > 0 && (
          <div className="container-md mt-20 pt-12 border-t border-gray-100">
            <h2 className="font-bold text-xl text-gray-900 mb-8">Related articles</h2>
            <div className="grid md:grid-cols-2 gap-5">
              {related.map((rel) => (
                <Link
                  key={rel.slug}
                  href={`/blog/${rel.slug}`}
                  className="card block p-6 group"
                >
                  <p className="font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">{rel.title}</p>
                  <p className="text-sm text-gray-500 line-clamp-2 mb-3 leading-relaxed">{rel.description}</p>
                  <p className="text-xs text-gray-400">{rel.readingTime} &bull; {formatDate(rel.date)}</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="container-md mt-20">
          <div className="p-10 lg:p-14 rounded-3xl bg-gradient-to-br from-blue-600 to-blue-700 text-center">
            <p className="font-bold text-2xl text-white mb-3">Ready to find care in Sudbury?</p>
            <p className="text-blue-200 mb-8 leading-relaxed">
              Download Glow and connect with a verified Provider today.
            </p>
            <a
              href="/#download"
              className="inline-flex items-center gap-2 px-8 py-4 bg-white text-blue-600 font-semibold text-sm rounded-xl hover:bg-blue-50 transition-all cursor-pointer"
            >
              Get the App
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
