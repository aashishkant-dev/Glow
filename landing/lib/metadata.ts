import type { Metadata } from 'next'

// Landing's own canonical domain. MUST be the landing site (not the PWA app at
// glow.app) or canonical/OG/sitemap URLs leak SEO to the wrong domain.
const siteUrl = 'https://ca.glow.app'
const siteName = 'Glow'
const defaultDescription =
  'Connect with verified Providers in Greater Sudbury. Fast, safe, and affordable home care starting at $25/hr.'

export function buildMetadata({
  title,
  description = defaultDescription,
  path = '',
  image,
}: {
  title?: string
  description?: string
  path?: string
  image?: string
}): Metadata {
  const fullTitle = title ? `${title} | ${siteName}` : `${siteName} — Provider & Home Care Near You in Sudbury`
  const url = `${siteUrl}${path}`
  const ogImage = image || `${siteUrl}/og-image.png`

  return {
    title: fullTitle,
    description,
    metadataBase: new URL(siteUrl),
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: fullTitle,
      description,
      url,
      siteName,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: fullTitle,
        },
      ],
      locale: 'en_CA',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: [ogImage],
    },
  }
}

// LocalBusiness (not generic Organization) so Google understands this is a
// Sudbury-area home-care provider — improves local pack + rich-result eligibility.
export const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'HomeHealthCareService',
  '@id': `${siteUrl}/#business`,
  name: 'Glow',
  url: siteUrl,
  logo: `${siteUrl}/logo.png`,
  image: `${siteUrl}/og-image.png`,
  description: defaultDescription,
  priceRange: '$25/hr',
  currenciesAccepted: 'CAD',
  areaServed: {
    '@type': 'City',
    name: 'Greater Sudbury',
  },
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Greater Sudbury',
    addressRegion: 'ON',
    addressCountry: 'CA',
  },
  geo: {
    '@type': 'GeoCoordinates',
    latitude: 46.4917,
    longitude: -80.993,
  },
  openingHoursSpecification: {
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    opens: '00:00',
    closes: '23:59',
  },
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer service',
    email: 'support@glow.app',
    areaServed: 'CA',
    availableLanguage: ['English', 'French'],
  },
  // Only real profiles — dead social URLs hurt entity trust with Google.
  sameAs: ['https://glow.app'],
}

export { siteUrl, siteName }
