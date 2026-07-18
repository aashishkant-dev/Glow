import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import Hero from '@/components/sections/Hero'
import Trust from '@/components/sections/Trust'
import HowItWorks from '@/components/sections/HowItWorks'
import Features from '@/components/sections/Features'
import ServiceAreas from '@/components/sections/ServiceAreas'
import Directory from '@/components/sections/Directory'
import Pricing from '@/components/sections/Pricing'
import Safety from '@/components/sections/Safety'
import Testimonials from '@/components/sections/Testimonials'
import CaregiverCTA from '@/components/sections/CaregiverCTA'
import FAQ from '@/components/sections/FAQ'
import Contact from '@/components/sections/Contact'
import FinalCTA from '@/components/sections/FinalCTA'
import StickyCallBar from '@/components/StickyCallBar'

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Trust />
        <HowItWorks />
        <Features />
        <ServiceAreas />
        <Directory />
        <Pricing />
        <Safety />
        <Testimonials />
        <CaregiverCTA />
        <FAQ />
        <Contact />
        <FinalCTA />
      </main>
      <Footer />
      <StickyCallBar />
    </>
  )
}
