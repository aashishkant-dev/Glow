import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'

const SITE_URL = 'https://ca.glow.app'
const APP_URL = 'https://glow.app'

export const metadata: Metadata = {
  title: {
    default: 'Glow — Premium Beauty Marketplace | Find Your Perfect Look',
    template: '%s | Glow',
  },
  description:
    'Glow connects you with verified makeup artists, hairstylists, and beauty professionals for weddings, receptions, photoshoots, and every moment that matters. Book your beauty experience today.',
  keywords: [
    'makeup artist Nepal',
    'bridal makeup',
    'beauty booking',
    'hair stylist',
    'festival makeup',
    'wedding makeup',
    'at-home beauty services',
    'professional makeup artist',
    'beauty professionals',
    'makeup artist near me',
    'hair stylist near me',
    'beauty concierge Nepal',
    'luxury beauty services',
    'party makeup',
    'photoshoot makeup',
    'Glow beauty',
  ],
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: 'Glow — Premium Beauty Marketplace',
    description:
      'Find verified makeup artists, hairstylists, and beauty professionals for life\'s biggest moments. Weddings, receptions, photoshoots, and more.',
    url: SITE_URL,
    siteName: 'Glow',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Glow — Premium Beauty Marketplace',
    description: 'Find verified makeup artists, hairstylists, and beauty professionals for life\'s biggest moments.',
  },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
}

const beautyBusinessSchema = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  name: 'Glow',
  description: 'Premium beauty marketplace connecting clients with verified makeup artists, hairstylists, and beauty professionals.',
  url: SITE_URL,
  logo: `${SITE_URL}/icon.png`,
  image: `${SITE_URL}/opengraph-image`,
  telephone: '+977-1-456789',
  applicationCategory: 'LifestyleApplication',
  operatingSystem: 'Web, iOS, Android',
  priceRange: '$$',
  hasOfferCatalog: {
    '@type': 'OfferCatalog',
    name: 'Beauty Services',
    itemListElement: [
      { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Bridal Makeup' } },
      { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Party Makeup' } },
      { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Hair Styling' } },
      { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Photoshoot Makeup' } },
      { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Festival Makeup' } },
      { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'At-Home Beauty Services' } },
    ],
  },
  areaServed: {
    '@type': 'Country',
    name: 'Nepal',
  },
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    email: 'support@glow.app',
    availableLanguage: ['English', 'Nepali'],
  },
  sameAs: [APP_URL],
}

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is Glow?',
      acceptedAnswer: { '@type': 'Answer', text: 'Glow is a premium beauty marketplace that connects you with verified makeup artists, hairstylists, and beauty professionals for weddings, receptions, photoshoots, and every moment that matters.' },
    },
    {
      '@type': 'Question',
      name: 'How does Glow Match work?',
      acceptedAnswer: { '@type': 'Answer', text: 'Glow Match intelligently recommends the best beauty professionals based on your occasion, budget, location, availability, and preferred style. No more scrolling through hundreds of profiles.' },
    },
    {
      '@type': 'Question',
      name: 'Are beauty professionals on Glow verified?',
      acceptedAnswer: { '@type': 'Answer', text: 'Yes. Every beauty professional on Glow undergoes government verification, background checks, portfolio review, and credential validation before joining the platform.' },
    },
    {
      '@type': 'Question',
      name: 'Can I book at-home beauty services?',
      acceptedAnswer: { '@type': 'Answer', text: 'Absolutely. Many of our verified artists offer at-home services for weddings, parties, and special events. You can filter by location and service type when booking.' },
    },
    {
      '@type': 'Question',
      name: 'How do I become a beauty artist on Glow?',
      acceptedAnswer: { '@type': 'Answer', text: 'Join Glow as a beauty professional by completing our verification process. Showcase your portfolio, receive bookings, manage your calendar, and grow your beauty business with us.' },
    },
  ],
}

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
    { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog` },
  ],
}

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        {GA_MEASUREMENT_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_MEASUREMENT_ID}', { anonymize_ip: true });
              `}
            </Script>
          </>
        )}
        <Script
          id="schema-beauty-business"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(beautyBusinessSchema) }}
        />
        <Script
          id="schema-faq"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
        <Script
          id="schema-breadcrumb"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
