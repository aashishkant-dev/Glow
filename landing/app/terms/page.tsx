import Link from 'next/link'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'The terms governing use of the Glow app and website, including booking, cancellation, and liability terms.',
}

const LAST_UPDATED = 'June 30, 2026'

const sections = [
  { id: 'overview', label: '1. Overview & Acceptance' },
  { id: 'service', label: '2. Description of the Service' },
  { id: 'eligibility', label: '3. Eligibility (18+)' },
  { id: 'accounts', label: '4. Your Account & Responsibilities' },
  { id: 'booking', label: '5. Booking, Pricing & Payment' },
  { id: 'cancellation', label: '6. Cancellation & Refund Policy' },
  { id: 'acceptable-use', label: '7. Acceptable Use' },
  { id: 'provider-conduct', label: '8. Provider Qualifications & Conduct' },
  { id: 'liability', label: '9. Disclaimers & Limitation of Liability' },
  { id: 'disputes', label: '10. Dispute Resolution' },
  { id: 'termination', label: '11. Suspension & Termination' },
  { id: 'changes', label: '12. Changes to These Terms' },
  { id: 'governing-law', label: '13. Governing Law' },
  { id: 'contact', label: '14. Contact Us' },
]

export default function TermsPage() {
  return (
    <>
      <Navbar />
      <main className="pt-32 pb-24 bg-white min-h-screen">
        <div className="container-xl max-w-3xl">
          <span className="label-tag mb-4 block">Legal</span>
          <h1 className="section-title mb-3">
            Terms of <span className="gradient-text">Service</span>
          </h1>
          <p className="text-base text-gray-500 mb-10">Last updated: {LAST_UPDATED}</p>

          <p className="text-lg text-gray-600 leading-relaxed mb-10">
            These Terms of Service (&ldquo;Terms&rdquo;) govern your use of the Glow app, progressive web
            app, and website (the &ldquo;Service&rdquo;), operated in Greater Sudbury, Ontario, Canada. By
            creating an account or using the Service, you agree to these Terms. Please read them carefully.
          </p>

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
              <h2>1. Overview &amp; Acceptance</h2>
              <p>
                Glow (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates a platform that
                connects clients with independent Personal Support Workers (&ldquo;Providers&rdquo;) in Greater
                Sudbury, Ontario. By using the Service, you agree to be bound by these Terms and our{' '}
                <Link href="/privacy">Privacy Policy</Link>. If you do not agree, do not use the Service.
              </p>
            </section>

            <section id="service" className="scroll-mt-28 mb-10">
              <h2>2. Description of the Service</h2>
              <p>
                Glow is a matching and booking platform. We connect clients seeking personal support
                with independent Providers who offer their services through the Service. We are not an employer of
                Providers, and Providers are not employees, agents, or representatives of Glow &mdash; they are
                independent contractors who set their own availability and accept or decline bookings at their
                discretion.
              </p>
              <p>
                Payment processing within the app is currently a mock/test integration during our initial
                launch period; live payment processing (via Stripe) will be enabled in a future release, at
                which point this section will be updated.
              </p>
            </section>

            <section id="eligibility" className="scroll-mt-28 mb-10">
              <h2>3. Eligibility (18+)</h2>
              <p>
                You must be at least 18 years old to create an account as a client or as a Provider. By creating an
                account, you represent that you meet this requirement and that all information you provide is
                accurate and current.
              </p>
            </section>

            <section id="accounts" className="scroll-mt-28 mb-10">
              <h2>4. Your Account &amp; Responsibilities</h2>
              <ul>
                <li>You are responsible for maintaining accurate account information and for all activity under your account.</li>
                <li>You own the content and data you submit, subject to the license needed to operate the Service (e.g., sharing your location with a matched Provider during an active booking).</li>
                <li>You agree not to harass, threaten, or abuse other users, and to treat Providers and clients with respect.</li>
                <li>You agree to promptly report any misconduct, safety concern, or policy violation to our support team.</li>
                <li>You may delete your account at any time from Profile &rarr; Delete Account.</li>
              </ul>
            </section>

            <section id="booking" className="scroll-mt-28 mb-10">
              <h2>5. Booking, Pricing &amp; Payment</h2>
              <ul>
                <li>The standard rate is <strong>$25/hour</strong>, with a <strong>3-hour minimum</strong> per booking.</li>
                <li>Bookings are made within a 15&nbsp;km service radius of Greater Sudbury.</li>
                <li>Pricing is shown to you before you confirm a booking.</li>
                <li>Payment is private-pay between client and Provider, facilitated through the Service; Glow does not currently process live payments (see Section 2).</li>
              </ul>
            </section>

            <section id="cancellation" className="scroll-mt-28 mb-10">
              <h2>6. Cancellation &amp; Refund Policy</h2>
              <ul>
                <li>
                  Clients may cancel a booking free of charge up to <strong>24 hours</strong> before the
                  scheduled start time.
                </li>
                <li>
                  Cancellations made within 24 hours of the scheduled start time may be subject to a
                  cancellation charge, to compensate the Provider for reserved time.
                </li>
                <li>
                  Where a refund is owed, it is credited back to your in-app wallet/balance. Refunds are not
                  currently issued to external payment methods, consistent with the mock-payment state
                  described in Section 2.
                </li>
                <li>
                  If a Provider cancels a confirmed booking, the client is not charged for that booking and we will
                  attempt to match a replacement Provider where possible.
                </li>
              </ul>
            </section>

            <section id="acceptable-use" className="scroll-mt-28 mb-10">
              <h2>7. Acceptable Use</h2>
              <p>You agree not to:</p>
              <ul>
                <li>Use the Service for any unlawful purpose or in violation of any applicable law.</li>
                <li>Misrepresent your identity, qualifications, certifications, or background-check status.</li>
                <li>Attempt to circumvent the platform to arrange off-platform payment to avoid safety screening.</li>
                <li>Harass, discriminate against, or endanger any other user.</li>
                <li>Interfere with or disrupt the integrity or performance of the Service.</li>
              </ul>
            </section>

            <section id="provider-conduct" className="scroll-mt-28 mb-10">
              <h2>8. Provider Qualifications &amp; Conduct</h2>
              <p>
                Providers using the Service must provide accurate identity documentation, undergo a police record
                check, and truthfully represent their certifications and experience. Providers agree to provide
                personal support &mdash; not medical or clinical care &mdash; and to conduct themselves
                professionally during all bookings. Glow may remove a Provider from the platform at any time
                for failing to meet these standards.
              </p>
            </section>

            <section id="liability" className="scroll-mt-28 mb-10">
              <h2>9. Disclaimers &amp; Limitation of Liability</h2>
              <p>
                The Service is provided &ldquo;as is&rdquo; and &ldquo;as available.&rdquo; Glow
                facilitates connections between clients and independent Providers but is not responsible for the
                quality, safety, legality, or outcome of services performed by a Provider, except to the extent
                required by law. To the maximum extent permitted by applicable law, Glow&apos;s total
                liability arising out of or relating to the Service shall not exceed the amount you paid
                through the Service in the three months preceding the claim.
              </p>
              <p>
                Glow is not liable for indirect, incidental, special, or consequential damages. Nothing
                in these Terms limits liability that cannot be limited under Ontario or Canadian law.
              </p>
            </section>

            <section id="disputes" className="scroll-mt-28 mb-10">
              <h2>10. Dispute Resolution</h2>
              <p>
                If a dispute arises between a client and a Provider, or between a user and Glow, we encourage
                you to first contact our support team so we can attempt to resolve it informally. If informal
                resolution is not possible, the parties agree to attempt mediation in Ontario before pursuing
                arbitration or litigation, except where applicable consumer-protection law gives you the right
                to proceed directly to court.
              </p>
            </section>

            <section id="termination" className="scroll-mt-28 mb-10">
              <h2>11. Suspension &amp; Termination</h2>
              <p>
                We may suspend or terminate your access to the Service, with or without notice, if you violate
                these Terms, engage in conduct that endangers other users, or misuse the Service. You may stop
                using the Service and delete your account at any time.
              </p>
            </section>

            <section id="changes" className="scroll-mt-28 mb-10">
              <h2>12. Changes to These Terms</h2>
              <p>
                We may update these Terms from time to time. We will update the &ldquo;Last updated&rdquo; date
                above, and where changes are material, we will provide notice in-app or by email before they
                take effect. Continued use of the Service after changes take effect constitutes acceptance of
                the updated Terms.
              </p>
            </section>

            <section id="governing-law" className="scroll-mt-28 mb-10">
              <h2>13. Governing Law</h2>
              <p>
                These Terms are governed by the laws of the Province of Ontario and the federal laws of Canada
                applicable therein, without regard to conflict-of-law principles. You agree to submit to the
                exclusive jurisdiction of the courts located in Ontario for any matter not resolved through
                mediation or arbitration under Section 10.
              </p>
            </section>

            <section id="contact" className="scroll-mt-28 mb-10">
              <h2>14. Contact Us</h2>
              <p>
                Questions about these Terms can be sent to{' '}
                <a href="mailto:support@glow.app">support@glow.app</a>.
              </p>
            </section>
          </div>

          <div className="mt-16 pt-8 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <p className="text-sm text-gray-500">Last updated: {LAST_UPDATED}</p>
            <Link
              href="/privacy"
              className="text-sm font-semibold text-brand-greenDark hover:text-brand-green underline-offset-4 hover:underline"
            >
              Read our Privacy Policy &rarr;
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
