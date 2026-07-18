import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Support',
  description:
    'Get help with Glow — booking care, cancellations, refunds, Provider onboarding, and account questions. Contact our support team 24/7.',
}

const faqs = [
  {
    q: 'How do I book a Provider?',
    a: 'Sign in to the Glow app, tap the + button, choose the type of care you need, pick a date and time (or book on-demand), select a Provider near you, and confirm. Your Provider accepts the request and you can track their arrival in real time.',
  },
  {
    q: 'How much does care cost?',
    a: 'Care is $25 per hour with a 3-hour minimum per visit. You see the full price before you confirm a booking — no hidden fees.',
  },
  {
    q: 'How do I cancel a booking?',
    a: 'Open the booking in the app and tap Cancel. Cancellations made before the Provider starts travelling to you are free. See our Terms of Service for the full cancellation and refund policy.',
  },
  {
    q: 'How do I get a refund?',
    a: 'If a visit was cancelled or something went wrong, contact support with your booking details and we will review it promptly. Approved refunds are returned to your original payment method.',
  },
  {
    q: 'Are Providers background-checked?',
    a: 'Yes. Every Provider on Glow submits identity documents and a police check before their profile is approved and shown to clients.',
  },
  {
    q: 'How do I delete my account?',
    a: 'In the app, go to Profile, scroll to the bottom, and tap Delete Account. Your personal data is removed as described in our Privacy Policy.',
  },
  {
    q: 'I am a Provider — how do I join?',
    a: 'Download the app, register as a Provider with your phone number, and complete the onboarding steps: profile, service area, and document upload (ID and police check). Our team reviews and approves new Providers.',
  },
  {
    q: 'Is Glow a medical service?',
    a: 'No. Providers provide personal support — help with daily living, companionship, and mobility — not medical or nursing care. For medical emergencies, call 911.',
  },
]

export default function SupportPage() {
  return (
    <>
      <Navbar />
      <main className="pt-32 pb-24 bg-white min-h-screen">
        <div className="container-xl max-w-3xl">
          <span className="label-tag mb-4 block">Help</span>
          <h1 className="section-title mb-3">
            Support &amp; <span className="gradient-text">FAQ</span>
          </h1>
          <p className="text-lg text-gray-600 leading-relaxed mb-10">
            Questions about booking care, your account, or working as a Provider? Start with the answers
            below, or contact us directly — we respond 24/7.
          </p>

          <div className="mb-12 rounded-2xl border border-gray-200 bg-gray-50 p-6">
            <p className="text-sm font-semibold text-gray-900 mb-3">Contact us</p>
            <ul className="space-y-2 text-sm text-gray-700">
              <li>
                Email:{' '}
                <a
                  href="mailto:support@glow.app"
                  className="text-brand-greenDark hover:text-brand-green hover:underline underline-offset-4"
                >
                  support@glow.app
                </a>
              </li>
              <li>
                Phone:{' '}
                <a
                  href="tel:+16476209243"
                  className="text-brand-greenDark hover:text-brand-green hover:underline underline-offset-4"
                >
                  +1 (647) 620-9243
                </a>{' '}
                — available 24/7
              </li>
              <li>Service area: Greater Sudbury, Ontario, Canada</li>
            </ul>
          </div>

          <div className="space-y-8">
            {faqs.map((f) => (
              <section key={f.q}>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">{f.q}</h2>
                <p className="text-base text-gray-600 leading-relaxed">{f.a}</p>
              </section>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
