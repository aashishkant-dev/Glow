import { getAllPosts, formatDate } from '@/lib/blog'
import { ga4Configured, getGa4Summary, type Ga4Summary } from '@/lib/ga4'
import LeadsTable from './LeadsTable'
import ApplicantsTable from './ApplicantsTable'
import LogoutButton from './LogoutButton'

export const metadata = {
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function AdminDashboardPage() {
  const posts = getAllPosts()
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
  const gscPropertyUrl = 'https://search.google.com/search-console?resource_id=https://ca.glow.app/'

  let ga: Ga4Summary | null = null
  let gaError = ''
  if (ga4Configured()) {
    try {
      ga = await getGa4Summary()
    } catch (err) {
      gaError = err instanceof Error ? err.message : 'GA4 fetch failed'
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F4F1EA', padding: '40px 24px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0A0A0A' }}>SEO &amp; Analytics Dashboard</h1>
            <p style={{ fontSize: 13.5, color: '#6B6B6B', marginTop: 4 }}>
              Glow landing — last updated {formatDate(new Date().toISOString())}
            </p>
          </div>
          <LogoutButton />
        </div>

        {/* Visitor metrics — real GA4 numbers */}
        {ga ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
              <Card title="Visitors today" value={String(ga.today.visitors)} hint={`${ga.today.pageviews} pageviews`} />
              <Card title="Visitors — 7 days" value={String(ga.last7.visitors)} hint={`${ga.last7.pageviews} pageviews`} />
              <Card title="Visitors — 30 days" value={String(ga.last30.visitors)} hint={`${ga.last30.pageviews} pageviews`} />
              <Card title="Search Console" value="View report" hint="Opens in Google Search Console" href={gscPropertyUrl} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24, marginBottom: 24 }}>
              <Section title="Top pages — 30 days" flush>
                {ga.topPages.length === 0 && <Empty>No pageview data yet.</Empty>}
                {ga.topPages.map((p) => (
                  <Row key={p.path} left={p.path} right={`${p.views.toLocaleString('en-CA')} views`} />
                ))}
              </Section>
              <Section title="Traffic sources — 30 days" flush>
                {ga.sources.length === 0 && <Empty>No session data yet.</Empty>}
                {ga.sources.map((s) => (
                  <Row key={s.source} left={s.source} right={`${s.sessions.toLocaleString('en-CA')} sessions`} />
                ))}
              </Section>
            </div>
          </>
        ) : (
          <Section title="Visitor metrics — setup needed">
            {gaError ? (
              <p style={{ fontSize: 13.5, color: '#B45309', lineHeight: 1.7 }}>GA4 error: {gaError}</p>
            ) : (
              <div style={{ fontSize: 13.5, color: '#6B6B6B', lineHeight: 1.8 }}>
                <p style={{ marginBottom: 8 }}>
                  Real visitor numbers appear here once the GA4 Data API is connected (one-time, ~10 min):
                </p>
                <ol style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <li>Google Cloud console → create a service account → enable the <strong>Google Analytics Data API</strong>.</li>
                  <li>Create a JSON key for the service account and download it.</li>
                  <li>GA4 Admin → Property access management → add the service-account email as <strong>Viewer</strong>.</li>
                  <li>
                    On Vercel (glow-landing): set <code>GA4_PROPERTY_ID</code> (numeric property ID) and{' '}
                    <code>GA_SERVICE_ACCOUNT_KEY</code> (the full JSON key), then redeploy.
                  </li>
                </ol>
                <p style={{ marginTop: 10 }}>
                  GA4 tracking on the site itself is {gaId ? 'active' : 'NOT configured (set NEXT_PUBLIC_GA_MEASUREMENT_ID)'}.
                </p>
              </div>
            )}
          </Section>
        )}

        {/* SEO tools */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
          <Card title="Blog posts published" value={String(posts.length)} hint="Indexed via sitemap.xml" />
          <Card
            title="GA4 tracking"
            value={gaId ? 'Active' : 'Not configured'}
            hint={gaId ? `Measurement ID ${gaId}` : 'Set NEXT_PUBLIC_GA_MEASUREMENT_ID'}
            warn={!gaId}
          />
          <Card
            title="Rich Results Test"
            value="Verify schema"
            hint="Test LocalBusiness / FAQ / BlogPosting markup"
            href="https://search.google.com/test/rich-results?url=https://ca.glow.app"
          />
        </div>

        {/* Blog performance */}
        <Section title={`Blog posts (${posts.length})`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {posts.map((p) => {
              const views = ga?.blogViews[`/blog/${p.slug}`]
              return (
                <div
                  key={p.slug}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 0',
                    borderBottom: '1px solid rgba(10,10,10,0.06)',
                  }}
                >
                  <div>
                    <a
                      href={`/blog/${p.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 14, fontWeight: 600, color: '#0A0A0A' }}
                    >
                      {p.title}
                    </a>
                    <p style={{ fontSize: 12, color: '#9B9B9B', marginTop: 2 }}>
                      {p.category} · {formatDate(p.date)} · {p.readingTime}
                    </p>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#057A55', background: '#E8F5EE', padding: '4px 10px', borderRadius: 999 }}>
                    {ga ? `${(views || 0).toLocaleString('en-CA')} views · 30d` : 'Published'}
                  </span>
                </div>
              )
            })}
            {posts.length === 0 && <Empty>No posts yet.</Empty>}
          </div>
        </Section>

        {/* Provider recruitment funnel */}
        <Section title="Provider applications — landing page screening">
          <ApplicantsTable />
        </Section>

        {/* Conversions / leads */}
        <Section title="Conversions — contact form leads">
          <LeadsTable />
        </Section>
      </div>
    </div>
  )
}

function Card({
  title,
  value,
  hint,
  href,
  warn,
}: {
  title: string
  value: string
  hint: string
  href?: string
  warn?: boolean
}) {
  const inner = (
    <>
      <p style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#9B9B9B' }}>
        {title}
      </p>
      <p style={{ fontSize: 20, fontWeight: 800, color: warn ? '#B45309' : '#0A0A0A', margin: '6px 0 4px' }}>{value}</p>
      <p style={{ fontSize: 12, color: '#9B9B9B' }}>{hint}</p>
    </>
  )
  const style: React.CSSProperties = {
    background: '#fff',
    border: '1px solid rgba(10,10,10,0.08)',
    borderRadius: 14,
    padding: 18,
    display: 'block',
  }
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" style={style}>
      {inner}
    </a>
  ) : (
    <div style={style}>{inner}</div>
  )
}

function Section({ title, children, flush }: { title: string; children: React.ReactNode; flush?: boolean }) {
  return (
    <div style={{ background: '#fff', border: '1px solid rgba(10,10,10,0.08)', borderRadius: 14, padding: 24, marginBottom: flush ? 0 : 24 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: '#0A0A0A' }}>{title}</h2>
      {children}
    </div>
  )
}

function Row({ left, right }: { left: string; right: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        padding: '9px 0',
        borderBottom: '1px solid rgba(10,10,10,0.06)',
        fontSize: 13,
      }}
    >
      <span style={{ color: '#0A0A0A', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{left}</span>
      <span style={{ color: '#6B6B6B', flexShrink: 0 }}>{right}</span>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 13.5, color: '#9B9B9B' }}>{children}</p>
}
