import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import Hero from '@/components/sections/Hero'
import Occasions from '@/components/sections/Occasions'
import HowItWorks from '@/components/sections/HowItWorks'
import GlowMatch from '@/components/sections/GlowMatch'
import TrendingLooks from '@/components/sections/TrendingLooks'
import WhyGlow from '@/components/sections/WhyGlow'
import ArtistPortfolios from '@/components/sections/ArtistPortfolios'
import TrustSection from '@/components/sections/TrustSection'
import Testimonials from '@/components/sections/Testimonials'
import ArtistCTA from '@/components/sections/ArtistCTA'
import BeautyJourney from '@/components/sections/BeautyJourney'
import Community from '@/components/sections/Community'
import FAQ from '@/components/sections/FAQ'
import FinalCTA from '@/components/sections/FinalCTA'

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Occasions />
        <HowItWorks />
        <GlowMatch />
        <TrendingLooks />
        <WhyGlow />
        <ArtistPortfolios />
        <TrustSection />
        <Testimonials />
        <ArtistCTA />
        <BeautyJourney />
        <Community />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </>
  )
}
