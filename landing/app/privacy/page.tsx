import Link from 'next/link'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How Glow collects, uses, stores, and protects your personal information in Greater Sudbury, Ontario.',
}

const LAST_UPDATED = 'June 30, 2026'

const sections = [
  { id: 'overview', label: '1. Overview' },
  { id: 'what-we-collect', label: '2. Information We Collect' },
  { id: 'why-we-collect', label: '3. Why We Collect It' },
  { id: 'retention', label: '4. How Long We Keep It' },
  { id: 'your-rights', label: '5. Your Rights' },
  { id: 'third-parties', label: '6. Third Parties We Work With' },
  { id: 'security', label: '7. Security Practices' },
  { id: 'compliance', label: '8. Legal Compliance' },
  { id: 'cookies', label: '9. Cookies & Local Storage' },
  { id: 'not-medical', label: '10. Not a Medical Service' },
  { id: 'children', label: '11. Children' },
  { id: 'changes', label: '12. Changes to This Policy' },
  { id: 'contact', label: '13. Contact Us' },
]

export default function PrivacyPage() {
  return (
    <>
      <Navbar />
      <main className="pt-32 pb-24 bg-white min-h-screen">
        <div className="container-xl max-w-3xl">
          <span className="label-tag mb-4 block">Legal</span>
          <h1 className="section-title mb-3">
            Privacy <span className="gradient-text">Policy</span>
          </h1>
          <p className="text-base text-gray-500 mb-10">Last updated: {LAST_UPDATED}</p>

          <p className="text-lg text-gray-600 leading-relaxed mb-10">
            Glow (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) connects people who need personal
            support with vetted, independent Personal Support Workers (&ldquo;Providers&rdquo;) in Greater Sudbury,
            Ontario. This policy explains, in plain language, what information we collect when you use our
            app or website, why we collect it, how long we keep it, and the choices and rights you have over it.
          </p>

          {/* Table of contents */}
          <nav
            aria-label="Table of contents"
            className="mb-12 rounded-2xl border border-gray-200 bg-gray-50 p-6"
          >
            <p className="text-sm font-semibold text-gray-900 mb-3">On this page</p>
            <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
              {sections.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="text-sm text-brand-greenDark hover:text-brand-green hover:underline underline-offset-4"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="prose prose-gray max-w-none prose-headings:font-bold prose-headings:text-gray-900 prose-a:text-brand-greenDark prose-a:no-underline hover:prose-a:underline">
            <section id="overview" className="scroll-mt-28 mb-10">
              <h2>1. Overview</h2>
              <p>
                This Privacy Policy applies to the Glow mobile app, progressive web app, and website
                (collectively, the &ldquo;Service&rdquo;). By creating an account or using the Service, you
                agree to the collection and use of information as described here. If you do not agree, please
                do not use the Service.
              </p>
            </section>

            <section id="what-we-collect" className="scroll-mt-28 mb-10">
              <h2>2. Information We Collect</h2>
              <p>We collect the following categories of information:</p>
              <ul>
                <li>
                  <strong>Identity &amp; contact information:</strong> full name, phone number, email address.
                </li>
                <li>
                  <strong>Location data:</strong> approximate or precise GPS location, used to match you with
                  nearby Providers and, while a booking is actively in progress, to share a Provider&apos;s live location
                  with the client for that visit.
                </li>
                <li>
                  <strong>Identity &amp; credential documents:</strong> for Providers, government-issued ID, police
                  record checks, certifications, and reference information, uploaded during onboarding.
                </li>
                <li>
                  <strong>Photos:</strong> profile photos and document photos you choose to upload.
                </li>
                <li>
                  <strong>Booking history:</strong> appointment dates, times, services requested, duration,
                  pricing, cancellations, and ratings/reviews you submit or receive.
                </li>
                <li>
                  <strong>Communications:</strong> messages exchanged with our support team, and in-app
                  notifications.
                </li>
                <li>
                  <strong>Device &amp; usage data:</strong> app version, device type, and basic diagnostic
                  information used to keep the Service reliable.
                </li>
              </ul>
            </section>

            <section id="why-we-collect" className="scroll-mt-28 mb-10">
              <h2>3. Why We Collect It</h2>
              <p>We use your information to:</p>
              <ul>
                <li>Match clients with available, nearby Providers and facilitate bookings.</li>
                <li>
                  Verify Provider identity and conduct background/police checks before they can accept bookings,
                  for client safety.
                </li>
                <li>Send appointment confirmations, reminders, and live-arrival updates during active visits.</li>
                <li>Process billing for completed bookings (currently a flat $25/hr rate, 3-hour minimum).</li>
                <li>Provide customer support and respond to inquiries or disputes.</li>
                <li>Maintain the security, integrity, and proper functioning of the Service.</li>
                <li>Comply with legal, tax, and regulatory obligations.</li>
              </ul>
              <p>
                We do not sell your personal information, and we do not use your location data for advertising
                or third-party tracking.
              </p>
            </section>

            <section id="retention" className="scroll-mt-28 mb-10">
              <h2>4. How Long We Keep It</h2>
              <ul>
                <li>
                  <strong>Account profile (name, phone, email):</strong> retained while your account is active,
                  and anonymized immediately upon account deletion.
                </li>
                <li>
                  <strong>Identity &amp; credential documents (Providers):</strong> permanently deleted upon account
                  deletion, as this is sensitive personal information that should not persist once you leave
                  the platform.
                </li>
                <li>
                  <strong>Live/precise location pings:</strong> not stored beyond the duration of the active
                  booking they relate to.
                </li>
                <li>
                  <strong>Completed booking &amp; payment records:</strong> retained in anonymized form for up
                  to 7 years after account deletion, as required for tax, accounting, and legal record-keeping.
                </li>
                <li>
                  <strong>Support communications:</strong> retained for up to 2 years to help us resolve
                  recurring issues and improve the Service.
                </li>
              </ul>
            </section>

            <section id="your-rights" className="scroll-mt-28 mb-10">
              <h2>5. Your Rights</h2>
              <p>You have the right to:</p>
              <ul>
                <li>
                  <strong>Access</strong> the personal information we hold about you.
                </li>
                <li>
                  <strong>Correct</strong> inaccurate or outdated information directly in your Profile.
                </li>
                <li>
                  <strong>Delete your account</strong> at any time from Profile &rarr; Delete Account. This
                  immediately removes your uploaded documents and anonymizes your profile; you will not be able
                  to log back in with that account.
                </li>
                <li>
                  <strong>Export</strong> a copy of your data by contacting us at the email below.
                </li>
                <li>
                  <strong>Withdraw consent</strong> for location sharing at any time through your device&apos;s
                  permission settings &mdash; note this will limit your ability to be matched with nearby Providers.
                </li>
              </ul>
              <p>
                Quebec residents have additional rights under Law 25, including the right to data portability
                and to be informed of any automated decision-making; Glow does not use automated
                decision-making to make booking or eligibility decisions about you.
              </p>
            </section>

            <section id="third-parties" className="scroll-mt-28 mb-10">
              <h2>6. Third Parties We Work With</h2>
              <p>We share limited data with trusted service providers who help us operate the Service:</p>
              <ul>
                <li>
                  <strong>Twilio</strong> &mdash; sends one-time password (OTP) verification codes via SMS to
                  confirm your phone number.
                </li>
                <li>
                  <strong>Vercel</strong> &mdash; hosts our website, app, and (via Vercel Blob) securely stores
                  uploaded document files.
                </li>
                <li>
                  <strong>Railway</strong> &mdash; hosts our backend application server and database.
                </li>
              </ul>
              <p>
                Each of these providers is contractually limited to using your data only to provide their
                service to us, and not for their own purposes. We do not share your information with
                advertisers or data brokers.
              </p>
            </section>

            <section id="security" className="scroll-mt-28 mb-10">
              <h2>7. Security Practices</h2>
              <ul>
                <li>All data in transit is encrypted using HTTPS/TLS.</li>
                <li>Authentication uses signed JSON Web Tokens (JWT) and one-time SMS codes &mdash; we never store passwords.</li>
                <li>Database access is restricted and credentials are stored as environment secrets, never in source code.</li>
                <li>
                  Upon account deletion, personally identifying fields are anonymized and sensitive documents
                  are permanently and irreversibly deleted, not merely hidden.
                </li>
              </ul>
              <p>
                No method of transmission or storage is 100% secure. If we become aware of a breach affecting
                your personal information, we will notify you and the appropriate authorities as required by
                law.
              </p>
            </section>

            <section id="compliance" className="scroll-mt-28 mb-10">
              <h2>8. Legal Compliance</h2>
              <p>
                Glow operates in Ontario, Canada, and handles personal information in accordance with:
              </p>
              <ul>
                <li>
                  The federal <strong>Personal Information Protection and Electronic Documents Act
                  (PIPEDA)</strong>.
                </li>
                <li>
                  Quebec&apos;s <strong>Law 25</strong> (Act to modernize legislative provisions respecting the
                  protection of personal information), for any users located in Quebec.
                </li>
                <li>
                  Applicable Ontario health-information principles, where relevant to credential and
                  background-check data handled during Provider onboarding.
                </li>
              </ul>
            </section>

            <section id="cookies" className="scroll-mt-28 mb-10">
              <h2>9. Cookies &amp; Local Storage</h2>
              <p>
                Our app and progressive web app use local device storage to keep you signed in and to cache
                app assets so the Service loads quickly, including while offline. Our website uses minimal,
                essential cookies/local storage for the same purposes. We do not use third-party advertising
                or cross-site tracking cookies.
              </p>
            </section>

            <section id="not-medical" className="scroll-mt-28 mb-10">
              <h2>10. Not a Medical Service</h2>
              <p>
                <strong>
                  Glow is not a medical service.
                </strong>{' '}
                Providers available through the Service provide companionship and personal support &mdash; such as
                light housekeeping, meal preparation, mobility assistance, and medication reminders &mdash; not
                nursing, clinical, or medical care. Any health-related information you choose to share with a
                Provider or with us is used solely to help deliver appropriate personal support, and is not treated
                as a clinical medical record.
              </p>
            </section>

            <section id="children" className="scroll-mt-28 mb-10">
              <h2>11. Children</h2>
              <p>
                The Service is intended for users 18 years of age or older. We do not knowingly collect
                personal information from children. If you believe a child has provided us with personal
                information, please contact us so we can delete it.
              </p>
            </section>

            <section id="changes" className="scroll-mt-28 mb-10">
              <h2>12. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time to reflect changes in our practices or for
                legal reasons. We will update the &ldquo;Last updated&rdquo; date above, and where changes are
                material, we will notify you in-app or by email before they take effect.
              </p>
            </section>

            <section id="contact" className="scroll-mt-28 mb-10">
              <h2>13. Contact Us</h2>
              <p>
                Questions about this Privacy Policy or your personal information can be sent to{' '}
                <a href="mailto:support@glow.app">support@glow.app</a>.
              </p>
            </section>
          </div>

          <div className="mt-16 pt-8 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <p className="text-sm text-gray-500">Last updated: {LAST_UPDATED}</p>
            <Link
              href="/terms"
              className="text-sm font-semibold text-brand-greenDark hover:text-brand-green underline-offset-4 hover:underline"
            >
              Read our Terms of Service &rarr;
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
