import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import readingTime from 'reading-time'

const contentDir = path.join(process.cwd(), 'content', 'blog')

export interface BlogPost {
  slug: string
  title: string
  description: string
  author: string
  date: string
  readingTime: string
  category: string
  tags: string[]
  content: string
  featured?: boolean
}

export interface BlogPostMeta extends Omit<BlogPost, 'content'> {}

function parsePost(filename: string): BlogPost {
  const slug = filename.replace(/\.mdx?$/, '')
  const filePath = path.join(contentDir, filename)
  const raw = fs.readFileSync(filePath, 'utf-8')
  const { data, content } = matter(raw)
  const stats = readingTime(content)

  return {
    slug,
    title: data.title || '',
    description: data.description || '',
    author: data.author || 'Glow Team',
    date: data.date || new Date().toISOString().split('T')[0],
    readingTime: stats.text,
    category: data.category || 'General',
    tags: data.tags || [],
    content,
    featured: data.featured || false,
  }
}

export function getAllPosts(): BlogPost[] {
  if (!fs.existsSync(contentDir)) return []

  const files = fs
    .readdirSync(contentDir)
    .filter((f) => f.endsWith('.mdx') || f.endsWith('.md'))

  return files
    .map(parsePost)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

export function getPostBySlug(slug: string): BlogPost | null {
  const extensions = ['.mdx', '.md']

  for (const ext of extensions) {
    const filePath = path.join(contentDir, `${slug}${ext}`)
    if (fs.existsSync(filePath)) {
      return parsePost(`${slug}${ext}`)
    }
  }

  return null
}

export function getRelatedPosts(currentSlug: string, category: string, limit = 3): BlogPostMeta[] {
  return getAllPosts()
    .filter((p) => p.slug !== currentSlug && p.category === category)
    .slice(0, limit)
    .map(({ content: _content, ...meta }) => meta)
}

export { formatDate } from './utils'
