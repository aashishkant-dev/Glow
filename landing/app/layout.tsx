import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'

const SITE_URL = 'https://ca.glow.app'
const APP_URL  = 'https://glow.app'

export const metadata: Metadata = {
  title: {
    default: 'Glow — Provider & Home Care Near You in Greater Sudbury | $25/hr',
    template: '%s | Glow',
  },
  description:
    'Browse and book a verified Personal Support Worker near you in Greater Sudbury in minutes. You choose, we verify — police-checked, bilingual EN/FR, $25/hr flat rate. No agency fees.',
  keywords: [
    'Provider near me',
    'home care near me',
    'caregiver near me',
    'Provider Sudbury',
    'home care Sudbury',
    'personal support worker Sudbury Ontario',
    'Greater Sudbury home care',
    'caregiver Sudbury',
    'senior care Sudbury',
    'in-home care Ontario',
    'Provider near me Sudbury',
    'affordable home care Greater Sudbury',
    'book Provider online Ontario',
    'Glow',
  ],
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: 'Glow — Find Verified Caregivers in Greater Sudbury',
    description:
      'Browse and book a verified Provider near you in Greater Sudbury in minutes. You choose, we verify. $25/hr flat.',
    url: SITE_URL,
    siteName: 'Glow',
    locale: 'en_CA',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Glow — Find Verified Caregivers in Greater Sudbury',
    description: 'Browse and book a verified Provider near you in Greater Sudbury in minutes. $25/hr flat.',
  },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  // Icons served from real files (app/favicon.ico, app/icon.png, app/apple-icon.png)
  // — Next.js emits the link tags automatically. Google ignores data-URI favicons,
  // which is why search results used to show a generic globe.
}

const localBusinessSchema = {
  '@context': 'https://schema.org',
  '@type': 'HomeHealthCareService',
  name: 'Glow',
  description: 'On-demand verified Personal Support Worker (Provider) booking platform serving Greater Sudbury, Ontario.',
  url: SITE_URL,
  logo: `${SITE_URL}/icon.png`,
  image: `${SITE_URL}/opengraph-image`,
  telephone: '+1-647-620-9243',
  applicationCategory: 'HealthApplication',
  operatingSystem: 'Web, iOS, Android',
  installUrl: 'https://apps.apple.com/ca/app/glow/id6779246235',
  priceRange: '$25–$200',
  medicalSpecialty: 'PersonalCareServices',
  hasOfferCatalog: {
    '@type': 'OfferCatalog',
    name: 'Provider Home Care Services',
    itemListElement: [
      { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Personal Care' } },
      { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Companionship' } },
      { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Meal Preparation' } },
      { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Medication Reminders' } },
      { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Light Housekeeping' } },
      { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Mobility Assistance' } },
      { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Post-Surgery Support' } },
    ],
  },
  offers: {
    '@type': 'Offer',
    price: '25',
    priceCurrency: 'CAD',
    description: 'Hourly rate for verified Provider home care visits',
  },
  areaServed: [
    {
      '@type': 'City',
      name: 'Greater Sudbury',
      containedIn: { '@type': 'AdministrativeArea', name: 'Ontario, Canada' },
    },
    {
      '@type': 'Place',
      name: 'Sudbury',
      geo: { '@type': 'GeoCoordinates', latitude: 46.4917, longitude: -80.9930 },
    },
    {
      '@type': 'Place',
      name: 'Hanmer',
      geo: { '@type': 'GeoCoordinates', latitude: 46.5619, longitude: -80.9550 },
    },
    {
      '@type': 'Place',
      name: 'Valley East',
      geo: { '@type': 'GeoCoordinates', latitude: 46.5186, longitude: -81.1236 },
    },
    {
      '@type': 'Place',
      name: 'Capreol',
      geo: { '@type': 'GeoCoordinates', latitude: 46.7458, longitude: -81.0164 },
    },
    {
      '@type': 'Place',
      name: 'Lively',
      geo: { '@type': 'GeoCoordinates', latitude: 46.4500, longitude: -81.1500 },
    },
    {
      '@type': 'Place',
      name: 'Copper Cliff',
      geo: { '@type': 'GeoCoordinates', latitude: 46.4633, longitude: -81.0550 },
    },
    {
      '@type': 'Place',
      name: 'Coniston',
      geo: { '@type': 'GeoCoordinates', latitude: 46.4828, longitude: -80.8500 },
    },
  ],
  serviceArea: {
    '@type': 'GeoCircle',
    geoMidpoint: { '@type': 'GeoCoordinates', latitude: 46.4917, longitude: -80.9930 },
    geoRadius: '15000',
  },
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Greater Sudbury',
    addressRegion: 'ON',
    addressCountry: 'CA',
  },
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    email: 'support@glow.app',
    availableLanguage: ['English', 'French'],
  },
  // Only real profiles here — Google cross-checks sameAs links, and dead
  // social URLs hurt entity trust. Add socials once the accounts exist.
  sameAs: [APP_URL],
}

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: SITE_URL,
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Blog',
      item: `${SITE_URL}/blog`,
    },
  ],
}

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'How do I find a Provider near me in Sudbury?',
      acceptedAnswer: { '@type': 'Answer', text: 'Open glow.app, enter your address, and browse verified Providers near you — sorted by distance, with photos, credentials, and reviews. Every caregiver serves Greater Sudbury within 15 km.' },
    },
    {
      '@type': 'Question',
      name: 'How much does Glow cost?',
      acceptedAnswer: { '@type': 'Answer', text: 'Glow charges a flat $25/hr with a 3-hour minimum booking. No agency fees or hidden charges.' },
    },
    {
      '@type': 'Question',
      name: 'Are Providers on Glow verified?',
      acceptedAnswer: { '@type': 'Answer', text: 'Yes. Every Provider undergoes a police record check, government ID verification, credential check, and reference review before joining.' },
    },
    {
      '@type': 'Question',
      name: 'How fast can I book a Provider in Sudbury?',
      acceptedAnswer: { '@type': 'Answer', text: 'Most bookings are confirmed the same day — often within the hour. On-demand bookings can be fulfilled the same day.' },
    },
    {
      '@type': 'Question',
      name: 'Do I choose my Provider or are they matched for me?',
      acceptedAnswer: { '@type': 'Answer', text: 'You browse verified Provider profiles and choose who books your care. Glow handles all the verification; you handle the selection.' },
    },
    {
      '@type': 'Question',
      name: 'Which Sudbury neighbourhoods do you serve?',
      acceptedAnswer: { '@type': 'Answer', text: 'We serve all of Greater Sudbury including Sudbury, Hanmer, Valley East, Capreol, Lively, Coniston, and Copper Cliff within a 15 km radius.' },
    },
  ],
}

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA" className="scroll-smooth">
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
          id="schema-local-business"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }}
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
