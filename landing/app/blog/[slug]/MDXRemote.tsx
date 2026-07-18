'use client'

import { useMemo } from 'react'

interface MDXRemoteProps {
  source: string
}

// Simple MDX/Markdown renderer without external MDX compilation
// For a production setup with full MDX, replace with next-mdx-remote
export function MDXRemote({ source }: MDXRemoteProps) {
  const html = useMemo(() => parseMarkdown(source), [source])
  return <div dangerouslySetInnerHTML={{ __html: html }} />
}

function parseMarkdown(md: string): string {
  // Strip frontmatter
  const content = md.replace(/^---[\s\S]*?---\n?/, '')

  let html = content
    // Headings
    .replace(/^#### (.+)$/gm, '<h4 class="font-heading font-bold text-lg text-brand mt-8 mb-3">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 class="font-heading font-bold text-xl text-brand mt-10 mb-4">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="font-heading font-bold text-2xl text-brand mt-12 mb-4">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="font-heading font-bold text-3xl text-brand mt-12 mb-5">$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-brand">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-ui-background-2 text-brand-blue text-sm font-mono">$1</code>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-brand-blue hover:underline cursor-pointer">$1</a>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr class="my-10 border-ui-separator" />')
    // Blockquote
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-4 border-brand-blue pl-4 italic text-ui-label-2 my-6">$1</blockquote>')

  // Process lists
  html = processLists(html)

  // Paragraphs — wrap non-tagged lines
  const lines = html.split('\n')
  const processed: string[] = []
  let inList = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (!inList) processed.push('')
      continue
    }
    if (
      trimmed.startsWith('<h') ||
      trimmed.startsWith('<ul') ||
      trimmed.startsWith('<ol') ||
      trimmed.startsWith('<li') ||
      trimmed.startsWith('</') ||
      trimmed.startsWith('<hr') ||
      trimmed.startsWith('<blockquote')
    ) {
      inList = trimmed.startsWith('<ul') || trimmed.startsWith('<ol')
      processed.push(trimmed)
    } else {
      processed.push(`<p class="text-ui-label-2 leading-relaxed mb-5">${trimmed}</p>`)
    }
  }

  return processed.join('\n')
}

function processLists(html: string): string {
  // Unordered lists
  html = html.replace(/((?:^- .+$\n?)+)/gm, (match) => {
    const items = match
      .trim()
      .split('\n')
      .map((line) => {
        const content = line.replace(/^- /, '')
        return `<li class="flex items-start gap-2 mb-1.5"><span class="mt-2 w-1.5 h-1.5 rounded-full bg-brand-blue flex-shrink-0"></span><span>${content}</span></li>`
      })
      .join('\n')
    return `<ul class="my-5 space-y-1 text-ui-label-2">\n${items}\n</ul>\n`
  })

  // Ordered lists
  html = html.replace(/((?:^\d+\. .+$\n?)+)/gm, (match) => {
    let counter = 0
    const items = match
      .trim()
      .split('\n')
      .map((line) => {
        counter++
        const content = line.replace(/^\d+\. /, '')
        return `<li class="flex items-start gap-3 mb-2"><span class="flex-shrink-0 w-6 h-6 rounded-full bg-brand-blue/10 text-brand-blue text-xs font-bold flex items-center justify-center mt-0.5">${counter}</span><span>${content}</span></li>`
      })
      .join('\n')
    return `<ol class="my-5 space-y-1 text-ui-label-2">\n${items}\n</ol>\n`
  })

  return html
}
